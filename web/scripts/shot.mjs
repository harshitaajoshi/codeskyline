#!/usr/bin/env node
// Headless screenshot + console capture via the Chrome DevTools Protocol.
// usage: node scripts/shot.mjs <url> <out.png> [waitMs=6000] [width=1440] [height=900]
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const [url, out, waitMs = '6000', width = '1440', height = '900'] = process.argv.slice(2)
if (!url || !out) {
  console.error('usage: shot.mjs <url> <out.png> [waitMs] [width] [height]')
  process.exit(2)
}
const chrome =
  process.env.CHROME ??
  (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome')
const port = 9222 + Math.floor(Math.random() * 1000)
const proc = spawn(
  chrome,
  [
    '--headless=new', '--no-sandbox', '--no-first-run', '--disable-extensions',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--hide-scrollbars', `--window-size=${width},${height}`, `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/csky-chrome-${port}`, 'about:blank',
  ],
  { stdio: 'ignore' },
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  let targets
  for (let i = 0; i < 100; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      if (targets?.length) break
    } catch {}
    await sleep(100)
  }
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  const logs = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result)
      pending.delete(m.id)
    } else if (m.method === 'Runtime.consoleAPICalled') {
      logs.push(`[console.${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ')}`)
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      logs.push(`[exception] ${d.exception?.description ?? d.text}`)
    } else if (m.method === 'Log.entryAdded') {
      logs.push(`[${m.params.entry.source}/${m.params.entry.level}] ${m.params.entry.text} ${m.params.entry.url ?? ''}`)
    }
  }
  const send = (method, params = {}) =>
    new Promise((r) => {
      pending.set(++id, r)
      ws.send(JSON.stringify({ id, method, params }))
    })
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: +width, height: +height, deviceScaleFactor: +(process.env.SHOT_DPR ?? 1), mobile: false })
  await send('Page.navigate', { url })
  await sleep(+waitMs)
  // SHOT_JS="..." runs in the page before capture (scroll, click), then settles.
  if (process.env.SHOT_JS) {
    await send('Runtime.evaluate', { expression: process.env.SHOT_JS, awaitPromise: true })
    await sleep(+(process.env.SHOT_SETTLE ?? 2500))
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(`saved ${out}`)
  console.log(logs.length ? logs.join('\n') : '(no console output)')
  ws.close()
} finally {
  proc.kill('SIGKILL')
}
