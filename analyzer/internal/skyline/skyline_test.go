package skyline

import (
	"testing"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/model"
)

func TestBuckets(t *testing.T) {
	c := &model.City{
		Dirs: []model.Dir{{Rect: model.Rect{X: 0, Z: 0, W: 100, D: 100}}},
		Files: []model.File{
			{Lines: 100, Fire: 0, Rect: model.Rect{X: 0, W: 10}},       // column 0
			{Lines: 400, Fire: 3, Rect: model.Rect{X: 95, W: 5}},       // column 3 (last)
			{Lines: 900, Removed: true, Rect: model.Rect{X: 50, W: 5}}, // ignored
		},
	}
	b := Buckets(c, 4)
	if b[0].H != 0.5 || b[3].H != 1 || b[3].Fire != 3 || b[2].H != 0 {
		t.Errorf("buckets: %+v", b)
	}
	s := Summarize(c)
	if len(s.Skyline) != 48 || s.Skyline[46].Fire != 3 {
		t.Errorf("summary: %+v", s)
	}
}
