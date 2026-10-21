package analyze

import (
	"fmt"
	"sort"
	"strings"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/model"
)

// interval collects what happened between two keyframes so the timeline can
// be annotated: bursts of change, demolitions, districts appearing and
// disappearing.
type interval struct {
	k        int
	time     int64 // keyframe commit time closing the interval
	commits  int
	added    int
	deleted  int
	files    map[int]bool
	authors  map[int]bool
	dirChurn map[string]int
}

func newInterval(k int) *interval {
	return &interval{k: k, files: map[int]bool{}, authors: map[int]bool{}, dirChurn: map[string]int{}}
}

// district is the top two path segments: packages/react-dom, src/compiler.
func district(p string) string {
	parts := strings.SplitN(p, "/", 3)
	if len(parts) <= 2 {
		if len(parts) == 1 {
			return ""
		}
		return parts[0]
	}
	return parts[0] + "/" + parts[1]
}

type districtEvent struct {
	k    int
	kind string
	dir  string
	n    int
}

func (iv *interval) topDir() (string, int) {
	best, bestN := "", 0
	for d, n := range iv.dirChurn {
		if n > bestN || (n == bestN && d < best) {
			best, bestN = d, n
		}
	}
	return best, bestN
}

// detectEvents turns per-interval stats into a short, ranked list of
// captions. Thresholds are relative to the repo's own median activity so a
// quiet library and a monorepo both get a handful of real events.
func detectEvents(ivs []*interval, dirEvents []districtEvent, authors []model.Author, lastTime int64, maxEvents int) []model.Event {
	var out []model.Event
	if len(ivs) == 0 {
		return out
	}
	churn := make([]int, 0, len(ivs))
	for _, iv := range ivs {
		if iv.commits > 0 {
			churn = append(churn, iv.added+iv.deleted)
		}
	}
	if len(churn) == 0 {
		return out
	}
	sort.Ints(churn)
	median := churn[len(churn)/2]
	if median < 50 {
		median = 50
	}

	type cand struct {
		ev  model.Event
		mag float64
	}
	var bursts []cand
	for _, iv := range ivs {
		total := iv.added + iv.deleted
		if total < 4*median || total < 400 {
			continue
		}
		dir, dirN := iv.topDir()
		where := dir
		if where == "" {
			where = "the root"
		}
		focus := float64(dirN) / float64(max(total, 1))
		ev := model.Event{K: iv.k, Magnitude: float64(total) / float64(median)}
		switch {
		case iv.deleted > 2*iv.added:
			ev.Kind = "demolition"
			ev.Title = fmt.Sprintf("Demolition in %s", where)
			ev.Detail = fmt.Sprintf("%s lines removed across %d files", fmtN(iv.deleted), len(iv.files))
		case focus > 0.5:
			ev.Kind = "rewrite"
			ev.Title = fmt.Sprintf("Rewrite in %s", where)
			ev.Detail = fmt.Sprintf("%s lines changed in %d files by %d authors", fmtN(total), len(iv.files), len(iv.authors))
		default:
			ev.Kind = "burst"
			ev.Title = "Burst of activity"
			ev.Detail = fmt.Sprintf("%s lines changed across %d files by %d authors", fmtN(total), len(iv.files), len(iv.authors))
		}
		bursts = append(bursts, cand{ev, ev.Magnitude})
	}
	sort.SliceStable(bursts, func(i, j int) bool { return bursts[i].mag > bursts[j].mag })
	for i, c := range bursts {
		if i == maxEvents/2 {
			break
		}
		out = append(out, c.ev)
	}

	// Districts appearing and vanishing.
	for i, de := range dirEvents {
		if i == 6 {
			break
		}
		switch de.kind {
		case "new":
			out = append(out, model.Event{K: de.k, Kind: "district", Title: fmt.Sprintf("New district: %s", de.dir), Detail: fmt.Sprintf("%d files and counting", de.n), Magnitude: float64(de.n)})
		case "gone":
			out = append(out, model.Event{K: de.k, Kind: "demolition", Title: fmt.Sprintf("%s demolished", de.dir), Detail: fmt.Sprintf("all %d files removed", de.n), Magnitude: float64(de.n)})
		}
	}

	// People: when the most prolific authors arrived, and when they left.
	type ai struct {
		i int
		a model.Author
	}
	var top []ai
	for i, a := range authors {
		top = append(top, ai{i, a})
	}
	sort.Slice(top, func(i, j int) bool { return top[i].a.Commits > top[j].a.Commits })
	if len(top) > 3 {
		top = top[:3]
	}
	kAt := func(t int64) int { // first keyframe at or after t
		for _, iv := range ivs {
			if iv.time >= t {
				return iv.k
			}
		}
		return ivs[len(ivs)-1].k
	}
	for _, t := range top {
		if t.a.Commits < 20 {
			continue
		}
		out = append(out, model.Event{K: kAt(t.a.FirstSeen), Kind: "person", Title: fmt.Sprintf("%s arrives", displayAuthor(t.a)), Detail: fmt.Sprintf("goes on to make %s commits", fmtN(t.a.Commits)), Magnitude: float64(t.a.Commits), Author: t.i})
		if t.a.LastSeen < lastTime-365*24*3600 {
			out = append(out, model.Event{K: kAt(t.a.LastSeen), Kind: "person", Title: fmt.Sprintf("%s's last commit", displayAuthor(t.a)), Detail: fmt.Sprintf("after %s commits", fmtN(t.a.Commits)), Magnitude: float64(t.a.Commits), Author: t.i})
		}
	}

	sort.SliceStable(out, func(i, j int) bool { return out[i].K < out[j].K })
	if len(out) > maxEvents {
		// Keep the biggest, then restore chronological order.
		sort.SliceStable(out, func(i, j int) bool { return out[i].Magnitude > out[j].Magnitude })
		out = out[:maxEvents]
		sort.SliceStable(out, func(i, j int) bool { return out[i].K < out[j].K })
	}
	return out
}

func displayAuthor(a model.Author) string {
	if a.Login != "" {
		return "@" + a.Login
	}
	return a.Name
}

func fmtN(n int) string {
	switch {
	case n >= 1_000_000:
		return fmt.Sprintf("%.1fM", float64(n)/1e6)
	case n >= 10_000:
		return fmt.Sprintf("%dk", n/1000)
	case n >= 1_000:
		return fmt.Sprintf("%.1fk", float64(n)/1000)
	}
	return fmt.Sprint(n)
}
