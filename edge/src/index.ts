import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { skylineBadge } from './badge'
import { ANALYZER_SHARDS } from './container'
import { GitHubError, commitsBetween, parseRepoInput, resolveRepo } from './github'
import { ogImage } from './og'
import { publicState } from './job'
import { repoFromPath } from './route'
import type { Env, JobMessage, Summary } from './types'

export { JobDO } from './job'
export { AnalyzerContainer } from './container'

const app = new Hono<{ Bindings: Env }>()
app.use('/api/*', cors())

const ok = <T>(c: { json: (v: T, s?: 200) => Response }, v: T) => c.json(v, 200)

// ---------------------------------------------------------------------------
// Analyze: resolve the repo on GitHub, dedupe by commit, enqueue.

app.post('/api/analyze', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { url?: string }
  const parsed = parseRepoInput(body.url ?? '')
  if (!parsed) return c.json({ error: 'Paste a public GitHub repository URL, like https://github.com/expressjs/express' }, 400)

  const ip = c.req.header('cf-connecting-ip') ?? 'anon'
  if (c.env.ANALYZE_RL) {
    const { success } = await c.env.ANALYZE_RL.limit({ key: ip })
    if (!success) return c.json({ error: 'Slow down — a few analyses per minute is plenty.' }, 429)
  }

  let info
  try {
    info = await resolveRepo(parsed.owner, parsed.name, c.env.GITHUB_TOKEN)
  } catch (e) {
    if (e instanceof GitHubError) return c.json({ error: e.message }, e.status as 404)
    throw e
  }
  if (info.isPrivate) return c.json({ error: 'Only public repositories can be analyzed.' }, 400)
  const maxKB = Number(c.env.MAX_REPO_KB)
  if (info.sizeKB > maxKB) {
    return c.json({ error: `This repository is ${(info.sizeKB / 1e6).toFixed(1)} GB; the hosted analyzer caps at ${(maxKB / 1e6).toFixed(1)} GB. Run the csky CLI locally instead.` }, 413)
  }

  const key = `${info.owner}/${info.name}@${info.sha}~${FORMAT}`
  const sizeKB = info.sizeKB
  // Already built for this exact commit? Done.
  const have = await c.env.DB.prepare('SELECT key FROM analyses WHERE key = ?').bind(key).first()
  if (have) return ok(c, { status: 'ready', key, owner: info.owner, name: info.name, sha: info.sha, sizeKB })

  // Single-flight through the job DO; it only enqueues the first time.
  const stub = c.env.JOB.get(c.env.JOB.idFromName(key))
  let existing = await stub.get()
  if (existing?.status === 'ready') {
    // The job finished but its row is gone (cleared or expired): run again.
    await stub.reset()
    existing = null
  }
  if (!existing || existing.status === 'error') {
    const allowed = await consumeBudget(c.env)
    if (!allowed) return c.json({ error: 'This month’s analysis budget is used up. Cached cities still work; new ones resume next month.' }, 503)
  }
  const msg: JobMessage = { key, owner: info.owner, name: info.name, sha: info.sha, url: `https://github.com/${info.owner}/${info.name}`, stars: info.stars, defaultBranch: info.defaultBranch }
  const state = await stub.start(msg)
  return ok(c, { ...publicState(state), owner: info.owner, name: info.name, sha: info.sha, sizeKB })
})

app.get('/api/jobs/:key{.+}', async (c) => {
  const key = c.req.param('key')
  const stub = c.env.JOB.get(c.env.JOB.idFromName(key))
  if (c.req.header('Upgrade') === 'websocket') return stub.fetch(c.req.raw)
  const s = await stub.get()
  if (!s) return c.json({ error: 'unknown job' }, 404)
  return ok(c, publicState(s))
})

// ---------------------------------------------------------------------------
// Cities: immutable per commit, served straight from R2 pre-gzipped.

app.get('/api/city/:owner/:name', async (c) => {
  const { owner, name } = c.req.param()
  const row = await c.env.DB.prepare('SELECT sha FROM analyses WHERE owner = ? COLLATE NOCASE AND name = ? COLLATE NOCASE ORDER BY analyzed_at DESC LIMIT 1')
    .bind(owner, name)
    .first<{ sha: string }>()
  if (!row) return c.json({ error: 'not analyzed yet' }, 404)
  const fmt = c.req.query('fmt')
  return c.redirect(`/api/city/${owner}/${name}/${row.sha}${fmt ? `?fmt=${encodeURIComponent(fmt)}` : ''}`, 302)
})

