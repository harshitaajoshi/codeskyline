# Architecture

```
┌──────────────────── Cloudflare ─────────────────────────────────────┐
│ Worker (TypeScript + Hono)                                          │
│  ├─ static assets: the React/Three.js viewer                        │
│  ├─ POST /api/analyze ──▶ Durable Object "Job:{owner/repo@sha}"     │
│  │                         • single-flight: N requests → 1 job      │
│  │                         • WebSocket progress fan-out             │
│  ├─ Queue: analysis jobs with retries + concurrency limits          │
│  ├─ GET /badge/:o/:r.svg   /og/:o/:r.png   /s/:shortId  /embed/...  │
│  ├─ D1: repos, analyses, short links, PR runs, gallery              │
│  └─ R2: city documents, badges, OG images, PR diff images           │
└───────────────┬─────────────────────────────────────────────────────┘
                │ starts / streams progress
                ▼
┌──────── Cloudflare Container (Go analyzer, scale-to-zero) ──────────┐
│ clone (bare) → git log → count → metrics → layout → encode → R2     │
└─────────────────────────────────────────────────────────────────────┘

The same Go binary also runs as:
  • `csky` CLI on a laptop — pre-builds the famous-repo gallery
  • a GitHub Action inside users' own CI — PR mode
```

## One engine, three hosts

`analyzer/` is a single Go module. Every consumer (CLI, container worker, GitHub
Action) calls `analyze.Run` and gets a `model.City`. Given the same commit it
produces identical output, which is what makes shareable links and cached
analyses trustworthy.

## Reading untrusted repositories safely

- Clones are **bare** (`--bare --single-branch --no-tags`), so no working tree,
  no symlinks on disk, no hooks.
- History comes from `git log --first-parent --raw --numstat -z`; contents from
  `git cat-file --batch`. Nothing in the repo is ever executed.
- `protocol.file.allow=never` and `GIT_TERMINAL_PROMPT=0` are forced.
- Size caps are checked via the GitHub API before cloning; per-stage timeouts
  apply during analysis.

## History walk

The analyzer walks the **first-parent chain** oldest-first, diffing merges
against their first parent. That attributes merged-in work to the merge commit,
which is the right granularity for a mainline-only timeline and keeps the walk
linear in the number of mainline commits.

Per file it keeps a running `added − deleted` total. Because the walk starts at
the root commit, that total must equal the real line count at HEAD; the
analyzer checks this for every file and reports mismatches in
`stats.lineMismatches`. A non-zero value on a full history is a parser bug.

Renames (`-M`) carry a file's identity forward: a moved file keeps its commit
count, creation date and owners.

## Layout

Bottom-up rectangle packing in the style of CodeCity, not an area-proportional
treemap. A treemap squeezes the small siblings of a dominant directory into
slivers (a `docs/` next to a `src/` that is 96 % of the repo ends up half a
unit wide). Instead every file gets a fixed **square lot** with area
`2 + sqrt(lines)/2`, each directory packs its children's lots into a
near-square district with a growing binary-tree packer, and the district grows
to fit. Nothing is distorted: equal files get equal lots, and a district's size
says how much is in it. Streets between siblings narrow with depth.

Children are sorted deterministically (largest first, then by name), so the
same tree always yields the same city.

For time travel the layout will be computed once over the union of every file
that ever existed, sized by its historical maximum, so buildings grow and
shrink in place and nothing reshuffles while scrubbing.

## Hotspots

```
score = pct(recent churn) × pct(complexity) × (1 + bug-fix ratio)
```

Percentile ranks make the product comparable across repos of any size.
Fire levels are assigned by rank (top 2 % inferno, next 5 % flames, next 8 %
smoke) so every city has a few burning buildings. Lockfiles, vendored and
generated code are flagged (Linguist-style heuristics + `.gitattributes`) and
can never burn.

## Ownership

Knowledge-map style: each author's authored lines, decayed with a one-year
half-life, after `.mailmap`. GitHub logins are derived from noreply addresses
so avatars need no API calls for most authors.

## Document format

v1 is JSON (`*.city.json`). A compact binary form with time-travel keyframes
(`.csky`) arrives with the timeline feature; see `format/`.
