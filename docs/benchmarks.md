# Benchmarks

## Does the hotspot score predict where bugs get fixed?

The city sets buildings on fire using

```
hotspot = pct(recent churn) × pct(complexity)
```

That is a claim about the future ("these files will keep needing fixes"), so
it should be tested like one. `csky validate` does:

1. Check out the repository as it was **12 months before HEAD** and rank every
   eligible file (not generated, vendored or binary) by several formulas.
2. Walk the commits that landed **after** that point and record which files
   received a bug-fix commit (message matches fix/bug/crash/regression/closes #n;
   renames followed).
3. Report **precision@20**: of the 20 top-ranked files, how many were fixed —
   against the base rate (what random picking would get).

Everything comes from `git log`; no issue tracker is needed, which also means
"bug fix" is a heuristic on commit messages and the numbers below inherit that
noise.

### Results (ranked 12 months before each repo's HEAD, October 2026)

| repo | commits | files | base rate | **churn×cplx** | churn×cplx×(1+bugs) | churn²×cplx×(1+bugs) | churn only | size only | complexity only | lift |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| facebook/react | 14,299 | 6,488 | 16% | **100%** | 65% | 70% | 100% | 80% | 85% | 6.3× |
| vuejs/core | 6,085 | 653 | 33% | **80%** | 85% | 85% | 70% | 80% | 85% | 2.4× |
| fastify/fastify | 2,601 | 366 | 29% | **80%** | 75% | 80% | 80% | 75% | 90% | 2.8× |
| gin-gonic/gin | 1,196 | 124 | 29% | **75%** | 75% | 75% | 90% | 75% | 70% | 2.6× |
| pallets/flask | 2,232 | 224 | 7% | **40%** | 40% | 40% | 40% | 45% | 30% | 5.7× |
| psf/requests | 2,559 | 118 | 21% | **40%** | 40% | 40% | 35% | 55% | 60% | 1.9× |
| vitejs/vite | 8,170 | 2,213 | 15% | **100%** | 75% | 90% | 100% | 90% | 95% | 6.7× |
| prettier/prettier | 7,687 | 7,571 | 2% | **70%** | 50% | 55% | 40% | 25% | 75% | 35× |
| expressjs/express | 3,817 | 215 | 7% | **30%** | 30% | 25% | 45% | 45% | 25% | 4.3× |
| sveltejs/svelte | 6,203 | 7,953 | 6% | **100%** | 50% | 65% | 100% | 85% | 100% | 16.7× |
| pmndrs/zustand | 1,122 | 120 | 52% | **40%** | 40% | 40% | 90% | 95% | 40% | 0.8× |
| tailwindlabs/tailwindcss | 4,469 | 507 | 35% | **90%** | 90% | 95% | 70% | 85% | 75% | 2.6× |
| **mean** | | | **21%** | **70%** | 60% | 63% | 72% | 70% | 69% | median 3.5× |

Columns: *base rate* = fraction of all eligible files that got a bug fix
(random precision). The bold column is what ships. *Lift* = shipped precision
÷ base rate.

### What the numbers say

- **The hotspot ranking works.** Across 12 repositories the top-20 files by
  churn × complexity contained a file that later needed a bug fix 70% of the
  time, against a 21% base rate — a median 3.5× lift, and 100% on React, Vite
  and Svelte.
- **The bug-fix-history multiplier made it worse** (60% vs 70%), so it was
  removed from the score. The ratio is noisy on rarely-touched files — one fix
  in two commits scores 0.5 — and promoted dormant files over active ones.
  Bug-fix counts are still shown in the inspector and PR reports as context.
- **Churn alone is as good a predictor of *where fixes land*** (72%), which is
  the well-known "churn predicts churn" effect: fixes happen where work
  happens. Complexity is kept because the product question is not only "where
  will fixes land" but "where will they be expensive": a hotspot is a file
  that is both busy *and* hard to change, which is where review attention
  pays off. Size and complexity alone also score ~70% for the same reason.
- **Small or oddly-distributed repos are noisy.** zustand's base rate is 52%
  (half the files were "fixed" in a year), so no ranking can show lift;
  prettier's is 2% (7.5k files, mostly test fixtures), which is why its lift
  is 35×. Read per-repo precision, not lift, for small repos.
- **Limits.** Bug fixes are detected from commit messages; repos with terse
  messages under-count. The 12-month window and top-20 are arbitrary; the
  harness takes `--months` and `--top` so you can try others.

### Reproduce

```sh
cd analyzer && go build -o bin/csky ./cmd/csky
./bin/csky validate https://github.com/vuejs/core --months 12 --top 20
./bin/csky validate https://github.com/vuejs/core --md     # one table row
```
