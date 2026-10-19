package metrics

// TruckFactor follows Avelino et al. (2016): greedily remove the author who
// owns the most files until more than half of the files are orphaned. The
// number removed is the truck (bus) factor. owners[i] lists the authors who
// know file i; a file with no owners is orphaned from the start.
func TruckFactor(owners [][]int) int {
	n := len(owners)
	if n == 0 {
		return 0
	}
	alive := make([]bool, n)
	live := 0
	for i, o := range owners {
		if len(o) > 0 {
			alive[i] = true
			live++
		}
	}
	gone := map[int]bool{}
	factor := 0
	// Keep removing until strictly more than half the files are orphaned.
	for live*2 >= n {
		// Author covering the most still-alive files.
		count := map[int]int{}
		for i, o := range owners {
			if !alive[i] {
				continue
			}
			for _, a := range o {
				if !gone[a] {
					count[a]++
				}
			}
		}
		best, bestN := -1, 0
		for a, c := range count {
			if c > bestN || (c == bestN && a < best) {
				best, bestN = a, c
			}
		}
		if best < 0 {
			break
		}
		gone[best] = true
		factor++
		for i, o := range owners {
			if !alive[i] {
				continue
			}
			orphan := true
			for _, a := range o {
				if !gone[a] {
					orphan = false
					break
				}
			}
			if orphan {
				alive[i] = false
				live--
			}
		}
	}
	return factor
}
