package analyze_test

import (
	"context"
	"testing"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/analyze"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/model"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/repo"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/testutil"
)

const goWithBranches = `package core

func f(x int) int {
	if x > 1 {
		return 1
	}
	for i := 0; i < x; i++ {
		if i%2 == 0 {
			x++
		}
	}
	return x
}
`

func file(t *testing.T, c *model.City, path string) *model.File {
	t.Helper()
	for i := range c.Files {
		if c.Files[i].Path == path {
			return &c.Files[i]
		}
	}
	t.Fatalf("no file %s", path)
	return nil
}

func TestRunBuildsConsistentCity(t *testing.T) {
	r := testutil.New(t)
	ada, bob := "ada@x.com", "bob@x.com"
	r.Commit("Ada", ada, testutil.Day(0), "init",
		testutil.Write("src/core/engine.go", goWithBranches),
		testutil.Write("src/util/strings.go", "package util\n"),
		testutil.Write("README.md", testutil.Lines("line ", 20)),
		testutil.Write("tmp/scratch.txt", testutil.Lines("s", 40)),
		testutil.Write("package-lock.json", testutil.Lines("{}", 500)))
	// Hot file: many recent commits by Bob, several flagged as fixes.
	for i := 1; i <= 6; i++ {
		msg := "tweak engine"
		if i%2 == 0 {
			msg = "fix: engine crash"
		}
		r.Commit("Bob", bob, testutil.Day(i), msg,
			testutil.Write("src/core/engine.go", goWithBranches+testutil.Lines("// note ", i*5)))
	}
	// Rename keeps identity: commits before and after should be summed.
	r.Commit("Ada", ada, testutil.Day(10), "move util",
		testutil.Move("src/util/strings.go", "src/text/strings.go"),
		testutil.Remove("tmp/scratch.txt"))
	r.Commit("Ada", ada, testutil.Day(11), "edit moved file",
		testutil.Write("src/text/strings.go", "package text\nvar s = \"x\"\n"))

	city, err := analyze.Run(context.Background(), mustOpen(t, r.Dir), analyze.Options{Name: "fixture", Now: testutil.Day(12).Unix()})
	if err != nil {
		t.Fatal(err)
	}

	if city.Stats.LineMismatches != 0 {
		t.Errorf("numstat running totals disagree with HEAD for %d files", city.Stats.LineMismatches)
	}
	if city.Repo.Commits != 9 || city.Repo.FirstCommit != testutil.Day(0).Unix() || city.Repo.LastCommit != testutil.Day(11).Unix() {
		t.Errorf("repo: %+v", city.Repo)
	}
	if len(city.Authors) != 2 {
		t.Fatalf("authors: %+v", city.Authors)
	}

	eng := file(t, city, "src/core/engine.go")
	if eng.Lang != "Go" || eng.Complexity < 3 || eng.Commits != 7 || eng.BugFixes != 3 {
		t.Errorf("engine: %+v", eng)
	}
	if eng.Lines != 13+30 { // 13 lines of source + 6 commits × 5 note lines
		t.Errorf("engine lines = %d", eng.Lines)
	}
	if eng.Fire == 0 {
		t.Errorf("engine should burn: hotspot=%v fire=%v", eng.Hotspot, eng.Fire)
	}
	if len(eng.Owners) == 0 || city.Authors[eng.Owners[0].Author].Email != bob {
		t.Errorf("engine owner should be Bob: %+v", eng.Owners)
	}

	moved := file(t, city, "src/text/strings.go")
	if moved.Commits != 3 || moved.Created != testutil.Day(0).Unix() {
		t.Errorf("renamed file lost history: %+v", moved)
	}
	if _, ok := dirByPath(city, "src/util"); ok {
		t.Error("empty old directory should not exist at HEAD")
	}

	lock := file(t, city, "package-lock.json")
	if !lock.Generated || lock.Fire != 0 {
		t.Errorf("lockfile should be flagged generated and never burn: %+v", lock)
	}

	readme := file(t, city, "README.md")
	if readme.Lines != 20 || readme.Fire != 0 {
		t.Errorf("readme: %+v", readme)
	}

	// Deleted files keep a lot (layout stability) but contribute no lines.
	gone := file(t, city, "tmp/scratch.txt")
	if !gone.Removed || gone.Lines != 0 || gone.MaxLines != 40 || gone.W <= 0 || gone.Commits != 2 {
		t.Errorf("deleted file: %+v", gone)
	}
	if city.Stats.Files != 4 || city.Stats.Removed != 1 {
		t.Errorf("stats: %+v", city.Stats)
	}

	// Every file sits in a directory that exists and is nested under root.
	for _, f := range city.Files {
		if f.Dir < 0 || f.Dir >= len(city.Dirs) || f.W <= 0 || f.D <= 0 {
			t.Errorf("unplaced file: %+v", f)
		}
	}
	if root := city.Dirs[0]; root.Files != len(city.Files) || root.Lines != city.Stats.Lines {
		t.Errorf("root aggregates: %+v vs stats %+v", root, city.Stats)
	}

	// Timeline: one keyframe per commit for a short history.
	tl := city.Timeline
	if len(tl.Keyframes) != 9 || tl.Keyframes[0].Subject != "init" || tl.Keyframes[8].Index != 8 {
		t.Fatalf("keyframes: %+v", tl.Keyframes)
	}
	if len(tl.Events)%6 != 0 {
		t.Fatalf("events not 6-tuples: %d", len(tl.Events))
	}
	at := func(fileID int, k int) (lines, act, owner, fire int32, ok bool) {
		// state at keyframe k = last event with k' <= k
		for i := 0; i < len(tl.Events); i += 6 {
			e := tl.Events[i : i+6]
			if int(e[0]) == fileID && int(e[1]) <= k {
				lines, act, owner, fire, ok = e[2], e[3], e[4], e[5], true
			}
		}
		return
	}
	if l, _, _, _, ok := at(eng.ID, 0); !ok || l != 13 {
		t.Errorf("engine at k0: lines=%d ok=%v", l, ok)
	}
	if l, act, owner, fire, _ := at(eng.ID, 8); l != int32(eng.Lines) || act != 0 || city.Authors[owner].Email != bob || fire != int32(eng.Fire) {
		t.Errorf("engine at last keyframe: lines=%d act=%d owner=%d fire=%d", l, act, owner, fire)
	}
	if _, act, _, _, _ := at(eng.ID, 3); act != 1 {
		t.Errorf("engine activity at k3 = %d, want 1 commit since previous keyframe", act)
	}
	if l, _, _, _, _ := at(gone.ID, 6); l != 40 {
		t.Errorf("scratch alive at k6: %d", l)
	}
	if l, _, _, _, _ := at(gone.ID, 7); l != 0 {
		t.Errorf("scratch deleted at k7: %d", l)
	}
	if _, _, _, _, ok := at(moved.ID, 0); !ok {
		t.Error("renamed file should exist from the first keyframe")
	}
	for i := 6; i < len(tl.Events); i += 6 {
		a, b := tl.Events[i-6:i], tl.Events[i:i+6]
		if a[0] > b[0] || (a[0] == b[0] && a[1] >= b[1]) {
			t.Fatalf("events not sorted by (file, k): %v then %v", a, b)
		}
	}
}

