package pr_test

import (
	"context"
	"strings"
	"testing"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/analyze"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/pr"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/repo"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/testutil"
)

const src = "package core\n\nfunc f(x int) int {\n\tif x > 1 {\n\t\treturn 1\n\t}\n\treturn x\n}\n"

func TestBuildFlagsHotspotsCrossingsAndBus(t *testing.T) {
	r := testutil.New(t)
	bob := "bob@x.com"
	r.Commit("Ada", "ada@x.com", testutil.Day(0), "init",
		testutil.Write("core/engine.go", src),
		testutil.Write("core/util.go", "package core\n"),
		testutil.Write("docs/readme.md", "hi\n"))
	// Bob rewrites core/ so thoroughly that Ada's share drops below the
	// "still knows it" threshold: core becomes a one-person district.
	for i := 1; i <= 6; i++ {
		msg := "tweak"
		if i%2 == 0 {
			msg = "fix: crash"
		}
		r.Commit("Bob", bob, testutil.Day(i), msg, testutil.Write("core/engine.go", src+testutil.Lines("// n", i*20)))
	}
	base := r.Commit("Bob", bob, testutil.Day(7), "more", testutil.Write("core/util.go", "package core\n"+testutil.Lines("var x", 20)))
	r.Checkout("feature", true)
	head := r.Commit("Cy", "cy@x.com", testutil.Day(8), "feature",
		testutil.Write("core/engine.go", src+"// cy\n"),
		testutil.Write("docs/new.md", "new\n"),
		testutil.Remove("docs/readme.md"))

	rp, err := repo.Open(context.Background(), r.Dir)
	if err != nil {
		t.Fatal(err)
	}
	city, err := analyze.Run(context.Background(), rp, analyze.Options{Name: "fixture", Rev: base, Now: testutil.Day(9).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	if city.Repo.Head != base {
		t.Fatalf("analyzed %s, want base %s", city.Repo.Head, base)
	}
	diff, err := rp.Diff(context.Background(), base, head)
	if err != nil {
		t.Fatal(err)
	}
	if len(diff) != 3 {
		t.Fatalf("diff: %+v", diff)
	}

	rep := pr.Build(city, diff, head, "Cy")
	// engine.go: +1 −120, new.md: +1, readme.md: −1
	if len(rep.Changes) != 3 || rep.Added != 2 || rep.Deleted != 121 {
		t.Errorf("changes: added=%d deleted=%d %+v", rep.Added, rep.Deleted, rep.Changes)
	}
	if len(rep.Burning) != 1 || rep.Burning[0].Path != "core/engine.go" {
		t.Errorf("burning: %+v", rep.Burning)
	}
	// Both touched existing files belong to someone else; Bob owns the hot
	// one so he is the first suggested reviewer.
	if len(rep.Crossings) != 2 || rep.Reviewers[0] != "Bob" {
		t.Errorf("crossings: %+v reviewers %v", rep.Crossings, rep.Reviewers)
	}
	if len(rep.BusOne) != 1 || rep.BusOne[0] != "core" {
		t.Errorf("bus-factor-1 districts: %v (dirs %+v)", rep.BusOne, city.Dirs)
	}
	if rep.Risk == "low" {
		t.Errorf("risk should not be low: %+v", rep)
	}

	md := pr.Markdown(rep, "https://example.test/a/b")
	for _, want := range []string{"codeskyline-pr", "Hotspots touched", "core/engine.go", "open the city", "Bus factor 1"} {
		if !strings.Contains(md, want) {
			t.Errorf("markdown missing %q:\n%s", want, md)
		}
	}
}
