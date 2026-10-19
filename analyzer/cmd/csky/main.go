// csky is the CodeSkyline analyzer CLI.
//
//	csky analyze <path | github url> [-o city.json] [--max-commits N] [--pretty]
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"time"

	"github.com/harshitaajoshi/codeskyline/analyzer/internal/analyze"
	"github.com/harshitaajoshi/codeskyline/analyzer/internal/repo"
)

var version = "dev"

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "analyze":
		os.Exit(runAnalyze(os.Args[2:]))
	case "pr":
		os.Exit(runPR(os.Args[2:]))
	case "validate":
		os.Exit(runValidate(os.Args[2:]))
	case "version", "--version", "-v":
		fmt.Println("csky", version)
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `csky — turn a git repository into a city

usage:
  csky analyze <path | https://github.com/owner/repo> [flags]
  csky pr --base <ref> [--head HEAD] [--author login] [--repo .] [flags]
  csky validate <path | url> [--months 12] [--top 20] [--md]
  csky version

analyze flags:
  -o, --out        output file (default: <name>.city.json)
  --max-commits    cap first-parent commits walked (default: all)
  --name           display name, e.g. owner/repo (default: derived)
  --pretty         indent JSON output
  --keep-clone     do not delete the temporary clone

pr flags:
  --md, --json, --summary   where to write the comment / report
  --city-url                link to the hosted city`)
}

func runAnalyze(args []string) int {
	fs := flag.NewFlagSet("analyze", flag.ExitOnError)
	var out, name string
	var maxCommits int
	var pretty, keepClone bool
	fs.StringVar(&out, "o", "", "output file")
	fs.StringVar(&out, "out", "", "output file")
	fs.StringVar(&name, "name", "", "display name")
	fs.IntVar(&maxCommits, "max-commits", 0, "cap commits walked")
	fs.BoolVar(&pretty, "pretty", false, "indent JSON")
	fs.BoolVar(&keepClone, "keep-clone", false, "keep temporary clone")
	fs.Usage = usage
	positional := parseInterleaved(fs, args)
	if len(positional) != 1 {
		usage()
		return 2
	}
	target := positional[0]

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	start := time.Now()
	progress := func(stage, detail string) {
		fmt.Fprintf(os.Stderr, "[%6.2fs] %-8s %s\n", time.Since(start).Seconds(), stage, detail)
	}

	var (
		r   *repo.Repo
		url string
		err error
	)
	if owner, repoName, ok := repo.ParseGitHubURL(target); ok {
		url = "https://github.com/" + owner + "/" + repoName
		if name == "" {
			name = owner + "/" + repoName
		}
		dir, err := repo.TempDir()
		if err != nil {
			return fail(err)
		}
		if !keepClone {
			defer os.RemoveAll(dir)
		}
		progress("clone", url)
		if r, err = repo.Clone(ctx, url+".git", dir); err != nil {
			return fail(err)
		}
	} else {
		if r, err = repo.Open(ctx, target); err != nil {
			return fail(err)
		}
		if name == "" {
			name = filepath.Base(strings.TrimSuffix(r.Dir, ".git"))
		}
	}

	city, err := analyze.Run(ctx, r, analyze.Options{Name: name, URL: url, MaxCommits: maxCommits, Progress: progress})
	if err != nil {
		return fail(err)
	}

	if out == "" {
		out = strings.ReplaceAll(name, "/", "__") + ".city.json"
	}
	f, err := os.Create(out)
	if err != nil {
		return fail(err)
	}
	enc := json.NewEncoder(f)
	if pretty {
		enc.SetIndent("", "  ")
	}
	if err := enc.Encode(city); err != nil {
		_ = f.Close()
		return fail(err)
	}
	if err := f.Close(); err != nil {
		return fail(err)
	}
	st, _ := os.Stat(out)
	progress("done", fmt.Sprintf("%s · %d files · %d dirs · %d commits · %d authors · %d burning · %.1f KB → %s",
		name, city.Stats.Files, city.Stats.Dirs, city.Repo.Commits, len(city.Authors), city.Stats.Burning,
		float64(st.Size())/1024, out))
	if city.Stats.LineMismatches > 0 {
		fmt.Fprintf(os.Stderr, "warning: %d files where numstat history disagrees with HEAD line count\n", city.Stats.LineMismatches)
	}
	return 0
}

// parseInterleaved parses flags that may appear before or after positional
// arguments (Go's flag package stops at the first positional) and returns
// the positionals.
func parseInterleaved(fs *flag.FlagSet, args []string) []string {
	var positional []string
	for rest := args; ; {
		_ = fs.Parse(rest)
		if fs.NArg() == 0 {
			break
		}
		positional = append(positional, fs.Arg(0))
		rest = fs.Args()[1:]
	}
	return positional
}

func fail(err error) int {
	fmt.Fprintln(os.Stderr, "csky:", err)
	return 1
}
