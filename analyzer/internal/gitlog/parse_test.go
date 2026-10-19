package gitlog_test

import (
	"context"
	"testing"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/gitlog"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/testutil"
)

func walk(t *testing.T, dir string, opt gitlog.Options) []*gitlog.Commit {
	t.Helper()
	var out []*gitlog.Commit
	if err := gitlog.Walk(context.Background(), dir, opt, func(c *gitlog.Commit) error {
		out = append(out, c)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	return out
}

func find(t *testing.T, c *gitlog.Commit, path string) gitlog.Change {
	t.Helper()
	for _, ch := range c.Changes {
		if ch.Path == path {
			return ch
		}
	}
	t.Fatalf("commit %q has no change for %s: %+v", c.Subject, path, c.Changes)
	return gitlog.Change{}
}

func TestWalkParsesStatusesCountsAndRenames(t *testing.T) {
	r := testutil.New(t)
	r.Commit("Ada", "ada@x.com", testutil.Day(0), "init",
		testutil.Write("a.txt", "l1\nl2\nl3\n"),
		testutil.Write("src/b.go", "package b\n"))
	r.Commit("Bob", "bob@x.com", testutil.Day(1), "fix: rename and edit\n\nFixes #12",
		testutil.Write("a.txt", "l1\nl2\n"),
		testutil.Move("src/b.go", "src/c.go"),
		testutil.Write("src/c.go", "package b\nvar x = 1\n"),
		testutil.Write("bin.dat", "\x00\x01\x02"))
	r.Commit("Ada", "ada@x.com", testutil.Day(2), "remove a", testutil.Remove("a.txt"))
	r.Checkout("feat", true)
	r.Commit("Cy", "cy@x.com", testutil.Day(3), "feature", testutil.Write("feat.txt", "f\n"))
	r.Checkout("main", false)
	r.Merge("feat", testutil.Day(4))

	cs := walk(t, r.Dir, gitlog.Options{})
	if len(cs) != 4 {
		t.Fatalf("want 4 first-parent commits, got %d", len(cs))
	}

	// Chronological order.
	if cs[0].Subject != "init" || cs[3].Subject != "Merge feat" {
		t.Fatalf("unexpected order: %q .. %q", cs[0].Subject, cs[3].Subject)
	}
	if cs[0].Time != testutil.Day(0).Unix() || cs[0].Author != "Ada" || cs[0].Email != "ada@x.com" {
		t.Errorf("header fields: %+v", cs[0])
	}

	// Adds with counts.
	if ch := find(t, cs[0], "a.txt"); ch.Status != 'A' || ch.Added != 3 || ch.Deleted != 0 {
		t.Errorf("a.txt add: %+v", ch)
	}

	// Rename carries old path, status R and the post-rename delta.
	c1 := cs[1]
	if c1.Body != "Fixes #12" {
		t.Errorf("body: %q", c1.Body)
	}
	if ch := find(t, c1, "src/c.go"); ch.Status != 'R' || ch.OldPath != "src/b.go" || ch.Added != 1 || ch.Deleted != 0 {
		t.Errorf("rename: %+v", ch)
	}
	if ch := find(t, c1, "a.txt"); ch.Status != 'M' || ch.Added != 0 || ch.Deleted != 1 {
		t.Errorf("modify: %+v", ch)
	}
	if ch := find(t, c1, "bin.dat"); ch.Status != 'A' || !ch.Binary {
		t.Errorf("binary: %+v", ch)
	}

	// Delete.
	if ch := find(t, cs[2], "a.txt"); ch.Status != 'D' || ch.Deleted != 2 {
		t.Errorf("delete: %+v", ch)
	}

	// Merge diffed against first parent shows the merged-in file.
	if ch := find(t, cs[3], "feat.txt"); ch.Status != 'A' || ch.Added != 1 {
		t.Errorf("merge: %+v", ch)
	}
}

func TestWalkMaxCommitsKeepsMostRecent(t *testing.T) {
	r := testutil.New(t)
	for i := 0; i < 5; i++ {
		r.Commit("A", "a@x.com", testutil.Day(i), "c"+string(rune('0'+i)), testutil.Write("f.txt", testutil.Lines("l", i+1)))
	}
	cs := walk(t, r.Dir, gitlog.Options{MaxCommits: 2})
	if len(cs) != 2 || cs[0].Subject != "c3" || cs[1].Subject != "c4" {
		t.Fatalf("got %d commits: %v", len(cs), cs)
	}
}

func TestWalkEmptyCommitAndOddPaths(t *testing.T) {
	r := testutil.New(t)
	r.Commit("A", "a@x.com", testutil.Day(0), "empty")
	r.Commit("A", "a@x.com", testutil.Day(1), "odd",
		testutil.Write("dir with space/x => y.txt", "1\n"),
		testutil.Write("tab\there.txt", "1\n2\n"))
	cs := walk(t, r.Dir, gitlog.Options{})
	if len(cs) != 2 || len(cs[0].Changes) != 0 {
		t.Fatalf("empty commit: %+v", cs)
	}
	if ch := find(t, cs[1], "dir with space/x => y.txt"); ch.Added != 1 {
		t.Errorf("odd path: %+v", ch)
	}
	if ch := find(t, cs[1], "tab\there.txt"); ch.Added != 2 {
		t.Errorf("tab path: %+v", ch)
	}
}
