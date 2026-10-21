package metrics

import "sort"

// Temporal coupling: files that keep changing in the same commits even though
// nothing imports one from the other. Static analysis cannot see it; the
// commit log can. Mined like association rules: support = co-changes,
// confidence = co-changes relative to the less-often-changed file.

// MaxCouplingFiles is the most files a commit may touch and still count;
// bigger commits are reformats, renames and bulk moves, not coupling.
const MaxCouplingFiles = 20

// PairCounter accumulates co-change counts between logical file ids.
type PairCounter struct {
	counts map[uint64]uint32
}

func NewPairCounter() *PairCounter { return &PairCounter{counts: map[uint64]uint32{}} }

func pairKey(a, b int) uint64 {
	if a > b {
		a, b = b, a
	}
	return uint64(a)<<32 | uint64(uint32(b))
}

// Add records that all ids changed together in one commit.
func (p *PairCounter) Add(ids []int) {
	if len(ids) < 2 || len(ids) > MaxCouplingFiles {
		return
	}
	for i := 0; i < len(ids); i++ {
		for j := i + 1; j < len(ids); j++ {
			if ids[i] != ids[j] {
				p.counts[pairKey(ids[i], ids[j])]++
			}
		}
	}
}

// Pairs returns the raw counts.
func (p *PairCounter) Pairs() map[uint64]uint32 { return p.counts }

// Coupling is one ranked pair.
type Coupling struct {
	A, B       int
	Support    int
	Confidence float64 // support / min(commits A, commits B)
}

// RankCouplings turns raw counts into a shortlist. commits[id] is the number
// of commits that touched the file; eligible filters out generated,
// vendored, binary and removed files.
func RankCouplings(counts map[uint64]uint32, commits func(id int) int, eligible func(id int) bool, minSupport int, minConfidence float64, limit int) []Coupling {
	var out []Coupling
	for key, n := range counts {
		if int(n) < minSupport {
			continue
		}
		a, b := int(key>>32), int(uint32(key))
		if !eligible(a) || !eligible(b) {
			continue
		}
		ca, cb := commits(a), commits(b)
		if ca == 0 || cb == 0 {
			continue
		}
		m := ca
		if cb < m {
			m = cb
		}
		conf := float64(n) / float64(m)
		if conf < minConfidence {
			continue
		}
		out = append(out, Coupling{A: a, B: b, Support: int(n), Confidence: conf})
	}
	// Strongest first: both how often and how reliably they move together.
	sort.Slice(out, func(i, j int) bool {
		si := float64(out[i].Support) * out[i].Confidence
		sj := float64(out[j].Support) * out[j].Confidence
		if si != sj {
			return si > sj
		}
		if out[i].A != out[j].A {
			return out[i].A < out[j].A
		}
		return out[i].B < out[j].B
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}
