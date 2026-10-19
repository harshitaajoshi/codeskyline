// Package layout places directories and files on the ground plane.
//
// Unlike an area-proportional treemap, which squeezes small siblings of a huge
// directory into slivers, this is a bottom-up rectangle packing in the style
// of CodeCity: every file gets a fixed square lot sized by its line count, each
// directory packs its children's lots into a near-square district and grows to
// fit them, and streets separate siblings. Nothing is ever distorted, so equal
// files get equal lots and a district's size says how much is in it.
//
// The packing is deterministic: the same tree always yields the same city,
// which is what makes shareable links and time-travel stable.
package layout

import (
	"math"
	"sort"
	"strings"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/model"
)

// Item is a leaf to place.
type Item struct {
	Path string
	Area float64 // footprint area in world units²; the lot is a square
}

// Dir is a placed directory.
type Dir struct {
	Path   string
	Parent int // index into the returned dirs, -1 for root
	Depth  int
	Rect   model.Rect
	Leaves int
}

// Result maps every item path to its lot and lists the districts.
type Result struct {
	Dirs  []Dir
	Rects map[string]model.Rect
}

type node struct {
	name     string
	path     string
	children []*node
	leaf     bool
	w, d     float64    // own size, including nothing outside the lot/district
	rel      model.Rect // position relative to the parent's inner origin
	abs      model.Rect
	leaves   int
}

// street returns the gap between sibling districts at a given depth:
// boulevards between top-level packages, alleys deep in the tree.
func street(depth int) float64 {
	w := 3.0 - 0.6*float64(depth)
	if w < 0.8 {
		w = 0.8
	}
	return w
}

// fileGap is the space between neighbouring buildings. A directory holding
// only files packs like a city block; one holding sub-directories uses the
// wider street for its depth so districts read as districts.
const fileGap = 0.5

func gapFor(n *node, depth int) float64 {
	for _, c := range n.children {
		if !c.leaf {
			return street(depth + 1)
		}
	}
	return fileGap
}

// FootprintArea maps a file's size to a lot area. Sublinear, so districts are
// sized mostly by how many files they hold; height carries the LOC signal.
func FootprintArea(lines int) float64 {
	return 2 + math.Sqrt(float64(lines))/2
}

// Place lays out the items. Items are grouped by directory from their paths.
func Place(items []Item) Result {
	root := &node{path: ""}
	index := map[string]*node{"": root}
	for _, it := range items {
		d := ensureDir(index, root, parentDir(it.Path))
		side := math.Sqrt(math.Max(it.Area, 0.25))
		d.children = append(d.children, &node{name: baseName(it.Path), path: it.Path, leaf: true, w: side, d: side})
	}
	size(root, 0)
	root.abs = model.Rect{X: 0, Z: 0, W: root.w, D: root.d}
	position(root, 0)

	res := Result{Rects: make(map[string]model.Rect, len(items))}
	collect(root, -1, 0, &res)
	return res
}

func ensureDir(index map[string]*node, root *node, dir string) *node {
	if n, ok := index[dir]; ok {
		return n
	}
	parent := ensureDir(index, root, parentDir(dir))
	n := &node{name: baseName(dir), path: dir}
	parent.children = append(parent.children, n)
	index[dir] = n
	return n
}

// size packs a directory's children bottom-up and records its own extent.
func size(n *node, depth int) {
	if n.leaf {
		n.leaves = 1
		return
	}
	gap := gapFor(n, depth)
	for _, c := range n.children {
		size(c, depth+1)
		n.leaves += c.leaves
	}
	// Biggest first packs tightest; name as tiebreak keeps it deterministic.
	sort.SliceStable(n.children, func(i, j int) bool {
		a, b := n.children[i], n.children[j]
		if ma, mb := math.Max(a.w, a.d), math.Max(b.w, b.d); ma != mb {
			return ma > mb
		}
		return a.name < b.name
	})
	w, d := pack(n.children, gap)
	// Children sit at gap offset; the district adds a street on every side.
	n.w, n.d = w+gap, d+gap
}