func TestRunTruncatedHistoryStillCounts(t *testing.T) {
	r := testutil.New(t)
	r.Commit("A", "a@x.com", testutil.Day(0), "one", testutil.Write("a.go", "package a\n"))
	r.Commit("A", "a@x.com", testutil.Day(1), "two", testutil.Write("b.go", "package b\nvar x = 1\n"))
	city, err := analyze.Run(context.Background(), mustOpen(t, r.Dir), analyze.Options{MaxCommits: 1})
	if err != nil {
		t.Fatal(err)
	}
	if !city.Repo.Truncated || city.Repo.Commits != 1 {
		t.Errorf("repo: %+v", city.Repo)
	}
	if a := file(t, city, "a.go"); a.Lines != 1 || a.Commits != 0 {
		t.Errorf("a.go outside window: %+v", a)
	}
	// Even without history, the last keyframe must reflect HEAD.
	tl := city.Timeline
	if len(tl.Keyframes) != 1 {
		t.Fatalf("keyframes: %+v", tl.Keyframes)
	}
	seen := map[int32]int32{}
	for i := 0; i < len(tl.Events); i += 6 {
		seen[tl.Events[i]] = tl.Events[i+2]
	}
	a, b := file(t, city, "a.go"), file(t, city, "b.go")
	if seen[int32(a.ID)] != 1 || seen[int32(b.ID)] != 2 {
		t.Errorf("last keyframe lines: %v", seen)
	}
}

func mustOpen(t *testing.T, dir string) *repo.Repo {
	t.Helper()
	r, err := repo.Open(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func dirByPath(c *model.City, p string) (model.Dir, bool) {
	for _, d := range c.Dirs {
		if d.Path == p {
			return d, true
		}
	}
	return model.Dir{}, false
}
