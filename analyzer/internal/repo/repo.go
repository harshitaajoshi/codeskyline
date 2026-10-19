// Package repo wraps the handful of git plumbing commands the analyzer needs.
// Untrusted repositories are only ever read through plumbing (ls-tree,
// cat-file, check-attr); nothing is checked out and no hooks can run.
package repo

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Repo is an opened git repository (bare or not).
type Repo struct {
	Dir string
}

// Open validates that dir is a git repository.
func Open(ctx context.Context, dir string) (*Repo, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	if _, err := git(ctx, abs, "rev-parse", "--git-dir"); err != nil {
		return nil, fmt.Errorf("repo: %s is not a git repository: %w", dir, err)
	}
	return &Repo{Dir: abs}, nil
}

var githubURL = regexp.MustCompile(`^(?:https?://github\.com/|git@github\.com:)([\w.-]+)/([\w.-]+?)(?:\.git)?/?$`)

// ParseGitHubURL returns owner and name for the accepted GitHub URL forms.
func ParseGitHubURL(url string) (owner, name string, ok bool) {
	m := githubURL.FindStringSubmatch(strings.TrimSpace(url))
	if m == nil {
		return "", "", false
	}
	return m[1], m[2], true
}

// Clone makes a bare, single-branch clone of url into dest. Bare clones never
// write a working tree, so symlinks and hooks in the repository are inert.
func Clone(ctx context.Context, url, dest string) (*Repo, error) {
	cmd := exec.CommandContext(ctx, "git",
		"-c", "protocol.file.allow=never",
		"-c", "protocol.ext.allow=never",
		"clone", "--bare", "--single-branch", "--no-tags", "--quiet", url, dest)
	cmd.Env = append(cmd.Environ(), "GIT_TERMINAL_PROMPT=0")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("repo: clone failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return &Repo{Dir: dest}, nil
}

// Head returns the HEAD commit hash.
func (r *Repo) Head(ctx context.Context) (string, error) {
	return r.Resolve(ctx, "HEAD")
}

// Resolve turns any revision (branch, tag, sha prefix) into a full commit hash.
func (r *Repo) Resolve(ctx context.Context, rev string) (string, error) {
	out, err := git(ctx, r.Dir, "rev-parse", "--verify", rev+"^{commit}")
	return strings.TrimSpace(out), err
}

// DiffEntry is one file changed between two commits.
type DiffEntry struct {
	Status  byte // A, M, D, R, C, T
	OldPath string
	Path    string
	Added   int
	Deleted int
	Binary  bool
}

// Diff lists the files changed from base to head (three-dot: head relative to
// the merge base, which is what a pull request shows).
func (r *Repo) Diff(ctx context.Context, base, head string) ([]DiffEntry, error) {
	out, err := git(ctx, r.Dir, "diff", "--numstat", "-M", "-z", "--find-renames", base+"..."+head)
	if err != nil {
		return nil, err
	}
	status, err := git(ctx, r.Dir, "diff", "--name-status", "-M", "-z", base+"..."+head)
	if err != nil {
		return nil, err
	}
	// name-status: "<status>\0<path>\0" or "R<score>\0<old>\0<new>\0"
	byPath := map[string]int{} // indices: entries is appended to below
	var entries []DiffEntry
	tok := strings.Split(status, "\x00")
	for i := 0; i < len(tok); {
		st := tok[i]
		if st == "" {
			i++
			continue
		}
		e := DiffEntry{Status: st[0]}
		if (st[0] == 'R' || st[0] == 'C') && i+2 < len(tok) {
			e.OldPath, e.Path = tok[i+1], tok[i+2]
			i += 3
		} else if i+1 < len(tok) {
			e.Path = tok[i+1]
			i += 2
		} else {
			break
		}
		byPath[e.Path] = len(entries)
		entries = append(entries, e)
	}
	// numstat: "added\tdeleted\tpath\0" or "added\tdeleted\t\0old\0new\0"
	tok = strings.Split(out, "\x00")
	for i := 0; i < len(tok); {
		line := tok[i]
		if line == "" {
			i++
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) != 3 {
			i++
			continue
		}
		path := parts[2]
		if path == "" && i+2 < len(tok) {
			path = tok[i+2]
			i += 3
		} else {
			i++
		}
		idx, ok := byPath[path]
		if !ok {
			continue
		}
		e := &entries[idx]
		if parts[0] == "-" {
			e.Binary = true
			continue
		}
		e.Added, _ = strconv.Atoi(parts[0])
		e.Deleted, _ = strconv.Atoi(parts[1])
	}
	return entries, nil
}

// CommitBefore returns the newest first-parent commit of rev authored at or
// before t.
func (r *Repo) CommitBefore(ctx context.Context, rev string, t time.Time) (string, error) {
	out, err := git(ctx, r.Dir, "rev-list", "-1", "--first-parent", "--before="+t.UTC().Format(time.RFC3339), rev)
	if err != nil {
		return "", err
	}
	sha := strings.TrimSpace(out)
	if sha == "" {
		return "", fmt.Errorf("no commit before %s", t.Format(time.RFC3339))
	}
	return sha, nil
}

// MergeBase returns the best common ancestor of a and b.
func (r *Repo) MergeBase(ctx context.Context, a, b string) (string, error) {
	out, err := git(ctx, r.Dir, "merge-base", a, b)
	return strings.TrimSpace(out), err
}

// CountCommits returns the number of first-parent commits reachable from rev.
func (r *Repo) CountCommits(ctx context.Context, rev string) (int, error) {
	out, err := git(ctx, r.Dir, "rev-list", "--count", "--first-parent", rev)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(out))
}

