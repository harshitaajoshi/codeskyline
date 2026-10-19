// Package analyze is the pipeline: git history → per-file metrics → layout →
// City document. It is shared by the CLI, the hosted worker and the GitHub
// Action so all three produce byte-identical output for the same commit.
package analyze

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/gitlog"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/layout"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/metrics"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/model"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/repo"
)

// Options tune one run.
type Options struct {
	Name         string // display name, e.g. "facebook/react"
	URL          string
	MaxCommits   int   // cap on first-parent commits walked; 0 = all
	MaxFileBytes int64 // files larger than this are not read for counting
	RecentWindow int64 // seconds; defaults to 365 days
	Now          int64 // analysis timestamp; defaults to time.Now
	// Progress receives human-readable stage updates.
	Progress func(stage, detail string)
}

func (o *Options) defaults() {
	if o.MaxFileBytes == 0 {
		o.MaxFileBytes = 4 << 20
	}
	if o.RecentWindow == 0 {
		o.RecentWindow = 365 * 24 * 3600
	}
	if o.Now == 0 {
		o.Now = time.Now().Unix()
	}
	if o.Progress == nil {
		o.Progress = func(string, string) {}
	}
}

// fileAgg accumulates history for one logical file across renames.
type fileAgg struct {
	id      int
	path    string
	deleted bool

	commits, recent, bugFixes int
	added, deleted_           int64
	recentChurn               int
	created, last             int64
	running                   int // numstat running line total
	binary                    bool
	authors                   map[int]float64 // author index → decayed weight
}

