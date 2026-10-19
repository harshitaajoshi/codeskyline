import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { skylineBadge } from './badge'
import { ANALYZER_SHARDS } from './container'
import { GitHubError, parseRepoInput, resolveRepo } from './github'
import { publicState } from './job'
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

  const key = `${info.owner}/${info.name}@${info.sha}`
  // Already built for this exact commit? Done.
  const have = await c.env.DB.prepare('SELECT key FROM analyses WHERE key = ?').bind(key).first()
  if (have) return ok(c, { status: 'ready', key, owner: info.owner, name: info.name, sha: info.sha })

  // Single-flight through the job DO; it only enqueues the first time.
  const stub = c.env.JOB.get(c.env.JOB.idFromName(key))
  const existing = await stub.get()
  if (!existing || existing.status === 'error') {
    const allowed = await consumeBudget(c.env)
    if (!allowed) return c.json({ error: 'This month’s analysis budget is used up. Cached cities still work; new ones resume next month.' }, 503)
  }
  const msg: JobMessage = { key, owner: info.owner, name: info.name, sha: info.sha, url: `https://github.com/${info.owner}/${info.name}`, stars: info.stars, defaultBranch: info.defaultBranch }
  const state = await stub.start(msg)
  return ok(c, { ...publicState(state), owner: info.owner, name: info.name, sha: info.sha })
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
  const row = await c.env.DB.prepare('SELECT sha FROM analyses WHERE owner = ? AND name = ? ORDER BY analyzed_at DESC LIMIT 1')
    .bind(owner, name)
    .first<{ sha: string }>()
  if (!row) return c.json({ error: 'not analyzed yet' }, 404)
  return c.redirect(`/api/city/${owner}/${name}/${row.sha}`, 302)
})

app.get('/api/city/:owner/:name/:sha', async (c) => {
  const { owner, name, sha } = c.req.param()
  const obj = await c.env.CITIES.get(r2Key(owner, name, sha))
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

app.get('/api/repo/:owner/:name', async (c) => {
  const { owner, name } = c.req.param()
  const row = await c.env.DB.prepare(
    'SELECT key, sha, analyzed_at, files, lines, commits, authors, burning, summary FROM analyses WHERE owner = ? AND name = ? ORDER BY analyzed_at DESC LIMIT 1',
  )
    .bind(owner, name)
    .first()
  if (!row) return c.json({ error: 'not analyzed yet' }, 404)
  return ok(c, { ...row, summary: JSON.parse(row.summary as string) })
})

app.get('/api/gallery', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT a.owner, a.name, a.sha, a.analyzed_at, a.files, a.lines, a.commits, a.authors, a.burning, r.stars
       FROM analyses a JOIN repos r ON r.owner = a.owner AND r.name = a.name
      WHERE a.key = (SELECT key FROM analyses b WHERE b.owner = a.owner AND b.name = a.name ORDER BY analyzed_at DESC LIMIT 1)
      ORDER BY r.stars DESC, a.analyzed_at DESC LIMIT 40`,
  ).all()
  c.header('Cache-Control', 'public, max-age=120')
  return ok(c, results)
})

// ---------------------------------------------------------------------------
// Sharing.

app.post('/api/share', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { target?: string }
  const target = body.target ?? ''
  if (!/^\/r\/[\w.-]+\/[\w.-]+(\?[\w%=&.:+-]*)?$/.test(target) || target.length > 2000) return c.json({ error: 'bad target' }, 400)
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
  const row = await c.env.DB.prepare('SELECT summary FROM analyses WHERE owner = ? AND name = ? ORDER BY analyzed_at DESC LIMIT 1')
    .bind(owner, name)
    .first<{ summary: string }>()
  const theme = c.req.query('theme') === 'light' ? 'light' : 'dark'
  const svg = row
    ? skylineBadge(JSON.parse(row.summary) as Summary, { theme, label: c.req.query('label') ?? 'codeskyline' })
    : skylineBadge(emptySummary(`${owner}/${name}`), { theme, label: 'codeskyline · not built yet' })
  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  })
})

app.get('/api/health', (c) => ok(c, { ok: true }))

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

function r2Key(owner: string, name: string, sha: string) {
  return `cities/${owner}/${name}/${sha}.json.gz`
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