// pack places blocks (each inflated by gap on the right and bottom) into a
// bin that grows to stay near-square. Returns the bin size. This is the
// classic growing binary-tree packer: find a free node that fits, split it,
// otherwise grow the bin along whichever side keeps it squarest.
func pack(blocks []*node, gap float64) (w, d float64) {
	if len(blocks) == 0 {
		return 0, 0
	}
	type bin struct {
		x, z, w, d  float64
		used        bool
		right, down *bin
	}
	var find func(b *bin, w, d float64) *bin
	find = func(b *bin, w, d float64) *bin {
		if b == nil {
			return nil
		}
		if b.used {
			if r := find(b.right, w, d); r != nil {
				return r
			}
			return find(b.down, w, d)
		}
		if w <= b.w+1e-9 && d <= b.d+1e-9 {
			return b
		}
		return nil
	}
	split := func(b *bin, w, d float64) *bin {
		b.used = true
		b.down = &bin{x: b.x, z: b.z + d, w: b.w, d: b.d - d}
		b.right = &bin{x: b.x + w, z: b.z, w: b.w - w, d: d}
		return b
	}
	root := &bin{w: blocks[0].w + gap, d: blocks[0].d + gap}
	growRight := func(w, d float64) *bin {
		root = &bin{used: true, w: root.w + w, d: root.d, down: root, right: &bin{x: root.w, z: 0, w: w, d: root.d}}
		return split(find(root, w, d), w, d)
	}
	growDown := func(w, d float64) *bin {
		root = &bin{used: true, w: root.w, d: root.d + d, down: &bin{x: 0, z: root.d, w: root.w, d: d}, right: root}
		return split(find(root, w, d), w, d)
	}
	for _, blk := range blocks {
		bw, bd := blk.w+gap, blk.d+gap
		var fit *bin
		if n := find(root, bw, bd); n != nil {
			fit = split(n, bw, bd)
		} else {
			canDown, canRight := bw <= root.w, bd <= root.d
			switch {
			case canRight && root.d >= root.w+bw:
				fit = growRight(bw, bd)
			case canDown && root.w >= root.d+bd:
				fit = growDown(bw, bd)
			case canRight:
				fit = growRight(bw, bd)
			case canDown:
				fit = growDown(bw, bd)
			default: // cannot happen with blocks sorted by max side
				fit = growRight(bw, bd)
			}
		}
		blk.rel = model.Rect{X: fit.x, Z: fit.z, W: blk.w, D: blk.d}
	}
	return root.w, root.d
}

// position resolves absolute rects top-down.
func position(n *node, depth int) {
	if n.leaf {
		return
	}
	gap := gapFor(n, depth)
	for _, c := range n.children {
		c.abs = model.Rect{X: n.abs.X + gap + c.rel.X, Z: n.abs.Z + gap + c.rel.Z, W: c.w, D: c.d}
		position(c, depth+1)
	}
}

func collect(n *node, parent, depth int, res *Result) {
	if n.leaf {
		res.Rects[n.path] = round(n.abs)
		return
	}
	id := len(res.Dirs)
	res.Dirs = append(res.Dirs, Dir{Path: n.path, Parent: parent, Depth: depth, Rect: round(n.abs), Leaves: n.leaves})
	// Children in name order so dir ids are stable regardless of sizes.
	kids := append([]*node(nil), n.children...)
	sort.SliceStable(kids, func(i, j int) bool { return kids[i].name < kids[j].name })
	for _, c := range kids {
		collect(c, id, depth+1, res)
	}
}

func round(r model.Rect) model.Rect {
	f := func(v float64) float64 { return math.Round(v*100) / 100 }
	return model.Rect{X: f(r.X), Z: f(r.Z), W: f(r.W), D: f(r.D)}
}

func parentDir(p string) string {
	if i := strings.LastIndexByte(p, '/'); i >= 0 {
		return p[:i]
	}
	return ""
}

func baseName(p string) string {
	if i := strings.LastIndexByte(p, '/'); i >= 0 {
		return p[i+1:]
	}
	return p
}
