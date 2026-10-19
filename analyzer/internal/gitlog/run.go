package gitlog

import (
	"context"
	"fmt"
	"io"
	"os/exec"
	"strconv"
)

// Options controls which part of history is walked.
type Options struct {
	Rev        string // defaults to HEAD
	MaxCommits int    // 0 = unlimited; otherwise the most recent N first-parent commits
}

// Walk runs git log on the repository at dir and calls fn for each commit in
// chronological (oldest first) order along the first-parent chain. Merges are
// diffed against their first parent so merged-in work is attributed to the
// merge commit, which is what a mainline-only history needs.
func Walk(ctx context.Context, dir string, opt Options, fn func(*Commit) error) error {
	rev := opt.Rev
	if rev == "" {
		rev = "HEAD"
	}
	args := []string{
		"-C", dir, "log",
		"--first-parent", "--diff-merges=first-parent",
		"--raw", "--numstat", "-M", "-z", "--reverse",
		"--use-mailmap", "--date=unix",
		"--format=%x1e%H%x1f%an%x1f%ae%x1f%at%x1f%s%x1f%b",
	}
	if opt.MaxCommits > 0 {
		args = append(args, "-n", strconv.Itoa(opt.MaxCommits))
	}
	args = append(args, rev)

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Env = append(cmd.Environ(), "GIT_TERMINAL_PROMPT=0")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr := &limitedBuffer{max: 4096}
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("gitlog: start git: %w", err)
	}

	p := NewParser(stdout)
	var walkErr error
	for {
		c, err := p.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			walkErr = err
			break
		}
		if err := fn(c); err != nil {
			walkErr = err
			break
		}
	}
	if walkErr != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return walkErr
	}
	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("gitlog: git log failed: %w: %s", err, stderr.String())
	}
	return nil
}

// limitedBuffer keeps only the first max bytes written to it.
type limitedBuffer struct {
	buf []byte
	max int
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if room := b.max - len(b.buf); room > 0 {
		if len(p) > room {
			p = p[:room]
		}
		b.buf = append(b.buf, p...)
	}
	return len(p), nil
}

func (b *limitedBuffer) String() string { return string(b.buf) }
