# CodeSkyline PR City (GitHub Action)

On every pull request, posts a sticky comment with a risk report built from
your repository's own history:

- **🔥 Hotspots touched** — files that change often, are complex, and keep
  needing bug fixes (churn × complexity × bug-fix history at the merge base)
- **🚌 Bus factor 1** — districts where one person holds all the knowledge
- **🗺️ Ownership crossings** — files mostly written by someone else, with
  suggested reviewers
- **👻 Ghost town** — files nobody active still owns

It runs entirely inside your workflow: no tokens leave the runner, nothing is
uploaded. The same report is written to the job summary, so it works on fork
PRs too (where the token cannot comment).

## Usage

```yaml
name: CodeSkyline
on: [pull_request]
permissions:
  contents: read
  pull-requests: write
jobs:
  city:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }      # full history = better hotspots
      - uses: harshitaajoshi/codeskyline/action@v1
```

Inputs: `version` (csky release, default `latest`), `comment` (`true`),
`city-url` (hosted CodeSkyline to link from; empty to omit).
Outputs: `risk`, `score`, `report`.

Fail the job above a threshold if you like:

```yaml
      - uses: harshitaajoshi/codeskyline/action@v1
        id: city
      - run: test "${{ steps.city.outputs.risk }}" != high
```
