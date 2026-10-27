# CodeSkyline

Any GitHub repository, rendered as a 3D city from its git history. Folders are
districts, files are buildings, height is lines of code, and the hotspots most
likely to need bug fixes are on fire.

**[codeskyline.dev](https://codeskyline.dev)** · [Benchmarks](docs/benchmarks.md) · [Architecture](docs/architecture.md)

![react/react as a city, colored by owner](docs/images/react-owners.png)

## Usage

Open [codeskyline.dev](https://codeskyline.dev) and paste a public repository,
or replace `github.com` with `codeskyline.dev` in any repository URL. Cities
are built on first visit, usually in under a minute, and cached per commit.

## Features

- **Hotspots.** Recent churn × complexity. On twelve repositories the top
  twenty hotspots contained 70% of the files fixed for bugs in the following
  year, against a 21% base rate ([method](docs/benchmarks.md)).
- **Time travel.** Replay the full history on the GPU and watch the city grow,
  burn and get demolished. Exportable as video.
- **Hidden coupling.** Files that change together without importing each other,
  mined from co-change in the log.
- **Ownership.** Bus factor per district, ghost towns, and what would be left
  unowned if a given person left.
- **Lenses.** Churn, activity, hotspots, owners, language, age, and diff.
- **Sharing.** Every view is a URL with a link preview, plus a README badge.

## README badge

```md
[![CodeSkyline](https://codeskyline.dev/badge/OWNER/REPO.svg)](https://codeskyline.dev/OWNER/REPO)
```

[![CodeSkyline](https://codeskyline.dev/badge/harshitaajoshi/codeskyline.svg)](https://codeskyline.dev/harshitaajoshi/codeskyline)

Options: `?theme=light`, `?bare=1`, `?label=<text>`.

## GitHub Action

Posts a risk report on each pull request: hotspots touched, files that usually
change alongside the ones changed, single-owner districts and suggested
reviewers. Runs entirely in your CI.

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
city out and animates history in a vertex shader. The hosted service is a
Cloudflare Worker with the analyzer in a scale-to-zero container and cities
stored in R2.

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
