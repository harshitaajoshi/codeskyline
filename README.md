# CodeSkyline

**Every repository is a city.** CodeSkyline turns a GitHub repository's git
history into a 3D city you can fly through. Folders are districts, files are
buildings, height is lines of code, and the files most likely to break next
are on fire.

**[codeskyline.dev](https://codeskyline.dev)** · [Benchmarks](docs/benchmarks.md) · [Architecture](docs/architecture.md)

![react/react growing from 2013 to today, its hotspots catching fire](docs/images/timelapse.webp)

<sub>react/react, from the first commit to today: 15k commits, 1,443 authors, 135 buildings on fire.</sub>

## Why

A codebase's history knows things its code doesn't: which files keep
breaking, who still holds the knowledge, what quietly changes together. That
usually lives in a dashboard nobody opens. CodeSkyline makes it something you
take in at a glance and can walk around in.

## Usage

Open [codeskyline.dev](https://codeskyline.dev) and paste a public repository,
or swap the host in any repository URL:

```
github.com/vuejs/core  →  codeskyline.dev/vuejs/core
```

Cities are built on the first visit, usually in under a minute, and cached
per commit.

## What you'll see

- **Fire where the bugs are.** Hotspots are recent churn × complexity. On
  twelve repositories, the top twenty contained 70% of the files fixed for
  bugs in the following year, against a 21% base rate
  ([method](docs/benchmarks.md)).
- **The whole history in seconds.** Press play and the city builds itself
  commit by commit on the GPU: towers rise, catch fire and get demolished.
  Export it as a video.
- **Hidden coupling.** Files that keep changing together without importing
  each other, bridged across the city.
- **The bus factor, made visible.** Pick a person and every building only
  they still understand goes dark.
- **Six lenses.** Churn, activity, hotspots, owners, language and age, plus a
  diff lens for comparing two commits.
- **Walk the streets.** Drop to street level, or press ⌘K to fly to any file.
- **Share any view.** Every view is a link that unfurls with a picture of the
  skyline.

![react/react colored by owner: if @josephsavona left, 2,914 files would have no active owner](docs/images/react-owners.png)

## README badge

A silhouette of your repository's own skyline, with its hotspots in orange.

```md
[![CodeSkyline](https://codeskyline.dev/badge/OWNER/REPO.svg)](https://codeskyline.dev/OWNER/REPO)
```

[![CodeSkyline](https://codeskyline.dev/badge/harshitaajoshi/codeskyline.svg)](https://codeskyline.dev/harshitaajoshi/codeskyline)

Options: `?theme=light`, `?bare=1`, `?label=<text>`.

## GitHub Action

A risk report on every pull request: hotspots touched, files that usually
change alongside the ones changed, single-owner districts and suggested
reviewers. Runs entirely in your CI; nothing leaves the runner.

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }
- uses: harshitaajoshi/codeskyline/action@v1
```

See [`action/`](action/README.md) for inputs.

## How it works

A Go analyzer reads the repository with `git log --numstat` and `git cat-file`.
It never checks out a working tree, so an untrusted repository cannot run code
during analysis. It follows renames, classifies generated and vendored files,
and writes a compact city document. The viewer (React Three Fiber) lays the
city out and replays its history in a vertex shader, smoothly at 50,000
buildings. The hosted service is a Cloudflare Worker with the analyzer in a
scale-to-zero container and cities stored in R2, for about $5 a month.

## Development

Requires Go 1.27+, Node 22+ and pnpm.

```sh
pnpm install
pnpm dev:web        # viewer on :5173 with a bundled sample city
pnpm dev:edge       # hosted API on :8787 (needs Docker)
```

Analyze a repository locally:

```sh
cd analyzer && go build -o bin/csky ./cmd/csky
./bin/csky analyze https://github.com/expressjs/express
```

Drop the resulting `.city.json` onto the viewer to open it.

Tests: `go test ./...` in `analyzer/`, `pnpm --filter web test`,
`pnpm --filter edge test`. Self-hosting: see [`edge/README.md`](edge/README.md).

| Directory   | Contents                                       |
| ----------- | ---------------------------------------------- |
| `analyzer/` | Go analysis engine: CLI, hosted worker, Action |
| `web/`      | Viewer                                         |
| `edge/`     | Cloudflare Worker, queue, storage, badges      |
| `action/`   | GitHub Action for pull requests                |
| `docs/`     | Architecture and benchmarks                    |

## License

[MIT](LICENSE)