app.get('/api/city/:owner/:name/:sha', async (c) => {
  const { owner, name, sha } = c.req.param()
  // Newest analysis of this commit first, so a rebuilt city wins over an
  // older format while older ones stay reachable.
  const row = await c.env.DB.prepare('SELECT r2_key FROM analyses WHERE owner = ? COLLATE NOCASE AND name = ? COLLATE NOCASE AND sha = ? ORDER BY analyzed_at DESC LIMIT 1')
    .bind(owner, name, sha)
    .first<{ r2_key: string }>()
  const obj = await c.env.CITIES.get(row?.r2_key ?? r2Key(owner, name, sha))
  if (!obj) return c.json({ error: 'not found' }, 404)
  return new Response(obj.body, {
    // Workers extension: pass the stored gzip bytes through untouched.
    encodeBody: 'manual',
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
      ETag: obj.httpEtag,
    },
  })
})

/**
 * Where a repository stands: the city we have (if any), the commit GitHub is
 * on now and how far behind the city is, and a build in progress for that
 * newer commit (if one is running). Answers "is my city stale?" in one call.
 */
app.get('/api/repo/:owner/:name', async (c) => {
  const { owner, name } = c.req.param()
  const row = await c.env.DB.prepare(
    'SELECT key, sha, analyzed_at, files, lines, commits, authors, burning, summary FROM analyses WHERE owner = ? COLLATE NOCASE AND name = ? COLLATE NOCASE ORDER BY analyzed_at DESC LIMIT 1',
  )
    .bind(owner, name)
    .first<{ key: string; sha: string; analyzed_at: number; files: number; lines: number; commits: number; authors: number; burning: number; summary: string }>()
  const built = row ? { ...row, summary: JSON.parse(row.summary) as Summary } : null

  let latest: { sha: string; behind: number | null } | null = null
  let job = null
  if (c.req.query('fresh') !== '0') {
    try {
      const info = await resolveRepo(owner, name, c.env.GITHUB_TOKEN)
      const behind = built ? await commitsBetween(info.owner, info.name, built.sha, info.sha, c.env.GITHUB_TOKEN) : null
      latest = { sha: info.sha, behind }
      if (!built || info.sha !== built.sha) {
        const stub = c.env.JOB.get(c.env.JOB.idFromName(`${info.owner}/${info.name}@${info.sha}~${FORMAT}`))
        const s = await stub.get()
        if (s && s.status !== 'ready') job = publicState(s)
      }
    } catch (e) {
      if (!built) {
        if (e instanceof GitHubError) return c.json({ error: e.message }, e.status as 404)
        throw e
      }
      // GitHub unreachable: the city is still worth serving; just no freshness.
    }
  }
  if (!built && !job) return c.json({ error: 'not analyzed yet', latest }, 404)
  c.header('Cache-Control', 'private, max-age=60')
  return ok(c, { built, latest, job })
})

/**
 * The front page shows a short curated set, never everyone's recent builds:
 * what a stranger pasted is theirs, not a public feed.
 */
const FEATURED: [string, string][] = [
  ['react', 'react'],
  ['expressjs', 'express'],
  ['vuejs', 'core'],
  ['fastify', 'fastify'],
  ['vitejs', 'vite'],
  ['honojs', 'hono'],
  ['denoland', 'deno'],
  ['golang', 'go'],
]
app.get('/api/gallery', async (c) => {
  const rows = await c.env.DB.batch(
    FEATURED.map(([owner, name]) =>
      c.env.DB.prepare(
        `SELECT a.owner, a.name, a.sha, a.analyzed_at, a.files, a.lines, a.commits, a.authors, a.burning, COALESCE(r.stars, 0) AS stars
           FROM analyses a LEFT JOIN repos r ON r.owner = a.owner AND r.name = a.name
          WHERE a.owner = ? AND a.name = ? ORDER BY a.analyzed_at DESC LIMIT 1`,
      ).bind(owner, name),
    ),
  )
  const results = rows.flatMap((r) => r.results)
  c.header('Cache-Control', 'public, max-age=300')
  return ok(c, results)
})

// ---------------------------------------------------------------------------
// Link previews: a PNG per repository, and the city page with its meta tags.

app.get('/og/:owner/:file', async (c) => {
  const { owner, file } = c.req.param()
  if (!file.endsWith('.png')) return c.notFound()
  const name = file.slice(0, -4)
  const row = await c.env.DB.prepare('SELECT summary FROM analyses WHERE owner = ? COLLATE NOCASE AND name = ? COLLATE NOCASE ORDER BY analyzed_at DESC LIMIT 1')
    .bind(owner, name)
    .first<{ summary: string }>()
  const summary = row ? (JSON.parse(row.summary) as Summary) : emptySummary(`${owner}/${name}`)
  const res = await ogImage(summary)
  res.headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400')
  return res
})

