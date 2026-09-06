export class Input {
  /** -1 left .. +1 right */
  x = 0
  /** -1 back .. +1 forward */
  z = 0
  jumpHeld = false
  /** True for the single frame jump was pressed. */
  jumpPressed = false
  resetPressed = false

  /** Accumulated mouse delta since the last frame, in radians of look. */
  lookX = 0
  lookY = 0

  private readonly keys = new Set<string>()

  constructor(canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return
      const k = e.code
      this.keys.add(k)
      if (k === 'Space') {
        this.jumpPressed = true
        e.preventDefault()
      }
      if (k === 'KeyR') this.resetPressed = true
    })

    addEventListener('keyup', (e) => this.keys.delete(e.code))
    addEventListener('blur', () => this.keys.clear())

    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) void canvas.requestPointerLock()
    })

    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return
      this.lookX += e.movementX
      this.lookY += e.movementY
    })
  }

  /** Refresh derived state. Call once at the top of each frame. */
  sample(): void {
    const held = (...codes: string[]) => codes.some((c) => this.keys.has(c))
    this.x = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0)
    this.z = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0)
    this.jumpHeld = this.keys.has('Space')
  }

  /** Clear one-frame flags. Call once at the bottom of each frame. */
  endFrame(): void {
    this.jumpPressed = false
    this.resetPressed = false
    this.lookX = 0
    this.lookY = 0
  }
}
