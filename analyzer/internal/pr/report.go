// Package pr turns "the city at the base commit" plus "what this pull request
// changes" into a risk report: which burning buildings were touched, whose
// districts the author is wandering into, and where the bus factor is one.
package pr

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/model"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/repo"
)

// Change is one file in the PR annotated with what the base city knows.
type Change struct {
	Path     string   `json:"path"`
	Status   string   `json:"status"` // added, modified, deleted, renamed
	Added    int      `json:"added"`
	Deleted  int      `json:"deleted"`
	Lines    int      `json:"lines"` // at base
	Commits  int      `json:"commits"`
	BugFixes int      `json:"bugFixes"`
	Fire     int      `json:"fire"`
	Hotspot  float64  `json:"hotspot"`
	Owners   []string `json:"owners"` // display names, top first
	Ghost    bool     `json:"ghost,omitempty"`
	Bus      int      `json:"bus"` // of the file's district
	Crossing bool     `json:"crossing,omitempty"`
}

// Report is the whole PR assessment.
type Report struct {
	Repo      string   `json:"repo"`
	Base      string   `json:"base"`
	Head      string   `json:"head"`
	Author    string   `json:"author,omitempty"`
	Changes   []Change `json:"changes"`
	Burning   []Change `json:"burning"`   // touched hotspots, hottest first
	Crossings []Change `json:"crossings"` // files mostly owned by someone else
	BusOne    []string `json:"busOne"`    // districts touched with bus factor 1
	Ghosts    []Change `json:"ghosts"`
	Reviewers []string `json:"reviewers"` // suggested from crossings
	Risk      string   `json:"risk"`      // low, medium, high
	Score     int      `json:"score"`     // 0..100
	Added     int      `json:"added"`
	Deleted   int      `json:"deleted"`
}

// Build assembles the report. authorKey matches commits' author identity
// (login or name) so ownership crossings can be detected; empty disables it.
func Build(base *model.City, diff []repo.DiffEntry, headSHA, authorKey string) Report {
	byPath := map[string]*model.File{}
	for i := range base.Files {
		f := &base.Files[i]
		if !f.Removed {
			byPath[f.Path] = f
		}
	}
	rep := Report{Repo: base.Repo.Name, Base: base.Repo.Head, Head: headSHA, Author: authorKey}
	reviewerVotes := map[string]int{}
	busDirs := map[string]bool{}
	for _, d := range diff {
		if d.Binary {
			continue
		}
		c := Change{Path: d.Path, Added: d.Added, Deleted: d.Deleted, Status: statusWord(d.Status)}
		rep.Added += d.Added
		rep.Deleted += d.Deleted
		key := d.Path
		if d.Status == 'R' || d.Status == 'C' {
			key = d.OldPath
		}
		if f := byPath[key]; f != nil && d.Status != 'A' {
			c.Lines, c.Commits, c.BugFixes, c.Fire, c.Hotspot, c.Ghost = f.Lines, f.Commits, f.BugFixes, f.Fire, f.Hotspot, f.Ghost
			if f.Dir >= 0 && f.Dir < len(base.Dirs) {
				dir := base.Dirs[f.Dir]
				c.Bus = dir.Bus
				if dir.Bus == 1 && dir.Files >= 2 {
					busDirs[dir.Path] = true
				}
			}
			for _, o := range f.Owners {
				a := base.Authors[o.Author]
				c.Owners = append(c.Owners, displayName(a))
			}
			if authorKey != "" && len(f.Owners) > 0 {
				top := base.Authors[f.Owners[0].Author]
				if f.Owners[0].Share >= 0.5 && !sameAuthor(top, authorKey) {
					c.Crossing = true
					// Owners of busy files make better reviewers than owners of a stray doc.
					reviewerVotes[displayName(top)] += 1 + f.Commits
				}
			}
		}
		rep.Changes = append(rep.Changes, c)
	}
	for _, c := range rep.Changes {
		if c.Fire > 0 {
			rep.Burning = append(rep.Burning, c)
		}
		if c.Crossing {
			rep.Crossings = append(rep.Crossings, c)
		}
		if c.Ghost {
			rep.Ghosts = append(rep.Ghosts, c)
		}
	}
	sort.SliceStable(rep.Burning, func(i, j int) bool {
		if rep.Burning[i].Fire != rep.Burning[j].Fire {
			return rep.Burning[i].Fire > rep.Burning[j].Fire
		}
		return rep.Burning[i].Hotspot > rep.Burning[j].Hotspot
	})
	for d := range busDirs {
		rep.BusOne = append(rep.BusOne, d)
	}
	sort.Strings(rep.BusOne)
	type kv struct {
		k string
		v int
	}
	var rv []kv
	for k, v := range reviewerVotes {
		rv = append(rv, kv{k, v})
	}
	sort.Slice(rv, func(i, j int) bool { return rv[i].v > rv[j].v || (rv[i].v == rv[j].v && rv[i].k < rv[j].k) })
	for i, e := range rv {
		if i == 3 {
			break
		}
		rep.Reviewers = append(rep.Reviewers, e.k)
	}

	// Score: hotspots dominate, then size, then knowledge risk.
	score := 0.0
	for _, c := range rep.Burning {
		score += float64(c.Fire) * 12
	}
	score += math.Min(25, float64(rep.Added+rep.Deleted)/40)
	score += math.Min(15, float64(len(rep.BusOne))*8)
	score += math.Min(10, float64(len(rep.Ghosts))*5)
	score += math.Min(10, float64(len(rep.Crossings))*3)
	rep.Score = int(math.Min(100, math.Round(score)))
	switch {
	case rep.Score >= 50:
		rep.Risk = "high"
	case rep.Score >= 20:
		rep.Risk = "medium"
	default:
		rep.Risk = "low"
	}
	return rep
}

