import { Container } from '@cloudflare/containers'
import type { Env } from './types'

/**
 * The Go analyzer (analyzer/Dockerfile) as a scale-to-zero container. Each
 * Durable Object id maps to one container instance; the queue consumer
 * shards jobs across a couple of them. It sleeps when idle, which is what
 * keeps the bill near zero.
 */
export class AnalyzerContainer extends Container {
  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env)
    // The container application uses the "durable_object" scheduling
    // policy: every start names its image and instance size. The library
    // builds the rest of the start options, so add those two here.
    const c = ctx.container as unknown as ContainerWithImages
    ;(this as unknown as { container: unknown }).container = new Proxy(c, {
      get(target, prop) {
        if (prop === 'start') return (opts: object = {}) => target.start({ ...opts, image: target.images.analyzer, instance: 'standard-2' })
        const v = Reflect.get(target, prop, target) as unknown
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v
      },
    })
  }

  defaultPort = 8080
  sleepAfter = '3m'
  envVars = { CSKY_JOB_DIR: '/tmp/csky-jobs' }

  override onStart() {
    console.log('analyzer container started')
  }

  override onStop() {
    console.log('analyzer container stopped')
  }

  override onError(err: unknown) {
    console.error('analyzer container error', err)
  }
}

interface ContainerWithImages {
  images: Record<string, unknown>
  start(opts: object): void
}

export const ANALYZER_SHARDS = 4