// DefaultBranch returns the short name HEAD points at, or "" when detached.
func (r *Repo) DefaultBranch(ctx context.Context) string {
	out, err := git(ctx, r.Dir, "symbolic-ref", "--short", "-q", "HEAD")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

// Entry is one blob in the HEAD tree.
type Entry struct {
	Path string
	SHA  string
	Size int64
}

// ListTree returns every regular-file blob at rev. Symlinks (mode 120000) and
// submodules (type commit) are skipped.
func (r *Repo) ListTree(ctx context.Context, rev string) ([]Entry, error) {
	out, err := git(ctx, r.Dir, "ls-tree", "-r", "-l", "-z", rev)
	if err != nil {
		return nil, err
	}
	var entries []Entry
	for _, rec := range strings.Split(out, "\x00") {
		if rec == "" {
			continue
		}
		// "<mode> <type> <sha> <size>\t<path>"  (size is "-" for non-blobs)
		meta, path, ok := strings.Cut(rec, "\t")
		if !ok {
			continue
		}
		f := strings.Fields(meta)
		if len(f) != 4 || f[1] != "blob" || f[0] == "120000" {
			continue
		}
		size, _ := strconv.ParseInt(f[3], 10, 64)
		entries = append(entries, Entry{Path: path, SHA: f[2], Size: size})
	}
	return entries, nil
}

// CatBlobs streams the contents of the given blobs through fn, in order.
// The content slice is only valid during the callback.
func (r *Repo) CatBlobs(ctx context.Context, shas []string, fn func(sha string, content []byte) error) error {
	if len(shas) == 0 {
		return nil
	}
	cmd := exec.CommandContext(ctx, "git", "-C", r.Dir, "cat-file", "--batch")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() {
		w := bufio.NewWriter(stdin)
		for _, s := range shas {
			_, _ = w.WriteString(s)
			_ = w.WriteByte('\n')
		}
		_ = w.Flush()
		_ = stdin.Close()
	}()

	rd := bufio.NewReaderSize(stdout, 1<<20)
	var buf []byte
	for i := 0; i < len(shas); i++ {
		hdr, err := rd.ReadString('\n')
		if err != nil {
			_ = cmd.Process.Kill()
			return fmt.Errorf("repo: cat-file header: %w", err)
		}
		f := strings.Fields(hdr)
		if len(f) == 2 && f[1] == "missing" {
			if err := fn(f[0], nil); err != nil {
				_ = cmd.Process.Kill()
				return err
			}
			continue
		}
		if len(f) != 3 {
			_ = cmd.Process.Kill()
			return fmt.Errorf("repo: unexpected cat-file header %q", hdr)
		}
		size, _ := strconv.Atoi(f[2])
		if cap(buf) < size {
			buf = make([]byte, size)
		}
		buf = buf[:size]
		if _, err := io.ReadFull(rd, buf); err != nil {
			_ = cmd.Process.Kill()
			return fmt.Errorf("repo: cat-file body: %w", err)
		}
		_, _ = rd.ReadByte() // trailing newline
		if err := fn(f[0], buf); err != nil {
			_ = cmd.Process.Kill()
			return err
		}
	}
	return cmd.Wait()
}

// Attrs holds the linguist overrides from .gitattributes for one path.
type Attrs struct {
	Generated, Vendored *bool // nil when unspecified
}

// CheckAttrs evaluates linguist-generated / linguist-vendored for each path
// against the .gitattributes in rev. Returns a map containing only paths with
// at least one attribute set.
func (r *Repo) CheckAttrs(ctx context.Context, rev string, paths []string) (map[string]Attrs, error) {
	result := map[string]Attrs{}
	if len(paths) == 0 {
		return result, nil
	}
	cmd := exec.CommandContext(ctx, "git", "-C", r.Dir,
		"check-attr", "--source="+rev, "-z", "--stdin",
		"linguist-generated", "linguist-vendored")
	var in bytes.Buffer
	for _, p := range paths {
		in.WriteString(p)
		in.WriteByte(0)
	}
	cmd.Stdin = &in
	out, err := cmd.Output()
	if err != nil {
		// Older git lacks --source; attributes are best-effort.
		return result, nil
	}
	rec := bytes.Split(out, []byte{0})
	for i := 0; i+2 < len(rec); i += 3 {
		path, attr, val := string(rec[i]), string(rec[i+1]), string(rec[i+2])
		var b *bool
		switch val {
		case "set", "true":
			t := true
			b = &t
		case "unset", "false":
			f := false
			b = &f
		default:
			continue
		}
		a := result[path]
		if attr == "linguist-generated" {
			a.Generated = b
		} else {
			a.Vendored = b
		}
		result[path] = a
	}
	return result, nil
}

func git(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", dir}, args...)...)
	cmd.Env = append(cmd.Environ(), "GIT_TERMINAL_PROMPT=0")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("git %s: %w: %s", args[0], err, strings.TrimSpace(stderr.String()))
	}
	return string(out), nil
}

// TempDir creates a scratch directory for clones.
func TempDir() (string, error) {
	return os.MkdirTemp("", "csky-clone-*")
}