/** The SPA shell with the city's title, description and preview image filled in. */
async function cityPage(c: Context<{ Bindings: Env }>, owner: string, name: string) {
  const shell = await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url)))
  const html = await shell.text()
  const row = await c.env.DB.prepare('SELECT files, lines, commits, burning FROM analyses WHERE owner = ? COLLATE NOCASE AND name = ? COLLATE NOCASE ORDER BY analyzed_at DESC LIMIT 1')
    .bind(owner, name)
    .first<{ files: number; lines: number; commits: number; burning: number }>()
  const title = `${owner}/${name} as a city`
  const desc = row
    ? `${row.files.toLocaleString()} files, ${row.lines.toLocaleString()} lines, ${row.commits.toLocaleString()} commits${row.burning ? `, ${row.burning} buildings on fire` : ''}. Built from its git history by CodeSkyline.`
    : 'Every repository is a city. Built from its git history by CodeSkyline.'
  const origin = c.env.PUBLIC_ORIGIN
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:image" content="${origin}/og/${owner}/${name}.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:url" content="${origin}/${owner}/${name}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${origin}/og/${owner}/${name}.png">`,
  ].join('\n    ')
  // The shell carries the front page's preview; a city brings its own.
  const out = html
    .replace(/<title>[^<]*<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace(/\s*<meta (?:property="og:|name="twitter:)[^>]*>/g, '')
    .replace('</head>', `    ${tags}\n  </head>`)
  return new Response(out, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Sharing.

app.post('/api/share', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { target?: string }
  const target = body.target ?? ''
  if (!/^\/[\w.-]+\/[\w.-]+(\?[\w%=&.:+-]*)?$/.test(target) || target.length > 2000) return c.json({ error: 'bad target' }, 400)
  const id = shortId()
  await c.env.DB.prepare('INSERT INTO shares (id, target, created_at) VALUES (?, ?, ?)').bind(id, target, Date.now()).run()
  return ok(c, { id, url: `${c.env.PUBLIC_ORIGIN}/s/${id}` })
})

app.get('/s/:id', async (c) => {
  const id = c.req.param('id')
  const row = await c.env.DB.prepare('SELECT target FROM shares WHERE id = ?').bind(id).first<{ target: string }>()
  if (!row) return c.notFound()
  c.executionCtx.waitUntil(c.env.DB.prepare('UPDATE shares SET hits = hits + 1 WHERE id = ?').bind(id).run())
  return c.redirect(row.target, 302)
})

app.get('/badge/:owner/:file', async (c) => {
  const { owner, file } = c.req.param()
  if (!file.endsWith('.svg')) return c.notFound()
  const name = file.slice(0, -4)
  const row = await c.env.DB.prepare('SELECT summary, analyzed_at FROM analyses WHERE owner = ? COLLATE NOCASE AND name = ? COLLATE NOCASE ORDER BY analyzed_at DESC LIMIT 1')
    .bind(owner, name)
    .first<{ summary: string; analyzed_at: number }>()
  const theme = c.req.query('theme') === 'light' ? 'light' : 'dark'
  const svg = row
    ? skylineBadge(JSON.parse(row.summary) as Summary, { theme, bare: c.req.query('bare') === '1', builtAt: row.analyzed_at, label: (c.req.query('label') ?? 'codeskyline').slice(0, 40) })
    : skylineBadge(emptySummary(`${owner}/${name}`), { theme, bare: c.req.query('bare') === '1', label: 'codeskyline · not built yet' })
  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  })
})

app.get('/api/health', (c) => ok(c, { ok: true }))

// github.com/owner/repo -> /owner/repo: the city, with its preview filled
// in. Old /r/ links, .git and deep GitHub paths redirect to it.
app.get('*', async (c) => {
  const url = new URL(c.req.url)
  const repo = repoFromPath(url.pathname)
  if (!repo) return c.env.ASSETS.fetch(c.req.raw)
  if (url.pathname !== repo.path) return c.redirect(repo.path + url.search, 301)
  return cityPage(c, repo.owner, repo.name)
})

// Everything else is the SPA.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

// ---------------------------------------------------------------------------
// Queue consumer: drive the container, stream progress, store the result.

