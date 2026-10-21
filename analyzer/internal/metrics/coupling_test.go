package metrics

import "testing"

func TestCouplingRanking(t *testing.T) {
	p := NewPairCounter()
	for i := 0; i < 5; i++ {
		p.Add([]int{1, 2}) // always together
	}
	p.Add([]int{1, 3})
	p.Add([]int{2, 3})
	big := make([]int, MaxCouplingFiles+1) // bulk commit: ignored
	for i := range big {
		big[i] = 10 + i
	}
	p.Add(big)
	commits := map[int]int{1: 6, 2: 5, 3: 9}
	out := RankCouplings(p.Pairs(), func(id int) int { return commits[id] }, func(int) bool { return true }, 2, 0.3, 10)
	if len(out) != 1 || out[0].A != 1 || out[0].B != 2 || out[0].Support != 5 || out[0].Confidence != 1 {
		t.Fatalf("ranked: %+v", out)
	}
	if n := len(p.Pairs()); n != 3 {
		t.Errorf("bulk commit should not add pairs: %d", n)
	}
}
