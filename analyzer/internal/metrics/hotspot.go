package metrics

import (
	"regexp"
	"sort"
)

// Bug-fix detection is a heuristic on commit messages, and the README says
// so. It is combined with churn and complexity rather than used alone, which
// is what makes the hotspot score hold up (see docs/benchmarks.md).
var bugFixRe = regexp.MustCompile(`(?i)\b(fix(es|ed|ing)?|bug(fix|s)?|hotfix|regression|crash(es|ed)?|defect|resolves?d?)\b|\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#\d+`)

// IsBugFix reports whether a commit message reads like a bug fix.
func IsBugFix(subject, body string) bool {
	return bugFixRe.MatchString(subject) || bugFixRe.MatchString(body)
}

// HotspotInput is what the scorer needs per file.
type HotspotInput struct {
	RecentCommits int // commits in the trailing window
	RecentChurn   int // added+deleted lines in the trailing window
	Complexity    int
	Commits       int
	BugFixes      int
	Eligible      bool // false for generated/vendored/binary files
}

// Fire thresholds, as fractions of eligible files, from hottest down.
const (
	infernoFrac = 0.02
	flamesFrac  = 0.05
	smokeFrac   = 0.08
	minRecent   = 3 // a file needs this many recent commits to burn at all
)

// ScoreHotspots returns a 0..1 score and a fire level (0..3) per file.
//
// score = pct(recent churn) × pct(complexity) × (1 + bug-fix ratio)
//
// Percentile ranks make the product comparable across repos of any size and
// language mix. Fire levels are assigned by rank so every city has a few
// burning buildings rather than none (tiny repos) or hundreds (huge ones).
func ScoreHotspots(in []HotspotInput) (scores []float64, fire []int) {
	n := len(in)
	scores = make([]float64, n)
	fire = make([]int, n)

	churnPct := percentiles(in, func(h HotspotInput) float64 { return float64(h.RecentChurn) + float64(h.RecentCommits)*10 })
	cplxPct := percentiles(in, func(h HotspotInput) float64 { return float64(h.Complexity) })

	var candidates []int
	for i, h := range in {
		if !h.Eligible || h.RecentCommits < minRecent {
			continue
		}
		bugRatio := 0.0
		if h.Commits > 0 {
			bugRatio = float64(h.BugFixes) / float64(h.Commits)
		}
		s := churnPct[i] * cplxPct[i] * (1 + bugRatio)
		scores[i] = s / 2 // (1+bugRatio) ≤ 2, keep in 0..1
		if s > 0 {
			candidates = append(candidates, i)
		}
	}
	sort.SliceStable(candidates, func(a, b int) bool { return scores[candidates[a]] > scores[candidates[b]] })

	eligible := 0
	for _, h := range in {
		if h.Eligible {
			eligible++
		}
	}
	inferno := atLeast(1, int(float64(eligible)*infernoFrac))
	flames := atLeast(1, int(float64(eligible)*flamesFrac))
	smoke := atLeast(1, int(float64(eligible)*smokeFrac))
	for rank, i := range candidates {
		switch {
		case rank < inferno:
			fire[i] = 3
		case rank < inferno+flames:
			fire[i] = 2
		case rank < inferno+flames+smoke:
			fire[i] = 1
		}
	}
	return scores, fire
}

func atLeast(min, v int) int {
	if v < min {
		return min
	}
	return v
}

// percentiles maps each eligible value to its rank fraction in (0,1].
// Ineligible entries get 0. Ties share the lower rank so identical inputs
// score identically regardless of order.
func percentiles(in []HotspotInput, f func(HotspotInput) float64) []float64 {
	type kv struct {
		i int
		v float64
	}
	var vals []kv
	for i, h := range in {
		if h.Eligible {
			vals = append(vals, kv{i, f(h)})
		}
	}
	sort.SliceStable(vals, func(a, b int) bool { return vals[a].v < vals[b].v })
	out := make([]float64, len(in))
	for j := 0; j < len(vals); {
		k := j
		for k < len(vals) && vals[k].v == vals[j].v {
			k++
		}
		p := float64(j+1) / float64(len(vals))
		if vals[j].v == 0 {
			p = 0
		}
		for ; j < k; j++ {
			out[vals[j].i] = p
		}
	}
	return out
}
