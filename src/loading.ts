import * as THREE from 'three'

/**
 * The startup screen: a small system that orbits until every model has both
 * downloaded and parsed, then hands over to the enter button.
 *
 * The spinner is indeterminate, so nothing here measures how far along the
 * load is. Loader progress is still worth listening to as a sign of life —
 * a download that dies quietly shouldn't strand you on the screen forever.
 */

// A stray gap between two waves of loading shouldn't dismiss the screen early.
const SETTLE_MS = 200
// Measured from the last sign of progress, not from startup: 80 MB over a slow
// connection is a long wait, but it is never a silent one.
const STALL_MS = 20000

const overlay = document.getElementById('loading')
const enterButton = document.getElementById('loading-enter') as HTMLButtonElement | null

const entryCallbacks: (() => void)[] = []
let finished = false
let entered = false
let settleTimer = 0
let stallTimer = 0

function armStallTimer(): void {
  if (finished) return
  window.clearTimeout(stallTimer)
  stallTimer = window.setTimeout(complete, STALL_MS)
}

/**
 * Returns the `onProgress` handler to give a three.js loader. The bytes aren't
 * displayed anywhere — they're what says the download is still moving.
 */
export function trackDownload(): (event: ProgressEvent) => void {
  return () => armStallTimer()
}

function complete(): void {
  if (finished) return
  finished = true
  window.clearTimeout(settleTimer)
  window.clearTimeout(stallTimer)

  // Fades out the "loading..." line; the orbits keep turning.
  overlay?.classList.add('ready')
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

  // Every GLTFLoader in the project uses the default manager, and every load is
  // kicked off during module evaluation, so this fires once, when the last
  // model has finished parsing rather than merely finished downloading.
  THREE.DefaultLoadingManager.onStart = () => window.clearTimeout(settleTimer)
  THREE.DefaultLoadingManager.onLoad = () => {
    settleTimer = window.setTimeout(complete, SETTLE_MS)
  }
  // Each item that lands is progress too. Parsing a big model can run longer
  // than the stall timeout without a single byte arriving.
  THREE.DefaultLoadingManager.onProgress = () => armStallTimer()
  armStallTimer()

  enterButton?.addEventListener('click', enter)
}
