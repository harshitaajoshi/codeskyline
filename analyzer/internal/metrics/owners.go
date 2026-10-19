package metrics

import (
	"math"
	"regexp"
	"sort"
	"strings"
)

// Ownership follows Tornhill's knowledge-map idea: whoever wrote most of the
// lines that are still being worked on "owns" a file, with older work decaying
// so a file rewritten last year belongs to its new author, not the one who
// created it a decade ago.

// KnowledgeHalfLife is the time (seconds) after which an author's contribution
// counts for half as much. One year.
const KnowledgeHalfLife = 365 * 24 * 3600

// DecayWeight returns the knowledge weight for work done at t, as of now.
func DecayWeight(t, now int64) float64 {
	if t >= now {
		return 1
	}
	return math.Pow(0.5, float64(now-t)/KnowledgeHalfLife)
}

// Share is one author's decayed contribution to a file.
type Share struct {
	Author int
	Share  float64
}

// TopOwners normalizes an author→weight map into the top n shares, largest
// first. Ties are broken by author index so output is deterministic.
func TopOwners(weights map[int]float64, n int) []Share {
	var total float64
	for _, w := range weights {
		total += w
	}
	if total == 0 {
		return nil
	}
	out := make([]Share, 0, len(weights))
	for a, w := range weights {
		out = append(out, Share{Author: a, Share: w / total})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Share != out[j].Share {
			return out[i].Share > out[j].Share
		}
		return out[i].Author < out[j].Author
	})
	if len(out) > n {
		out = out[:n]
	}
	for i := range out {
		out[i].Share = math.Round(out[i].Share*1000) / 1000
	}
	return out
}

var noreplyRe = regexp.MustCompile(`^(?:\d+\+)?([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)@users\.noreply\.github\.com$`)

// GitHubLogin extracts a login from a GitHub noreply address, else "".
func GitHubLogin(email string) string {
	m := noreplyRe.FindStringSubmatch(strings.ToLower(strings.TrimSpace(email)))
	if m == nil {
		return ""
	}
	return m[1]
}

// IdentityKey is how authors are de-duplicated after .mailmap has run:
// by lower-cased email, falling back to name for emailless commits.
func IdentityKey(name, email string) string {
	e := strings.ToLower(strings.TrimSpace(email))
	if e == "" {
		return "name:" + strings.ToLower(strings.TrimSpace(name))
	}
	return e
}