// Markdown renders the sticky PR comment.
func Markdown(r Report, cityURL string) string {
	var b strings.Builder
	b.WriteString("<!-- codeskyline-pr -->\n")
	fmt.Fprintf(&b, "### 🏙️ CodeSkyline · risk **%s** (%d/100)\n\n", r.Risk, r.Score)
	fmt.Fprintf(&b, "%d files · +%d −%d", len(r.Changes), r.Added, r.Deleted)
	if cityURL != "" {
		fmt.Fprintf(&b, " · [open the city](%s)", cityURL)
	}
	b.WriteString("\n\n")

	if len(r.Burning) > 0 {
		b.WriteString("**🔥 Hotspots touched** — these files change often and are complex; their bug-fix history is shown:\n\n")
		b.WriteString("| file | heat | commits | bug fixes | owners |\n|---|---|---|---|---|\n")
		for i, c := range r.Burning {
			if i == 10 {
				fmt.Fprintf(&b, "| …and %d more | | | | |\n", len(r.Burning)-10)
				break
			}
			fmt.Fprintf(&b, "| `%s` | %s | %d | %d | %s |\n", c.Path, flames(c.Fire), c.Commits, c.BugFixes, strings.Join(firstN(c.Owners, 2), ", "))
		}
		b.WriteString("\n")
	} else {
		b.WriteString("✅ No hotspot files touched.\n\n")
	}

	if len(r.BusOne) > 0 {
		fmt.Fprintf(&b, "**🚌 Bus factor 1** in %s — one person holds the knowledge here; consider a second reviewer.\n\n", codeList(r.BusOne))
	}
	if len(r.Crossings) > 0 {
		b.WriteString("**🗺️ Ownership crossings** — files mostly written by someone else")
		if len(r.Reviewers) > 0 {
			fmt.Fprintf(&b, "; suggested reviewers: %s", strings.Join(r.Reviewers, ", "))
		}
		b.WriteString(":\n\n")
		for i, c := range r.Crossings {
			if i == 8 {
				fmt.Fprintf(&b, "- …and %d more\n", len(r.Crossings)-8)
				break
			}
			fmt.Fprintf(&b, "- `%s` (%s)\n", c.Path, firstN(c.Owners, 1)[0])
		}
		b.WriteString("\n")
	}
	if len(r.Ghosts) > 0 {
		var ps []string
		for _, c := range r.Ghosts {
			ps = append(ps, c.Path)
		}
		fmt.Fprintf(&b, "**👻 Ghost town** — nobody active still owns %s. Tread carefully and add tests.\n\n", codeList(firstN(ps, 5)))
	}
	b.WriteString("<sub>Hotspots = recent churn × complexity at the merge base (bug-fix counts shown for context). Generated by [CodeSkyline](https://github.com/harshitaajoshi/codeskyline).</sub>\n")
	return b.String()
}

func flames(level int) string {
	switch level {
	case 3:
		return "🔥🔥🔥 inferno"
	case 2:
		return "🔥🔥 flames"
	case 1:
		return "🔥 smoke"
	}
	return "—"
}

func statusWord(s byte) string {
	switch s {
	case 'A':
		return "added"
	case 'D':
		return "deleted"
	case 'R':
		return "renamed"
	case 'C':
		return "copied"
	}
	return "modified"
}

func displayName(a model.Author) string {
	if a.Login != "" {
		return "@" + a.Login
	}
	return a.Name
}

// sameAuthor matches an author against a comma-separated list of identities
// (login, name, emails) — the Action passes the PR author's login plus the
// author emails of the PR's own commits.
func sameAuthor(a model.Author, keys string) bool {
	for _, key := range strings.Split(keys, ",") {
		k := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(key, "@")))
		if k == "" {
			continue
		}
		if strings.ToLower(a.Login) == k || strings.ToLower(a.Name) == k || strings.ToLower(a.Email) == k {
			return true
		}
	}
	return false
}

func firstN(s []string, n int) []string {
	if len(s) == 0 {
		return []string{"—"}
	}
	if len(s) > n {
		return s[:n]
	}
	return s
}

func codeList(s []string) string {
	out := make([]string, len(s))
	for i, x := range s {
		if x == "" {
			x = "(root)"
		}
		out[i] = "`" + x + "`"
	}
	return strings.Join(out, ", ")
}
