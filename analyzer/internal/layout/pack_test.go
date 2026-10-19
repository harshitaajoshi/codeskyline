package layout

import (
	"fmt"
	"math"
	"reflect"
	"testing"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/model"
)

func fixture() []Item {
	var items []Item
	for d := 0; d < 4; d++ {
		for f := 0; f < 25; f++ {
			items = append(items, Item{Path: fmt.Sprintf("src/pkg%d/file%02d.go", d, f), Area: FootprintArea(10 + f*f*7)})
		}
	}
	items = append(items,
		Item{Path: "README.md", Area: FootprintArea(120)},
		Item{Path: "go.mod", Area: FootprintArea(5)},
		Item{Path: "docs/deep/er/still/deeper/x.md", Area: FootprintArea(40)},
	)
	return items
}

// Rects are rounded to 0.01 world units, so comparisons allow that much.
const eps = 0.011

func inside(a, b model.Rect) bool {
	return a.X >= b.X-eps && a.Z >= b.Z-eps && a.X+a.W <= b.X+b.W+eps && a.Z+a.D <= b.Z+b.D+eps
}

func overlap(a, b model.Rect) bool {
	return a.X+a.W > b.X+eps && b.X+b.W > a.X+eps && a.Z+a.D > b.Z+eps && b.Z+b.D > a.Z+eps
}

func TestPlaceIsNestedNonOverlappingAndDeterministic(t *testing.T) {
	items := fixture()
	res := Place(items)
	if len(res.Rects) != len(items) {
		t.Fatalf("placed %d of %d", len(res.Rects), len(items))
	}
	root := res.Dirs[0]
	if root.Path != "" || root.Parent != -1 || root.Leaves != len(items) {
		t.Fatalf("root: %+v", root)
	}
	byPath := map[string]Dir{}
	for _, d := range res.Dirs {
		byPath[d.Path] = d
		if d.Parent >= 0 && !inside(d.Rect, res.Dirs[d.Parent].Rect) {
			t.Errorf("dir %s escapes parent", d.Path)
		}
	}
	// Lots are exact squares of the requested area, nested in their directory.
	for i, it := range items {
		r := res.Rects[i]
		if side := math.Sqrt(it.Area); math.Abs(r.W-side) > eps || math.Abs(r.D-side) > eps {
			t.Errorf("%s lot %+v, want %.2f square", it.Path, r, side)
		}
		if !inside(r, byPath[parentDir(it.Path)].Rect) {
			t.Errorf("%s escapes its directory", it.Path)
		}
	}
	// Siblings never overlap, whether files or districts.
	var all []model.Rect
	for _, r := range res.Rects {
		all = append(all, r)
	}
	for _, d := range res.Dirs[1:] {
		all = append(all, d.Rect)
	}
	for i := range all {
		for j := i + 1; j < len(all); j++ {
			a, b := all[i], all[j]
			if overlap(a, b) && !inside(a, b) && !inside(b, a) {
				t.Errorf("overlap: %+v vs %+v", a, b)
			}
		}
	}
	// Districts come out reasonably square; packing should not leave strips.
	for _, d := range res.Dirs {
		if a := math.Max(d.Rect.W/d.Rect.D, d.Rect.D/d.Rect.W); a > 3 {
			t.Errorf("district %q aspect %.1f: %+v", d.Path, a, d.Rect)
		}
	}
	// Same input in a different order yields the identical city.
	shuffled := append([]Item(nil), items...)
	for i := range shuffled {
		j := (i * 7919) % len(shuffled)
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	}
	again := Place(shuffled)
	byItem := func(items []Item, r Result) map[string]model.Rect {
		m := map[string]model.Rect{}
		for i, it := range items {
			m[it.Path] = r.Rects[i]
		}
		return m
	}
	if !reflect.DeepEqual(byItem(shuffled, again), byItem(items, res)) || !reflect.DeepEqual(again.Dirs, res.Dirs) {
		t.Error("layout is not deterministic under input reordering")
	}
}

func TestPackDensity(t *testing.T) {
	// A flat directory of equal files should pack like a grid with streets,
	// wasting little space.
	var items []Item
	for i := 0; i < 100; i++ {
		items = append(items, Item{Path: fmt.Sprintf("f%03d", i), Area: 4})
	}
	res := Place(items)
	root := res.Dirs[0].Rect
	lots := 100 * 4.0
	if fill := lots / (root.W * root.D); fill < 0.45 {
		t.Errorf("fill ratio %.2f too low: %+v", fill, root)
	}
}