// Run analyzes r and returns its City.
func Run(ctx context.Context, r *repo.Repo, opt Options) (*model.City, error) {
	opt.defaults()
	head, err := r.Head(ctx)
	if err != nil {
		return nil, err
	}
	lastTime, err := commitTime(ctx, r, head)
	if err != nil {
		return nil, err
	}
	recentSince := lastTime - opt.RecentWindow

	// --- Pass 1: history -------------------------------------------------
	opt.Progress("history", "walking first-parent commits")
	var (
		aggs      []*fileAgg
		byPath    = map[string]*fileAgg{}
		authors   []model.Author
		authorIdx = map[string]int{}
		commits   int
		firstTime int64
	)
	ensure := func(p string) *fileAgg {
		if a, ok := byPath[p]; ok {
			return a
		}
		a := &fileAgg{id: len(aggs), path: p, authors: map[int]float64{}}
		aggs = append(aggs, a)
		byPath[p] = a
		return a
	}
	author := func(c *gitlog.Commit) int {
		key := metrics.IdentityKey(c.Author, c.Email)
		if i, ok := authorIdx[key]; ok {
			return i
		}
		i := len(authors)
		authorIdx[key] = i
		authors = append(authors, model.Author{
			Name: c.Author, Email: c.Email, Login: metrics.GitHubLogin(c.Email),
			FirstSeen: c.Time, LastSeen: c.Time,
		})
		return i
	}

	err = gitlog.Walk(ctx, r.Dir, gitlog.Options{Rev: head, MaxCommits: opt.MaxCommits}, func(c *gitlog.Commit) error {
		commits++
		if firstTime == 0 || c.Time < firstTime {
			firstTime = c.Time
		}
		if commits%5000 == 0 {
			opt.Progress("history", fmt.Sprintf("%d commits", commits))
		}
		ai := author(c)
		au := &authors[ai]
		au.Commits++
		if c.Time < au.FirstSeen {
			au.FirstSeen = c.Time
		}
		if c.Time > au.LastSeen {
			au.LastSeen = c.Time
		}
		bug := metrics.IsBugFix(c.Subject, c.Body)
		recent := c.Time >= recentSince
		// Decay relative to first commit; shares are normalized per file so
		// the reference point cancels out and nothing can overflow.
		w := math.Exp2(float64(c.Time-firstTime) / metrics.KnowledgeHalfLife)

		for _, ch := range c.Changes {
			var a *fileAgg
			switch ch.Status {
			case 'R':
				a = byPath[ch.OldPath]
				if a == nil {
					a = ensure(ch.OldPath)
				}
				delete(byPath, ch.OldPath)
				if other, ok := byPath[ch.Path]; ok && other != a {
					other.deleted = true // overwritten by the rename
				}
				byPath[ch.Path] = a
				a.path = ch.Path
			case 'C':
				a = ensure(ch.Path)
			default:
				a = ensure(ch.Path)
			}
			a.deleted = ch.Status == 'D'
			a.commits++
			if a.created == 0 || c.Time < a.created {
				a.created = c.Time
			}
			if c.Time > a.last {
				a.last = c.Time
			}
			if bug {
				a.bugFixes++
			}
			if ch.Binary {
				a.binary = true
			} else {
				a.added += int64(ch.Added)
				a.deleted_ += int64(ch.Deleted)
				a.running += ch.Added - ch.Deleted
				au.Added += int64(ch.Added)
				au.Deleted += int64(ch.Deleted)
				a.authors[ai] += w * (float64(ch.Added) + 0.5*float64(ch.Deleted))
			}
			if recent {
				a.recent++
				a.recentChurn += ch.Added + ch.Deleted
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	truncated := opt.MaxCommits > 0 && commits >= opt.MaxCommits

	// --- Pass 2: files at HEAD ------------------------------------------
	opt.Progress("files", "listing tree")
	entries, err := r.ListTree(ctx, head)
	if err != nil {
		return nil, err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	attrs, _ := r.CheckAttrs(ctx, head, paths(entries))

	files := make([]model.File, len(entries))
	var toRead []string
	readIdx := map[string][]int{} // blob sha → file indices (identical blobs share a sha)
	for i, e := range entries {
		a := byPath[e.Path]
		if a == nil { // history truncated before this file appeared
			a = ensure(e.Path)
		}
		at := attrs[e.Path]
		gen, vend := metrics.Classify(e.Path, at.Generated, at.Vendored)
		f := model.File{
			ID: i, Path: e.Path, Size: e.Size,
			Commits: a.commits, RecentCommits: a.recent, Added: a.added, Deleted: a.deleted_,
			Created: a.created, LastTouched: a.last, BugFixes: a.bugFixes,
			Generated: gen, Vendored: vend, Binary: a.binary,
			Owners: toOwners(metrics.TopOwners(a.authors, 3)),
		}
		if e.Size <= opt.MaxFileBytes {
			if _, seen := readIdx[e.SHA]; !seen {
				toRead = append(toRead, e.SHA)
			}
			readIdx[e.SHA] = append(readIdx[e.SHA], i)
		} else {
			f.Lang = "Text"
			f.Lines = max(a.running, 0)
			f.Code = f.Lines
		}
		files[i] = f
	}

	opt.Progress("files", fmt.Sprintf("counting %d files", len(toRead)))
	mismatches := 0
	err = r.CatBlobs(ctx, toRead, func(sha string, content []byte) error {
		loc := metrics.Count("", content) // language is per path below
		for _, i := range readIdx[sha] {
			f := &files[i]
			l := loc
			if !loc.Binary {
				l = metrics.Count(f.Path, content)
			}
			f.Lang, f.Lines, f.Code, f.Comment, f.Blank, f.Complexity = l.Lang, l.Lines, l.Code, l.Comment, l.Blank, l.Complexity
			if l.Binary {
				f.Binary = true
				f.Lang = "Binary"
			}
			if l.Generated || l.Minified {
				f.Generated = true
			}
			if !truncated && !f.Binary {
				if a := byPath[f.Path]; a != nil && a.running != f.Lines {
					mismatches++
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// --- Metrics ---------------------------------------------------------
	opt.Progress("metrics", "scoring hotspots")
	in := make([]metrics.HotspotInput, len(files))
	for i, f := range files {
		in[i] = metrics.HotspotInput{
			RecentCommits: f.RecentCommits, RecentChurn: recentChurn(byPath[f.Path]),
			Complexity: f.Complexity, Commits: f.Commits, BugFixes: f.BugFixes,
			Eligible: !f.Generated && !f.Vendored && !f.Binary && f.Lines > 0,
		}
	}
	scores, fire := metrics.ScoreHotspots(in)
	for i := range files {
		files[i].Hotspot = math.Round(scores[i]*1000) / 1000
		files[i].Fire = fire[i]
	}

	// --- Layout ----------------------------------------------------------
	opt.Progress("layout", "placing districts")
	items := make([]layout.Item, len(files))
	for i, f := range files {
		lines := f.Lines
		if f.Generated || f.Vendored || f.Binary {
			lines = min(lines, 200) // keep lockfiles from eating a district
		}
		items[i] = layout.Item{Path: f.Path, Area: layout.FootprintArea(lines)}
	}
	lay := layout.Place(items)
	dirs := make([]model.Dir, len(lay.Dirs))
	dirIdx := map[string]int{}
	for i, d := range lay.Dirs {
		dirs[i] = model.Dir{ID: i, Path: d.Path, Parent: d.Parent, Depth: d.Depth, Files: d.Leaves, Rect: d.Rect}
		dirIdx[d.Path] = i
	}
	for i := range files {
		f := &files[i]
		f.Rect = lay.Rects[f.Path]
		f.Dir = dirIdx[parentDir(f.Path)]
		for d := f.Dir; d >= 0; d = dirs[d].Parent {
			dirs[d].Lines += f.Lines
		}
	}

	// --- Stats -----------------------------------------------------------
	st := model.Stats{Files: len(files), Dirs: len(dirs), Languages: map[string]int{}, LineMismatches: mismatches}
	for _, f := range files {
		st.Lines += f.Lines
		st.Code += f.Code
		st.MaxLines = max(st.MaxLines, f.Lines)
		st.MaxCommits = max(st.MaxCommits, f.Commits)
		if f.Fire > 0 {
			st.Burning++
		}
		if !f.Binary && !f.Generated && !f.Vendored {
			st.Languages[f.Lang] += f.Lines
		}
	}

	return &model.City{
		Version: model.Version,
		Repo: model.Repo{
			Name: opt.Name, URL: opt.URL, Head: head, DefaultBranch: r.DefaultBranch(ctx),
			AnalyzedAt: opt.Now, Commits: commits, FirstCommit: firstTime, LastCommit: lastTime,
			Truncated: truncated,
		},
		Authors: authors,
		Dirs:    dirs,
		Files:   files,
		Stats:   st,
	}, nil
}

func commitTime(ctx context.Context, r *repo.Repo, rev string) (int64, error) {
	var t int64
	err := gitlog.Walk(ctx, r.Dir, gitlog.Options{Rev: rev, MaxCommits: 1}, func(c *gitlog.Commit) error {
		t = c.Time
		return nil
	})
	return t, err
}

func recentChurn(a *fileAgg) int {
	if a == nil {
		return 0
	}
	return a.recentChurn
}

func toOwners(s []metrics.Share) []model.Owner {
	out := make([]model.Owner, len(s))
	for i, x := range s {
		out[i] = model.Owner{Author: x.Author, Share: x.Share}
	}
	return out
}

func paths(es []repo.Entry) []string {
	out := make([]string, len(es))
	for i, e := range es {
		out[i] = e.Path
	}
	return out
}

func parentDir(p string) string {
	if i := strings.LastIndexByte(p, '/'); i >= 0 {
		return p[:i]
	}
	return ""
}
