# CodeSkyline

**Turn any GitHub repo into a 3D city you can walk through.**

Paste a repository URL and CodeSkyline renders its codebase as a city: folders are
districts, files are buildings, height is lines of code, color is how often a file
changes, and buildings that *catch fire* are the bug-prone hotspots hiding in your
commit history. Scrub a timeline to watch the city grow over years of commits.

> Status: early development. The analyzer CLI works; the 3D viewer is next.

## What makes it different

- **Time travel** — a slider replays the whole history on the GPU: buildings rise,
  get demolished and catch fire as the commits roll by.
- **Ownership view** — districts colored by who really maintains them, with
  bus-factor warnings and "ghost town" detection for abandoned code.
- **Hotspots that mean something** — churn × complexity × bug-fix history
  (after Tornhill's *Your Code as a Crime Scene*), validated against real repos.
- **PR mode** — a GitHub Action posts a city diff on every pull request: which
  buildings changed, and whether you just touched something on fire.
- **Shareable** — every view is a URL; every repo gets a README badge that is a
  tiny silhouette of its own skyline.

## Repository layout

```
analyzer/   Go — the analysis engine (CLI, hosted worker and GitHub Action share it)
web/        React + Three.js viewer
edge/       Cloudflare Worker: API, job queue, short links, badges
action/     GitHub Action for PR mode
format/     The city document format and golden fixtures
docs/       Architecture, decisions, benchmarks
```

## Analyzer quick start

```sh
cd analyzer
go build -o bin/csky ./cmd/csky
./bin/csky analyze https://github.com/expressjs/express --pretty
# → expressjs__express.city.json
```

Or analyze a local clone: `./bin/csky analyze ~/src/my-project`.

The analyzer never checks out a working tree — it reads history with `git log`
and file contents with `git cat-file`, so untrusted repositories cannot run code
or plant symlinks on the machine doing the analysis.

## Development

```sh
cd analyzer && go test ./...
```

## License

MIT
