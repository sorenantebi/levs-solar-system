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

const overlay = document.getElementById('loading')
const track = document.getElementById('loading-track')
const bar = document.getElementById('loading-fill')
const enterButton = document.getElementById('loading-enter') as HTMLButtonElement | null

const downloads = new Map<string, { loaded: number; total: number }>()
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

  let loaded = 0
  let total = 0
  let known = 0
  for (const entry of downloads.values()) {
    loaded += entry.loaded
    if (entry.total > 0) {
      total += entry.total
      known += 1
    }
  }
  if (known === 0) return

  // Response headers land a request or two apart, so early on most files have
  // no size yet. Scaling the known sizes up to cover the rest keeps the bar
  // from opening near 100% and then walking backwards as the sizes arrive.
  const estimated = total * (downloads.size / known)
  shown = Math.max(shown, Math.min(1, loaded / estimated))

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
  THREE.DefaultLoadingManager.onLoad = () => {
    settleTimer = window.setTimeout(complete, SETTLE_MS)
  }
  armStallTimer()

  enterButton?.addEventListener('click', enter)
}
