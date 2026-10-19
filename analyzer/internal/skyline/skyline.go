// Package skyline reduces a city to a tiny silhouette: n columns of
// normalized height plus the hottest fire level in each. It is what the README
// badge draws, so it must be small enough to live in a database row.
package skyline

import (
	"math"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/model"
)

// Bucket is one column of the silhouette.
type Bucket struct {
	H    float64 `json:"h"`    // 0..1, sqrt-scaled tallest building in the column
	Fire int     `json:"fire"` // 0..3
}

// Buckets samples the city along its X axis into n columns.
func Buckets(c *model.City, n int) []Bucket {
	out := make([]Bucket, n)
	if n == 0 || len(c.Dirs) == 0 {
		return out
	}
	root := c.Dirs[0]
	if root.W <= 0 {
		return out
	}
	maxH := 0.0
	for _, f := range c.Files {
		if f.Removed || f.Lines == 0 || f.Generated || f.Vendored {
			continue
		}
		i := int((f.X + f.W/2 - root.X) / root.W * float64(n))
		if i < 0 {
			i = 0
		}
		if i >= n {
			i = n - 1
		}
		h := math.Sqrt(float64(f.Lines))
		if h > out[i].H {
			out[i].H = h
		}
		if f.Fire > out[i].Fire {
			out[i].Fire = f.Fire
		}
		if h > maxH {
			maxH = h
		}
	}
	if maxH > 0 {
		for i := range out {
			out[i].H = math.Round(out[i].H/maxH*100) / 100
		}
	}
	return out
}

// Summary is the compact record the hosted service stores per analysis.
type Summary struct {
	Name        string         `json:"name"`
	Head        string         `json:"head"`
	Files       int            `json:"files"`
	Lines       int            `json:"lines"`
	Commits     int            `json:"commits"`
	Authors     int            `json:"authors"`
	Burning     int            `json:"burning"`
	Removed     int            `json:"removed"`
	FirstCommit int64          `json:"firstCommit"`
	LastCommit  int64          `json:"lastCommit"`
	Languages   map[string]int `json:"languages"`
	Skyline     []Bucket       `json:"skyline"`
}

// Summarize builds the Summary for a city with a 48-column skyline.
func Summarize(c *model.City) Summary {
	langs := map[string]int{}
	// Keep the five biggest languages; the badge and gallery need no more.
	type kv struct {
		k string
		v int
	}
	var all []kv
	for k, v := range c.Stats.Languages {
		all = append(all, kv{k, v})
	}
	for i := 0; i < len(all); i++ {
		for j := i + 1; j < len(all); j++ {
			if all[j].v > all[i].v || (all[j].v == all[i].v && all[j].k < all[i].k) {
				all[i], all[j] = all[j], all[i]
			}
		}
	}
	for i, e := range all {
		if i == 5 {
			break
		}
		langs[e.k] = e.v
	}
	return Summary{
		Name: c.Repo.Name, Head: c.Repo.Head,
		Files: c.Stats.Files, Lines: c.Stats.Lines, Commits: c.Repo.Commits, Authors: len(c.Authors),
		Burning: c.Stats.Burning, Removed: c.Stats.Removed,
		FirstCommit: c.Repo.FirstCommit, LastCommit: c.Repo.LastCommit,
		Languages: langs, Skyline: Buckets(c, 48),
	}
}