async function runJob(env: Env, msg: JobMessage): Promise<void> {
  const job = env.JOB.get(env.JOB.idFromName(msg.key))
  const shard = hash(msg.key) % ANALYZER_SHARDS
  const container = env.ANALYZER.get(env.ANALYZER.idFromName(`analyzer-${shard}`))
  const jobId = msg.key.replace(/[^A-Za-z0-9._-]/g, '_')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (env.CSKY_SECRET) headers['X-CSky-Secret'] = env.CSKY_SECRET

  await job.update('start', 'waking the analyzer')
  const res = await container.fetch(
    new Request('http://analyzer/analyze', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: jobId, url: msg.url, name: `${msg.owner}/${msg.name}`, maxCommits: Number(env.MAX_COMMITS) }),
    }),
  )
  if (!res.ok || !res.body) throw new Error(`analyzer responded ${res.status}: ${await res.text().catch(() => '')}`)

  let summary: Summary | undefined
  let bytes = 0
  for await (const line of lines(res.body)) {
    const ev = JSON.parse(line) as { stage?: string; detail?: string; error?: string; done?: boolean; bytes?: number; summary?: Summary }
    if (ev.error) throw new Error(ev.error)
    if (ev.done) {
      summary = ev.summary
      bytes = ev.bytes ?? 0
      break
    }
    if (ev.stage) await job.update(ev.stage, ev.detail ?? '')
  }
  if (!summary) throw new Error('analyzer ended without a result')

  await job.update('store', 'saving the city')
  const result = await container.fetch(new Request(`http://analyzer/result/${jobId}`, { headers }))
  if (!result.ok || !result.body) throw new Error(`could not fetch result: ${result.status}`)
  // R2 needs a known length and the proxied stream has none; cities are a
  // few MB gzipped, so buffering is fine.
  const gz = await result.arrayBuffer()
  const key = r2Key(msg.owner, msg.name, msg.sha)
  await env.CITIES.put(key, gz, {
    httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip', cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { repo: `${msg.owner}/${msg.name}`, sha: msg.sha },
  })
  await container.fetch(new Request(`http://analyzer/result/${jobId}`, { method: 'DELETE', headers })).catch(() => {})

  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO repos (owner, name, default_branch, latest_sha, stars, first_seen, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner, name) DO UPDATE SET default_branch = excluded.default_branch, latest_sha = excluded.latest_sha, stars = excluded.stars, updated_at = excluded.updated_at`,
    ).bind(msg.owner, msg.name, msg.defaultBranch, msg.sha, msg.stars, now, now),
    env.DB.prepare(
      `INSERT OR REPLACE INTO analyses (key, owner, name, sha, r2_key, bytes, analyzed_at, files, lines, commits, authors, burning, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(msg.key, msg.owner, msg.name, msg.sha, key, bytes, now, summary.files, summary.lines, summary.commits, summary.authors, summary.burning, JSON.stringify(summary)),
  ])
  await job.finish()
}

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
    for (const m of batch.messages) {
      try {
        await runJob(env, m.body)
        m.ack()
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e)
        console.error('job failed', m.body.key, err)
        const job = env.JOB.get(env.JOB.idFromName(m.body.key))
        if (m.attempts >= 2) {
          await job.fail(err)
          m.ack()
        } else {
          await job.update('retry', `attempt ${m.attempts} failed: ${err}`)
          m.retry({ delaySeconds: 30 })
        }
      }
    }
  },
} satisfies ExportedHandler<Env, JobMessage>

// ---------------------------------------------------------------------------

/**
 * Bumped whenever the analyzer adds data the viewer wants (couplings, story,
 * ...). It is part of the cache key, so an already-built commit is rebuilt
 * once with the new analyzer instead of serving the stale document forever.
 */
const FORMAT = 'v2'

function r2Key(owner: string, name: string, sha: string) {
  return `cities/${FORMAT}/${owner}/${name}/${sha}.json.gz`
}

async function consumeBudget(env: Env): Promise<boolean> {
  const month = new Date().toISOString().slice(0, 7)
  const max = Number(env.MAX_JOBS_PER_MONTH)
  const row = await env.DB.prepare(
    `INSERT INTO usage (month, jobs) VALUES (?, 1)
     ON CONFLICT(month) DO UPDATE SET jobs = jobs + 1
     RETURNING jobs`,
  )
    .bind(month)
    .first<{ jobs: number }>()
  return (row?.jobs ?? 0) <= max
}

async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line) yield line
    }
  }
  if (buf.trim()) yield buf.trim()
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function shortId(n = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n))
  let s = ''
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length]
  return s
}

function emptySummary(name: string): Summary {
  return { name, head: '', files: 0, lines: 0, commits: 0, authors: 0, burning: 0, removed: 0, firstCommit: 0, lastCommit: 0, languages: {}, skyline: [] }
}
