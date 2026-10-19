package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"time"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/analyze"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/pr"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/repo"
)

// runPR implements `csky pr`: analyze the repository at the merge base of a
// pull request and report what the PR touches.
func runPR(args []string) int {
	fs := flag.NewFlagSet("pr", flag.ExitOnError)
	var path, base, head, author, name, cityURL, mdOut, jsonOut, summary string
	var maxCommits int
	fs.StringVar(&path, "repo", ".", "path to the repository (full history)")
	fs.StringVar(&base, "base", "", "base ref/sha (required)")
	fs.StringVar(&head, "head", "HEAD", "head ref/sha")
	fs.StringVar(&author, "author", "", "PR author login or name, for ownership crossings")
	fs.StringVar(&name, "name", "", "display name, e.g. owner/repo")
	fs.StringVar(&cityURL, "city-url", "", "link to the hosted city, if any")
	fs.StringVar(&mdOut, "md", "", "write the markdown comment here (default: stdout)")
	fs.StringVar(&jsonOut, "json", "", "write the JSON report here")
	fs.StringVar(&summary, "summary", "", "append the markdown to this file too (e.g. $GITHUB_STEP_SUMMARY)")
	fs.IntVar(&maxCommits, "max-commits", 0, "cap commits walked")
	_ = fs.Parse(args)
	if base == "" {
		fmt.Fprintln(os.Stderr, "csky pr: --base is required")
		return 2
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	start := time.Now()
	progress := func(stage, detail string) {
		fmt.Fprintf(os.Stderr, "[%6.2fs] %-8s %s\n", time.Since(start).Seconds(), stage, detail)
	}

	r, err := repo.Open(ctx, path)
	if err != nil {
		return fail(err)
	}
	headSHA, err := r.Resolve(ctx, head)
	if err != nil {
		return fail(fmt.Errorf("resolve head: %w", err))
	}
	mergeBase, err := r.MergeBase(ctx, base, headSHA)
	if err != nil {
		return fail(fmt.Errorf("merge-base: %w", err))
	}
	progress("base", mergeBase[:12])
	city, err := analyze.Run(ctx, r, analyze.Options{Name: name, Rev: mergeBase, MaxCommits: maxCommits, Keyframes: 2, Progress: progress})
	if err != nil {
		return fail(err)
	}
	diff, err := r.Diff(ctx, mergeBase, headSHA)
	if err != nil {
		return fail(err)
	}
	rep := pr.Build(city, diff, headSHA, author)
	md := pr.Markdown(rep, cityURL)

	if jsonOut != "" {
		b, _ := json.MarshalIndent(rep, "", "  ")
		if err := os.WriteFile(jsonOut, b, 0o644); err != nil {
			return fail(err)
		}
	}
	if mdOut != "" {
		if err := os.WriteFile(mdOut, []byte(md), 0o644); err != nil {
			return fail(err)
		}
	} else {
		fmt.Print(md)
	}
	if summary != "" {
		f, err := os.OpenFile(summary, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err == nil {
			_, _ = f.WriteString(strings.TrimPrefix(md, "<!-- codeskyline-pr -->\n"))
			_ = f.Close()
		}
	}
	progress("done", fmt.Sprintf("risk %s (%d) · %d files · %d burning", rep.Risk, rep.Score, len(rep.Changes), len(rep.Burning)))
	return 0
}
