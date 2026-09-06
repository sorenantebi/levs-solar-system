import * as THREE from 'three'

/**
 * The startup screen.
 *
 * The models are ~80 MB and their sizes span four orders of magnitude — 10 kB
 * for the cow, 29 MB for Rocky — so a bar counting finished files would rush
 * to 90% in a second and then sit on the two big ones for the rest of the
 * wait. It tracks downloaded bytes instead, which needs each loader to report
 * progress through `trackDownload`.
 */

// A stray gap between two waves of loading shouldn't dismiss the screen early.
const SETTLE_MS = 200
// ...and a download that dies shouldn't strand you on it. This is measured
// from the last byte that moved, not from startup: 80 MB over a slow
// connection is a long wait, but it is never a silent one.
const STALL_MS = 20000
// A file that has arrived still has to be parsed — the buffers unpacked, the
// textures decoded — and on 80 MB of models that is seconds, not milliseconds.
// Downloading a file earns it all but this share of its weight; the rest lands
// when it finishes parsing, so the bar can't fill while work is still going on.
const PARSE_SHARE = 0.2

const overlay = document.getElementById('loading')
const track = document.getElementById('loading-track')
const bar = document.getElementById('loading-fill')
const enterButton = document.getElementById('loading-enter') as HTMLButtonElement | null

const downloads = new Map<string, { loaded: number; total: number }>()
const parsed = new Set<string>()
const entryCallbacks: (() => void)[] = []
let shown = 0
let painting = false
let finished = false
let entered = false
let settleTimer = 0
let stallTimer = 0

function armStallTimer(): void {
  if (finished) return
  window.clearTimeout(stallTimer)
  stallTimer = window.setTimeout(complete, STALL_MS)
}

function paint(): void {
  painting = false
  if (finished) return

  // Response headers land a request or two apart, so early on some files have
  // no size yet. They're weighted at the average of the ones that do, which
  // keeps the bar from opening near 100% and walking backwards as sizes arrive.
  let known = 0
  let knownBytes = 0
  for (const entry of downloads.values()) {
    if (entry.total > 0) {
      known += 1
      knownBytes += entry.total
    }
  }
  if (known === 0) return
  const average = knownBytes / known

  let weight = 0
  let done = 0
  for (const [url, entry] of downloads) {
    const size = entry.total > 0 ? entry.total : average
    const downloaded = entry.total > 0 ? Math.min(1, entry.loaded / entry.total) : 0
    weight += size
    done += size * (parsed.has(url) ? 1 : (1 - PARSE_SHARE) * downloaded)
  }
  shown = Math.max(shown, Math.min(1, done / weight))

  const percent = Math.round(shown * 100)
  if (bar) bar.style.width = `${percent}%`
  track?.setAttribute('aria-valuenow', String(percent))
}

function schedulePaint(): void {
  if (painting || finished) return
  painting = true
  requestAnimationFrame(paint)
}

/**
 * Returns the `onProgress` handler to hand to a three.js loader. Call it once
 * per file, as the load starts — the count of calls is what the bar scales the
 * not-yet-sized files against.
 */
export function trackDownload(url: string): (event: ProgressEvent) => void {
  downloads.set(url, { loaded: 0, total: 0 })
  return (event) => {
    if (!event.lengthComputable) return
    downloads.set(url, { loaded: event.loaded, total: event.total })
    armStallTimer()
    schedulePaint()
  }
}

function complete(): void {
  if (finished) return
  finished = true
  window.clearTimeout(settleTimer)
  window.clearTimeout(stallTimer)

  shown = 1
  if (bar) bar.style.width = '100%'
  track?.setAttribute('aria-valuenow', '100')
  if (enterButton) {
    enterButton.disabled = false
    enterButton.classList.add('ready')
    enterButton.focus()
  }
}

function enter(): void {
  if (entered) return
  entered = true
  overlay?.classList.add('done')
  // Leaving it in the tree would keep an invisible sheet over the canvas. A
  // timer rather than transitionend, which never fires if the fade is skipped.
  window.setTimeout(() => overlay?.remove(), 900)
  // Synchronously, so anything that needs the click's user activation — the
  // music, above all — still has it.
  for (const callback of entryCallbacks) callback()
}

/** Runs once the player dismisses the loading screen. */
export function onEnter(callback: () => void): void {
  if (entered) callback()
  else entryCallbacks.push(callback)
}

export function initLoadingScreen(): void {
  if (!overlay) return

  // Every GLTFLoader in the project uses the default manager, and every load
  // is kicked off during module evaluation, so this fires once, when the last
  // model has finished parsing rather than merely finished downloading.
  THREE.DefaultLoadingManager.onStart = () => window.clearTimeout(settleTimer)

  // Fires as each item finishes, which for a model is after it has parsed, not
  // merely downloaded. Textures inside a .glb come through here too, on blob
  // URLs that match nothing we track — ignoring them is the point.
  THREE.DefaultLoadingManager.onProgress = (url) => {
    if (!downloads.has(url) || parsed.has(url)) return
    parsed.add(url)
    armStallTimer()
    schedulePaint()
  }

  THREE.DefaultLoadingManager.onLoad = () => {
    settleTimer = window.setTimeout(complete, SETTLE_MS)
  }
  armStallTimer()

  enterButton?.addEventListener('click', enter)
}
