// csky-worker runs the analyzer behind HTTP inside the hosted service's
// container. The Cloudflare Worker drives it:
//
//	POST /analyze          {id,url,name,maxCommits} → NDJSON progress lines,
//	                       ending in {"done":true,...} or {"error":"..."}
//	GET  /result/{id}      the gzipped city.json produced by that job
//	DELETE /result/{id}    free the disk once it has been copied to R2
//	GET  /healthz
//
// One analysis runs at a time; the Worker's queue controls concurrency.
package main

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/analyze"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/repo"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/skyline"
)

var idRe = regexp.MustCompile(`^[A-Za-z0-9._-]{1,160}$`)

const (
	jobTimeout = 20 * time.Minute
	maxBodyLen = 64 << 10
)

type server struct {
	dir    string
	secret string
	mu     sync.Mutex // one analysis at a time
}

type analyzeRequest struct {
	ID         string `json:"id"`
	URL        string `json:"url"`
	Name       string `json:"name"`
	MaxCommits int    `json:"maxCommits"`
}

func main() {
	dir := envOr("CSKY_JOB_DIR", filepath.Join(os.TempDir(), "csky-jobs"))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		log.Fatal(err)
	}
	s := &server{dir: dir, secret: os.Getenv("CSKY_SECRET")}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })
	mux.HandleFunc("POST /analyze", s.auth(s.analyze))
	mux.HandleFunc("GET /result/{id}", s.auth(s.result))
	mux.HandleFunc("DELETE /result/{id}", s.auth(s.remove))
	addr := ":" + envOr("PORT", "8080")
	log.Printf("csky-worker listening on %s (jobs in %s)", addr, dir)
	log.Fatal(http.ListenAndServe(addr, mux))
}

// auth enforces the shared secret when one is configured. Inside Cloudflare
// the container is only reachable from the Worker, so this is belt and braces.
func (s *server) auth(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.secret != "" && r.Header.Get("X-CSky-Secret") != s.secret {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		h(w, r)
	}
}

func (s *server) analyze(w http.ResponseWriter, r *http.Request) {
	var req analyzeRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyLen)).Decode(&req); err != nil {
		http.Error(w, "bad json: "+err.Error(), http.StatusBadRequest)
		return
	}
	owner, name, ok := repo.ParseGitHubURL(req.URL)
	if !ok || !idRe.MatchString(req.ID) {
		http.Error(w, "bad id or url", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		req.Name = owner + "/" + name
	}
	if !s.mu.TryLock() {
		http.Error(w, "busy", http.StatusConflict)
		return
	}
	defer s.mu.Unlock()

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)
	var emitMu sync.Mutex
	emit := func(v any) {
		emitMu.Lock()
		defer emitMu.Unlock()
		_ = json.NewEncoder(w).Encode(v)
		if flusher != nil {
			flusher.Flush()
		}
	}
	fail := func(err error) {
		log.Printf("job %s failed: %v", req.ID, err)
		emit(map[string]any{"error": err.Error()})
	}

	ctx, cancel := context.WithTimeout(r.Context(), jobTimeout)
	defer cancel()
	start := time.Now()
	progress := func(stage, detail string) {
		emit(map[string]any{"stage": stage, "detail": detail, "elapsed": time.Since(start).Seconds()})
	}

	cloneDir, err := os.MkdirTemp("", "csky-clone-*")
	if err != nil {
		fail(err)
		return
	}
	defer os.RemoveAll(cloneDir)

	url := "https://github.com/" + owner + "/" + name
	progress("clone", url)
	rp, err := repo.Clone(ctx, url+".git", cloneDir)
	if err != nil {
		fail(err)
		return
	}
	city, err := analyze.Run(ctx, rp, analyze.Options{Name: req.Name, URL: url, MaxCommits: req.MaxCommits, Progress: progress})
	if err != nil {
		fail(err)
		return
	}

	progress("encode", "writing city")
	out := filepath.Join(s.dir, req.ID+".json.gz")
	n, err := writeGz(out, city)
	if err != nil {
		fail(err)
		return
	}
	emit(map[string]any{
		"done":    true,
		"bytes":   n,
		"elapsed": time.Since(start).Seconds(),
		"summary": skyline.Summarize(city),
	})
}

func writeGz(path string, v any) (int64, error) {
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return 0, err
	}
	gz, _ := gzip.NewWriterLevel(f, gzip.BestCompression)
	if err := json.NewEncoder(gz).Encode(v); err != nil {
		_ = f.Close()
		return 0, err
	}
	if err := errors.Join(gz.Close(), f.Close()); err != nil {
		return 0, err
	}
	if err := os.Rename(tmp, path); err != nil {
		return 0, err
	}
	st, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	return st.Size(), nil
}

func (s *server) result(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !idRe.MatchString(id) {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	path := filepath.Join(s.dir, id+".json.gz")
	f, err := os.Open(path)
	if err != nil {
		http.Error(w, "no such result", http.StatusNotFound)
		return
	}
	defer f.Close()
	st, _ := f.Stat()
	// Raw gzip bytes, deliberately not declared as Content-Encoding so the
	// Worker stores them in R2 as-is and lets browsers decode later.
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", fmt.Sprint(st.Size()))
	http.ServeContent(w, r, "", st.ModTime(), f)
}

func (s *server) remove(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !idRe.MatchString(id) {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	_ = os.Remove(filepath.Join(s.dir, id+".json.gz"))
	w.WriteHeader(http.StatusNoContent)
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
