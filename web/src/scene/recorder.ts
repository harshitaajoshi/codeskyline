import type { City } from '../city/types'
import { drawCredit, loadCreditFonts } from './credit'

/**
 * Records the city to an H.264 MP4, the one format every player opens: Mac
 * Preview and QuickTime, Windows, iOS and Android. Frames are copied from the
 * WebGL canvas after each render (see RecordTap in Scene), stamped with the
 * credit, and encoded with WebCodecs through mediabunny. Browsers without an
 * H.264 encoder fall back to MediaRecorder, MP4 when it can and WebM when not.
 */
export interface Recording {
  ext: 'mp4' | 'webm'
  /** Seconds recorded so far. */
  elapsed(): number
  /** Finish and return the file. */
  stop(): Promise<Blob>
  /** Throw the recording away. */
  cancel(): void
}

const FPS = 30
const MAX_W = 1920

/** Set while recording; RecordTap feeds it every rendered frame. */
export let activeTap: ((src: HTMLCanvasElement) => void) | null = null

export async function startRecording(city: City): Promise<Recording> {
  const canvas = document.querySelector('canvas')
  if (!canvas) throw new Error('nothing to record')
  await loadCreditFonts()
  // Even dimensions (H.264 needs them), at most 1080p-ish width.
  const scale = Math.min(1, MAX_W / canvas.width)
  const w = Math.floor((canvas.width * scale) / 2) * 2
  const h = Math.floor((canvas.height * scale) / 2) * 2
  const frame = document.createElement('canvas')
  frame.width = w
  frame.height = h
  const ctx = frame.getContext('2d')!
  const paint = (src: HTMLCanvasElement) => {
    ctx.drawImage(src, 0, 0, w, h)
    drawCredit(ctx, w, h, city)
  }

  const mb = await import('mediabunny')
  const codec = typeof VideoEncoder !== 'undefined' ? await mb.getFirstEncodableVideoCodec(['avc'], { width: w, height: h }) : null
  if (codec) return encodeMp4(mb, frame, paint)
  return mediaRecorder(frame, paint)
}

async function encodeMp4(mb: typeof import('mediabunny'), frame: HTMLCanvasElement, paint: (src: HTMLCanvasElement) => void): Promise<Recording> {
  const target = new mb.BufferTarget()
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  // 4 Mbps: sharp at 1080p and small enough to send (a 38 second film is
  // about 19 MB). The "high" preset made films of 40 MB and more.
  const source = new mb.CanvasSource(frame, { codec: 'avc', quality: new mb.Quality({ bitrate: 4_000_000, bitrateMode: 'variable' }), keyFrameInterval: 2 })
  output.addVideoTrack(source, { frameRate: FPS })
  await output.start()
  const t0 = performance.now()
  let last = -Infinity
  let busy: Promise<void> | null = null
  let failed: unknown = null
  activeTap = (src) => {
    const now = performance.now()
    // About thirty frames a second, and never queue behind a slow encoder:
    // a dropped frame is better than a recording that falls behind.
    if (busy || now - last < 1000 / FPS - 4) return
    last = now
    paint(src)
    busy = source
      .add((now - t0) / 1000, 1 / FPS)
      .catch((e) => void (failed = e))
      .finally(() => (busy = null))
  }
  return {
    ext: 'mp4',
    elapsed: () => (performance.now() - t0) / 1000,
    async stop() {
      activeTap = null
      await busy
      if (failed) throw failed
      source.close()
      await output.finalize()
      return new Blob([target.buffer!], { type: 'video/mp4' })
    },
    cancel() {
      activeTap = null
      void output.cancel()
    },
  }
}

function mediaRecorder(frame: HTMLCanvasElement, paint: (src: HTMLCanvasElement) => void): Recording {
  if (typeof MediaRecorder === 'undefined') throw new Error('this browser cannot record video')
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))
  if (!mime) throw new Error('this browser cannot record video')
  const rec = new MediaRecorder(frame.captureStream(FPS), { mimeType: mime, videoBitsPerSecond: 10_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
  const t0 = performance.now()
  activeTap = paint
  rec.start(250)
  return {
    ext: mime.includes('mp4') ? 'mp4' : 'webm',
    elapsed: () => (performance.now() - t0) / 1000,
    stop: () =>
      new Promise<Blob>((resolve) => {
        activeTap = null
        rec.onstop = () => resolve(new Blob(chunks, { type: mime.split(';')[0] }))
        rec.stop()
      }),
    cancel() {
      activeTap = null
      rec.stop()
    },
  }
}
