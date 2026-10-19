package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"sort"
	"strings"
	"time"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/analyze"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/gitlog"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/metrics"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/model"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/repo"
)

// runValidate implements `csky validate`: does the hotspot score predict
// where bugs will be fixed? We rank files at a commit N months ago, then
// look at which files received bug-fix commits afterwards, and report the
// precision of the top-K against simpler rankings and the base rate.
func runValidate(args []string) int {
	fs := flag.NewFlagSet("validate", flag.ExitOnError)
	var months, top int
	var md bool
	fs.IntVar(&months, "months", 12, "how far back to rank from")
	fs.IntVar(&top, "top", 20, "K for precision@K")
	fs.BoolVar(&md, "md", false, "print a markdown table row")
	positional := parseInterleaved(fs, args)
	if len(positional) != 1 {
		fmt.Fprintln(os.Stderr, "usage: csky validate <path | github url> [--months 12] [--top 20] [--md]")
		return 2
	}
	target := positional[0]

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	start := time.Now()
	progress := func(stage, detail string) {
		fmt.Fprintf(os.Stderr, "[%6.2fs] %-8s %s\n", time.Since(start).Seconds(), stage, detail)
	}

	var r *repo.Repo
	var err error
	name := target
	if owner, repoName, ok := repo.ParseGitHubURL(target); ok {
		name = owner + "/" + repoName
		dir, err := repo.TempDir()
		if err != nil {
			return fail(err)
		}
		defer os.RemoveAll(dir)
		progress("clone", name)
		if r, err = repo.Clone(ctx, "https://github.com/"+name+".git", dir); err != nil {
			return fail(err)
		}
	} else if r, err = repo.Open(ctx, target); err != nil {
		return fail(err)
	}

	head, err := r.Head(ctx)
	if err != nil {
		return fail(err)
	}
	headTime, err := commitUnix(ctx, r, head)
	if err != nil {
		return fail(err)
	}
	cutoff := time.Unix(headTime, 0).AddDate(0, -months, 0)
	then, err := r.CommitBefore(ctx, head, cutoff)
	if err != nil {
		return fail(fmt.Errorf("no commit before %s: %w", cutoff.Format("2006-01-02"), err))
	}
	progress("rank", fmt.Sprintf("city at %s (%s)", then[:10], cutoff.Format("2006-01-02")))
	city, err := analyze.Run(ctx, r, analyze.Options{Name: name, Rev: then, Keyframes: 2, Progress: func(string, string) {}})
	if err != nil {
		return fail(err)
	}

	// Ground truth: files that received a bug-fix commit after the cutoff,
	// tracked across renames from the ranked snapshot.
	progress("truth", "bug-fix commits since then")
	fixed := map[string]bool{}
	touched := map[string]bool{}
	alias := map[string]string{} // current path → path at the snapshot
	err = gitlog.Walk(ctx, r.Dir, gitlog.Options{Rev: then + ".." + head}, func(c *gitlog.Commit) error {
		bug := metrics.IsBugFix(c.Subject, c.Body)
		for _, ch := range c.Changes {
			orig := ch.Path
			if ch.Status == 'R' {
				if o, ok := alias[ch.OldPath]; ok {
					orig = o
				} else {
					orig = ch.OldPath
				}
				alias[ch.Path] = orig
			} else if o, ok := alias[ch.Path]; ok {
				orig = o
			}
			touched[orig] = true
			if bug {
				fixed[orig] = true
			}
		}
		return nil
	})
	if err != nil {
		return fail(err)
	}

	type cand struct {
		f     *model.File
		score float64
	}
	var eligible []*model.File
	for i := range city.Files {
		f := &city.Files[i]
		if f.Removed || f.Generated || f.Vendored || f.Binary || f.Lines == 0 {
			continue
		}
		eligible = append(eligible, f)
	}
	if len(eligible) < top*2 {
		return fail(fmt.Errorf("only %d eligible files; need at least %d", len(eligible), top*2))
	}
	base := 0
	for _, f := range eligible {
		if fixed[f.Path] {
			base++
		}
	}
	baseRate := float64(base) / float64(len(eligible))

	precision := func(score func(*model.File) float64) (float64, int) {
		cs := make([]cand, len(eligible))
		for i, f := range eligible {
			cs[i] = cand{f, score(f)}
		}
		sort.SliceStable(cs, func(i, j int) bool {
			if cs[i].score != cs[j].score {
				return cs[i].score > cs[j].score
			}
			return cs[i].f.Path < cs[j].f.Path
		})
		hit := 0
		for _, c := range cs[:top] {
			if fixed[c.f.Path] {
				hit++
			}
		}
		return float64(hit) / float64(top), hit
	}
	// Rank by the ungated score: File.Hotspot is 0 below the fire gate, which
	// would pad the top-K alphabetically. Same formula, continuous.
	churnPct := percentileOf(eligible, func(f *model.File) float64 { return float64(f.RecentCommits) })
	cplxPct := percentileOf(eligible, func(f *model.File) float64 { return float64(f.Complexity) })
	bugRatio := func(f *model.File) float64 {
		if f.Commits == 0 {
			return 0
		}
		return float64(f.BugFixes) / float64(f.Commits)
	}
	// Candidate formulas, all percentile-based so they are comparable. The
	// first is what the product ships (see docs/benchmarks.md for why).
	variants := []struct {
		name  string
		score func(i int, f *model.File) float64
	}{
		{"hotspot (churn×cplx)", func(i int, _ *model.File) float64 { return churnPct[i] * cplxPct[i] }},
		{"churn×cplx×(1+bugs)", func(i int, f *model.File) float64 { return churnPct[i] * cplxPct[i] * (1 + bugRatio(f)) }},
		{"churn²×cplx×(1+bugs)", func(i int, f *model.File) float64 {
			return churnPct[i] * churnPct[i] * cplxPct[i] * (1 + bugRatio(f))
		}},
		{"recent commits only", func(i int, f *model.File) float64 { return churnPct[i] }},
		{"size only", func(_ int, f *model.File) float64 { return float64(f.Lines) }},
		{"complexity only", func(i int, _ *model.File) float64 { return cplxPct[i] }},
	}
	type res struct {
		p   float64
		hit int
	}
	results := make([]res, len(variants))
	for vi, v := range variants {
		byFile := map[*model.File]float64{}
		for i, f := range eligible {
			byFile[f] = v.score(i, f)
		}
		p, h := precision(func(f *model.File) float64 { return byFile[f] })
		results[vi] = res{p, h}
	}
	lift := 0.0
	if baseRate > 0 {
		lift = results[0].p / baseRate
	}

	if md {
		fmt.Printf("| %s | %s | %d | %d | %.0f%% |", name, cutoff.Format("2006-01"), city.Repo.Commits, len(eligible), baseRate*100)
		for vi, r := range results {
			if vi == 0 {
				fmt.Printf(" **%.0f%%** |", r.p*100)
			} else {
				fmt.Printf(" %.0f%% |", r.p*100)
			}
		}
		fmt.Printf(" %.1f× |\n", lift)
		return 0
	}
	fmt.Printf("%s — ranked at %s (%s), %d commits of history, %d eligible files\n", name, then[:10], cutoff.Format("2006-01-02"), city.Repo.Commits, len(eligible))
	fmt.Printf("files with a bug-fix commit in the following %d months: %d (%.1f%% base rate)\n\n", months, base, baseRate*100)
	fmt.Printf("%-28s %8s\n", "ranking", fmt.Sprintf("P@%d", top))
	fmt.Println(strings.Repeat("-", 38))
	for vi, v := range variants {
		fmt.Printf("%-28s %7.0f%%  (%d/%d)\n", v.name, results[vi].p*100, results[vi].hit, top)
	}
	fmt.Printf("%-28s %7.0f%%   (hotspot lift %.1f×)\n", "random (base rate)", baseRate*100, lift)
	return 0
}

// percentileOf ranks files by metric into (0,1]; zeros stay 0, ties share a rank.
func percentileOf(files []*model.File, metric func(*model.File) float64) []float64 {
	idx := make([]int, len(files))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool { return metric(files[idx[a]]) < metric(files[idx[b]]) })
	out := make([]float64, len(files))
	for j := 0; j < len(idx); {
		k := j
		v := metric(files[idx[j]])
		for k < len(idx) && metric(files[idx[k]]) == v {
			k++
		}
		p := float64(j+1) / float64(len(idx))
		if v == 0 {
			p = 0
		}
		for ; j < k; j++ {
			out[idx[j]] = p
		}
	}
	return out
}

func commitUnix(ctx context.Context, r *repo.Repo, rev string) (int64, error) {
	var t int64
	err := gitlog.Walk(ctx, r.Dir, gitlog.Options{Rev: rev, MaxCommits: 1}, func(c *gitlog.Commit) error {
		t = c.Time
		return nil
	})
	return t, err
}
