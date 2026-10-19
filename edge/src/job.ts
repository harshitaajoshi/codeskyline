import { DurableObject } from 'cloudflare:workers'
import type { Env, JobMessage, JobState } from './types'

/**
 * One Durable Object per owner/repo@sha. It is the single-flight lock (a
 * hundred people pasting the same repo produce one job), the progress log,
 * and the fan-out point for WebSocket subscribers. Sockets use the
 * hibernation API so an idle job costs nothing while the container works.
 */
export class JobDO extends DurableObject<Env> {
  private cached: JobState | null = null

  private async state(): Promise<JobState | null> {
    if (!this.cached) this.cached = (await this.ctx.storage.get<JobState>('state')) ?? null
    return this.cached
  }

  private async save(s: JobState) {
    s.updatedAt = Date.now()
    this.cached = s
    await this.ctx.storage.put('state', s)
    this.broadcast(s)
  }

  private broadcast(s: JobState) {
    const msg = JSON.stringify(publicState(s))
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg)
      } catch {
        /* closed */
      }
    }
  }

  /** Enqueue unless already started. Returns the current state either way. */
  async start(msg: JobMessage): Promise<JobState> {
    const existing = await this.state()
    if (existing && existing.status !== 'error') return existing
    const s: JobState = {
      key: msg.key,
      status: 'queued',
      stage: 'queued',
      detail: 'waiting for an analyzer',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      log: [],
    }
    await this.save(s)
    await this.env.QUEUE.send(msg)
    return s
  }

  async get(): Promise<JobState | null> {
    return this.state()
  }

  async update(stage: string, detail: string): Promise<void> {
    const s = await this.state()
    if (!s) return
    s.status = 'running'
    s.stage = stage
    s.detail = detail
    s.log.push({ stage, detail, t: Date.now() })
    if (s.log.length > 200) s.log.splice(0, s.log.length - 200)
    await this.save(s)
  }

  async finish(): Promise<void> {
    const s = await this.state()
    if (!s) return
    s.status = 'ready'
    s.stage = 'ready'
    s.detail = 'city built'
    await this.save(s)
    // Keep the record a day for late subscribers, then let the DO go away.
    await this.ctx.storage.setAlarm(Date.now() + 24 * 3600 * 1000)
  }

  async fail(error: string): Promise<void> {
    const s = await this.state()
    if (!s) return
    s.status = 'error'
    s.stage = 'error'
    s.detail = error
    s.error = error
    await this.save(s)
    await this.ctx.storage.setAlarm(Date.now() + 3600 * 1000)
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
    this.cached = null
  }

  /** WebSocket subscription: sends the current state, then every change. */
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 })
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server)
    const s = await this.state()
    if (s) server.send(JSON.stringify(publicState(s)))
    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(_ws: WebSocket, _msg: string | ArrayBuffer) {
    /* subscribers do not talk */
  }

  webSocketClose(ws: WebSocket) {
    try {
      ws.close()
    } catch {
      /* already closed */
    }
  }
}

export function publicState(s: JobState) {
  return { key: s.key, status: s.status, stage: s.stage, detail: s.detail, error: s.error, updatedAt: s.updatedAt, log: s.log.slice(-12) }
}
