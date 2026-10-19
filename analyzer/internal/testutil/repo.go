// Package testutil builds real git repositories for tests, so the parser and
// pipeline are exercised against genuine git output rather than mocks.
package testutil

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Repo is a scratch repository.
type Repo struct {
	Dir string
	t   testing.TB
	n   int
}

// Op mutates the working tree before a commit.
type Op func(r *Repo)

// Write creates or overwrites a file.
func Write(path, content string) Op {
	return func(r *Repo) {
		full := filepath.Join(r.Dir, path)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			r.t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			r.t.Fatal(err)
		}
	}
}

// Remove deletes a file.
func Remove(path string) Op {
	return func(r *Repo) { r.git("rm", "-q", path) }
}

// Move renames a file. git mv needs the destination directory to exist.
func Move(from, to string) Op {
	return func(r *Repo) {
		if err := os.MkdirAll(filepath.Dir(filepath.Join(r.Dir, to)), 0o755); err != nil {
			r.t.Fatal(err)
		}
		r.git("mv", from, to)
	}
}

// New initializes an empty repository on branch main.
func New(t testing.TB) *Repo {
	t.Helper()
	r := &Repo{Dir: t.TempDir(), t: t}
	r.git("init", "-q", "-b", "main")
	r.git("config", "user.name", "Test")
	r.git("config", "user.email", "test@example.com")
	r.git("config", "commit.gpgsign", "false")
	return r
}

// Commit applies ops and commits them as author at time when. Each commit is
// stamped one minute later than when so ordering is unambiguous.
func (r *Repo) Commit(author, email string, when time.Time, msg string, ops ...Op) string {
	r.t.Helper()
	for _, op := range ops {
		op(r)
	}
	r.git("add", "-A")
	ts := strconv.FormatInt(when.Unix(), 10)
	cmd := exec.Command("git", "-C", r.Dir, "commit", "-q", "--allow-empty", "-m", msg,
		"--author", author+" <"+email+">")
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_DATE=@"+ts+" +0000",
		"GIT_COMMITTER_DATE=@"+ts+" +0000",
		"GIT_COMMITTER_NAME="+author, "GIT_COMMITTER_EMAIL="+email)
	if out, err := cmd.CombinedOutput(); err != nil {
		r.t.Fatalf("git commit: %v: %s", err, out)
	}
	r.n++
	return strings.TrimSpace(r.git("rev-parse", "HEAD"))
}

// Merge merges branch into the current branch with a merge commit.
func (r *Repo) Merge(branch string, when time.Time) {
	r.t.Helper()
	ts := strconv.FormatInt(when.Unix(), 10)
	cmd := exec.Command("git", "-C", r.Dir, "merge", "-q", "--no-ff", "-m", "Merge "+branch, branch)
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_DATE=@"+ts+" +0000", "GIT_COMMITTER_DATE=@"+ts+" +0000")
	if out, err := cmd.CombinedOutput(); err != nil {
		r.t.Fatalf("git merge: %v: %s", err, out)
	}
}

// Checkout switches branches, creating with create=true.
func (r *Repo) Checkout(branch string, create bool) {
	if create {
		r.git("checkout", "-q", "-b", branch)
	} else {
		r.git("checkout", "-q", branch)
	}
}

func (r *Repo) git(args ...string) string {
	r.t.Helper()
	cmd := exec.Command("git", append([]string{"-C", r.Dir}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		r.t.Fatalf("git %v: %v: %s", args, err, out)
	}
	return string(out)
}

// Lines builds n numbered lines of text.
func Lines(prefix string, n int) string {
	var b strings.Builder
	for i := 1; i <= n; i++ {
		b.WriteString(prefix)
		b.WriteString(strconv.Itoa(i))
		b.WriteByte('\n')
	}
	return b.String()
}

// T0 is a fixed epoch for fixtures: 2020-01-01T00:00:00Z.
var T0 = time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)

// Day returns T0 plus n days.
func Day(n int) time.Time { return T0.Add(time.Duration(n) * 24 * time.Hour) }
