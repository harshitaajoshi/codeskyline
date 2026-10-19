package metrics

import "testing"

func TestIsBugFix(t *testing.T) {
	yes := []string{"fix: null deref", "Fixed crash on startup", "Bugfix for #12", "closes #44", "hotfix", "Resolves #9", "regression in parser"}
	no := []string{"add feature", "refactor prefix handling", "docs", "Fixtures for tests", "affix label"}
	for _, s := range yes {
		if !IsBugFix(s, "") {
			t.Errorf("%q should be a bug fix", s)
		}
	}
	for _, s := range no {
		if IsBugFix(s, "") {
			t.Errorf("%q should not be a bug fix", s)
		}
	}
}

func TestClassify(t *testing.T) {
	cases := []struct {
		path      string
		gen, vend bool
	}{
		{"src/app.ts", false, false},
		{"package-lock.json", true, false},
		{"web/pnpm-lock.yaml", true, false},
		{"api/v1/user.pb.go", true, false},
		{"node_modules/x/index.js", false, true},
		{"third_party/lib.c", false, true},
		{"assets/jquery.min.js", false, true},
		{"src/__snapshots__/a.snap", true, false},
		{"types/global.d.ts", true, false},
	}
	for _, c := range cases {
		g, v := Classify(c.path, nil, nil)
		if g != c.gen || v != c.vend {
			t.Errorf("%s: generated=%v vendored=%v, want %v %v", c.path, g, v, c.gen, c.vend)
		}
	}
	f := false
	if g, _ := Classify("package-lock.json", &f, nil); g {
		t.Error("gitattributes should override heuristics")
	}
}

func TestCountGoAndUnknown(t *testing.T) {
	src := []byte("package x\n\n// comment\nfunc f(a int) int {\n\tif a > 0 {\n\t\treturn 1\n\t}\n\treturn 0\n}\n")
	l := Count("x.go", src)
	if l.Lang != "Go" || l.Lines != 9 || l.Comment != 1 || l.Blank != 1 || l.Complexity < 1 {
		t.Errorf("go: %+v", l)
	}
	u := Count("notes.weirdext", []byte("a\nb\nc"))
	if u.Lines != 3 || u.Binary {
		t.Errorf("unknown: %+v", u)
	}
	if b := Count("x.bin", []byte("ab\x00cd")); !b.Binary {
		t.Errorf("binary: %+v", b)
	}
}

func TestScoreHotspotsRanksAndThresholds(t *testing.T) {
	in := make([]HotspotInput, 100)
	for i := range in {
		in[i] = HotspotInput{RecentCommits: 1, RecentChurn: 5, Complexity: 2, Commits: 1, Eligible: true}
	}
	in[7] = HotspotInput{RecentCommits: 20, RecentChurn: 900, Complexity: 60, Commits: 25, BugFixes: 10, Eligible: true}
	in[8] = HotspotInput{RecentCommits: 10, RecentChurn: 300, Complexity: 30, Commits: 12, BugFixes: 1, Eligible: true}
	in[9] = HotspotInput{RecentCommits: 50, RecentChurn: 999, Complexity: 99, Commits: 50, BugFixes: 20, Eligible: false}
	s, fire := ScoreHotspots(in)
	if fire[7] != 3 || fire[8] < 1 || fire[9] != 0 || fire[0] != 0 {
		t.Errorf("fire: 7=%d 8=%d 9=%d 0=%d", fire[7], fire[8], fire[9], fire[0])
	}
	if !(s[7] > s[8] && s[8] > s[0]) || s[9] != 0 {
		t.Errorf("scores: %v %v %v %v", s[7], s[8], s[0], s[9])
	}
}

func TestTopOwnersAndLogin(t *testing.T) {
	o := TopOwners(map[int]float64{0: 10, 1: 30, 2: 60}, 2)
	if len(o) != 2 || o[0].Author != 2 || o[0].Share != 0.6 || o[1].Author != 1 {
		t.Errorf("owners: %+v", o)
	}
	if GitHubLogin("12345+octo-cat@users.noreply.github.com") != "octo-cat" || GitHubLogin("a@b.com") != "" {
		t.Error("login extraction")
	}
}
