# edge — the hosted service

One Cloudflare Worker serves the viewer, the API, badges and short links;
analysis runs in a scale-to-zero Cloudflare Container built from
`../analyzer/Dockerfile`.

```
POST /api/analyze {url}        resolve on GitHub → dedupe by commit → enqueue
GET  /api/jobs/:key            job state (WebSocket upgrade streams progress)
GET  /api/city/:o/:r[/:sha]    the city document (pre-gzipped, immutable)
GET  /api/repo/:o/:r           latest analysis summary
GET  /api/gallery              analyzed repos by stars
POST /api/share {target}       short link → GET /s/:id
GET  /badge/:o/:r.svg          skyline badge (?theme=light&label=…)
```

## Local development

```sh
pnpm install
pnpm --filter web build                 # the Worker serves web/dist
cd edge
pnpm db:migrate:local
pnpm dev                                # http://localhost:8787 (needs Docker for the container)
```

## First deploy (once)

Requires the Workers Paid plan ($5/mo) for Containers and Queues.

```sh
cd edge
pnpm exec wrangler login
pnpm exec wrangler d1 create codeskyline        # paste the id into wrangler.jsonc
pnpm exec wrangler r2 bucket create codeskyline-cities
pnpm exec wrangler queues create codeskyline-analysis
pnpm exec wrangler queues create codeskyline-dlq
pnpm exec wrangler secret put GITHUB_TOKEN      # a token with no scopes: raises the API limit to 5k/h
pnpm exec wrangler secret put CSKY_SECRET       # any random string; shared with the container
pnpm db:migrate
pnpm --filter web build && pnpm deploy
```

Set `PUBLIC_ORIGIN` in `wrangler.jsonc` to the deployed URL.

## Cost guardrails

- `MAX_JOBS_PER_MONTH` (default 300) is enforced in D1 before anything is
  enqueued; cached cities keep working when it is exhausted.
- `MAX_REPO_KB` rejects repositories above ~2 GB before cloning.
- Containers: `max_instances: 2`, `sleepAfter: 3m`, 20-minute job timeout.
- A per-IP rate limit on `/api/analyze`.
