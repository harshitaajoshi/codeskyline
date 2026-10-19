import { Container } from '@cloudflare/containers'

/**
 * The Go analyzer (analyzer/Dockerfile) as a scale-to-zero container. Each
 * Durable Object id maps to one container instance; the queue consumer
 * shards jobs across a couple of them. It sleeps when idle, which is what
 * keeps the bill near zero.
 */
export class AnalyzerContainer extends Container {
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

export const ANALYZER_SHARDS = 2
