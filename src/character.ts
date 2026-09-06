import * as THREE from 'three'
import {
  ARM_SWING,
  BOB_AMP,
  BOB_FREQ,
  GAIT_DAMP,
  LEAN_MAX,
  STEP_SWING,
  SQUASH_DECAY,
  SQUASH_MAX,
  SQUASH_IMPACT_REF,
  STRETCH_MAX,
  JUMP_IMPULSE,
} from './tuning'

const TAU = Math.PI * 2

/** Exponential approach, framerate-independent. */
function damp(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt)
}

export interface FigureColours {
  cloth: number
  limb: number
  hair: number
  scarf: number
  eyes: number
}

export const PLAYER_COLOURS: FigureColours = {
  cloth: 0xfff3e0,
  limb: 0xf3d9b6,
  hair: 0x5a3b2e,
  scarf: 0xff8f7a,
  eyes: 0x27263a,
}

/** Height of the hip joints above the feet. Needed to seat the figure. */
export const FIGURE_HIP_Y = 0.27

/**
 * The parts of an assembled figure that anything might want to pose.
 *
 * Legs are jointed at hip *and* knee. A single-segment leg can walk, but it
 * cannot sit down — rotating it forward just sticks it straight out.
 */
export interface Figure {
  /** Origin at the feet, facing -Z. */
  rig: THREE.Group
  head: THREE.Object3D
  legL: THREE.Group
  legR: THREE.Group
  kneeL: THREE.Group
  kneeR: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
}

/**
 * A chunky little figure made of primitives. No rig, no imported model, no
 * animation clips.
 *
 * Shared by the player and by whoever else is walking — or sitting — around,
 * so there is exactly one body in the game and it only has to be got right
 * once.
 */
export function buildFigure(
  overrides: Partial<FigureColours> = {},
  options: { hair?: boolean } = {},
): Figure {
  const c = { ...PLAYER_COLOURS, ...overrides }
  const rig = new THREE.Group()

  const cloth = new THREE.MeshStandardMaterial({ color: c.cloth, roughness: 0.85 })
  const limb = new THREE.MeshStandardMaterial({ color: c.limb, roughness: 0.85 })
  const hair = new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.9 })
  const dark = new THREE.MeshStandardMaterial({ color: c.eyes, roughness: 0.5 })
  const scarf = new THREE.MeshStandardMaterial({ color: c.scarf, roughness: 0.9 })

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.16, 6, 20), cloth)
  body.position.y = 0.5

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 28, 20), cloth)
  head.position.y = 1.02

  // Sit the eyes just proud of the head sphere (r 0.28) so they actually
  // show rather than being swallowed by it.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), dark)
    eye.position.set(side * 0.101, 0.037, -0.241)
    head.add(eye)
  }

  // --- hair -------------------------------------------------------------
  if (options.hair !== false) {
    // A cap over the crown, tipped back so it clears the eyes: the eyes sit
    // about 81 degrees off vertical, and a hemisphere tilted 18 degrees back
    // stops short of them.
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.295, 26, 18, 0, TAU, 0, Math.PI * 0.5),
      hair,
    )
    cap.position.y = 1.02
    cap.rotation.x = 0.32
    rig.add(cap)

    // Strands beside the head. Kept short and set back behind the face plane:
    // hanging them past the jaw and forward of the cheeks framed the face from
    // below, which read as a beard rather than as hair.
    for (const side of [-1, 1]) {
      const strand = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.1, 5, 12), hair)
      strand.position.set(side * 0.245, 0.965, 0.035)
      strand.scale.z = 0.7
      rig.add(strand)
    }
  }

  // Major radius matches the body's width at this height, so the scarf rests
  // on the shoulders instead of hovering around the neck.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.055, 8, 22), scarf)
  collar.position.y = 0.72
  collar.rotation.x = Math.PI / 2

  // --- limbs ------------------------------------------------------------
  const thighGeo = new THREE.CapsuleGeometry(0.075, 0.03, 5, 12)
  const shinGeo = new THREE.CapsuleGeometry(0.07, 0.03, 5, 12)
  const armGeo = new THREE.CapsuleGeometry(0.07, 0.1, 5, 12)

  const legL = new THREE.Group()
  const legR = new THREE.Group()
  const kneeL = new THREE.Group()
  const kneeR = new THREE.Group()
  const armL = new THREE.Group()
  const armR = new THREE.Group()

  for (const [hip, knee, side] of [
    [legL, kneeL, -1],
    [legR, kneeR, 1],
  ] as const) {
    const thigh = new THREE.Mesh(thighGeo, limb)
    thigh.position.y = -0.07
    hip.add(thigh)

    const shin = new THREE.Mesh(shinGeo, limb)
    shin.position.y = -0.07
    knee.add(shin)
    knee.position.y = -0.12
    hip.add(knee)

    hip.position.set(side * 0.115, FIGURE_HIP_Y, 0)
    rig.add(hip)
  }

  for (const [group, side] of [
    [armL, -1],
    [armR, 1],
  ] as const) {
    const mesh = new THREE.Mesh(armGeo, limb)
    mesh.position.y = -0.12
    group.add(mesh)
    group.position.set(side * 0.265, 0.63, 0)
    rig.add(group)
  }

  rig.add(body, head, collar)
  rig.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })

  return { rig, head, legL, legR, kneeL, kneeR, armL, armR }
}

/**
 * The player's body: the shared figure, animated straight off physics state,
 * so the motion always agrees with what the player just did.
 *
 * Origin is at the feet. Forward is -Z (three.js convention).
 */
export class Character {
  /** Positioned and oriented by the physics. */
  readonly root = new THREE.Group()
  /** Everything animated hangs off here, so squash never fights orientation. */
  private readonly rig: THREE.Group

  private readonly legL: THREE.Group
  private readonly legR: THREE.Group
  private readonly kneeL: THREE.Group
  private readonly kneeR: THREE.Group
  private readonly armL: THREE.Group
  private readonly armR: THREE.Group

  private walkPhase = 0
  private gait = 0
  private squash = 0
  private lean = 0
  private tuck = 0

  constructor() {
    const figure = buildFigure()
    this.rig = figure.rig
    this.legL = figure.legL
    this.legR = figure.legR
    this.kneeL = figure.kneeL
    this.kneeR = figure.kneeR
    this.armL = figure.armL
    this.armR = figure.armR
    this.root.add(this.rig)
  }

  /** Call once on landing, with the inbound speed along the surface normal. */
  impact(speed: number): void {
    const strength = Math.min(1, speed / SQUASH_IMPACT_REF)
    this.squash = Math.max(this.squash, SQUASH_MAX * strength)
  }

  update(
    dt: number,
    speed: number,
    verticalSpeed: number,
    grounded: boolean,
    swimming = false,
  ): void {
    // Swimming drives the limb cycle too, from a slower stroke, so a paddling
    // figure reads as deliberate rather than as a jump pose stuck mid-air.
    const cycling = grounded || swimming
    // Damped rather than taken straight from speed, so the limbs wind up and
    // settle instead of snapping to full swing the instant you touch a key.
    const target = cycling ? Math.min(1, speed / (swimming ? 1.8 : 5)) : 0
    this.gait = damp(this.gait, target, GAIT_DAMP, dt)
    const gait = this.gait

    if (cycling) {
      // A swim stroke is slower per unit travelled than a footstep.
      const cadence = swimming ? BOB_FREQ * 1.6 : BOB_FREQ
      this.walkPhase = (this.walkPhase + speed * cadence * TAU * dt) % TAU
    }

    this.squash = damp(this.squash, 0, SQUASH_DECAY, dt)
    this.lean = damp(this.lean, grounded ? -LEAN_MAX * gait : 0, 8, dt)
    // Half-tucked while swimming: limbs out and paddling, not curled up.
    this.tuck = damp(this.tuck, grounded ? 0 : swimming ? 0.35 : 1, 9, dt)

    // Rising stretches you tall, landing squashes you wide. Both read as
    // weight, and both come straight out of the velocity you're tuning. Water
    // has no such moment, so it is suppressed while swimming.
    const stretch =
      grounded || swimming
        ? 0
        : Math.max(0, Math.min(1, verticalSpeed / JUMP_IMPULSE)) * STRETCH_MAX
    const sy = 1 + stretch - this.squash
    const sxz = 1 - stretch * 0.5 + this.squash * 0.6
    this.rig.scale.set(sxz, sy, sxz)

    // The body rises once per step, i.e. twice per leg cycle. Written as a
    // cosine at double frequency rather than |sin| — |sin| has a cusp at every
    // zero crossing, and that kink is a visible hitch at the bottom of each step.
    const bob = (1 - Math.cos(this.walkPhase * 2)) * 0.5
    this.rig.position.y = bob * BOB_AMP * gait
    this.rig.rotation.x = this.lean

    const swing = Math.sin(this.walkPhase) * gait * (1 - this.tuck)
    this.legL.rotation.x = swing * STEP_SWING + this.tuck * 0.85
    this.legR.rotation.x = -swing * STEP_SWING + this.tuck * 0.6
    // The trailing leg bends at the knee; the leading one stays straight.
    this.kneeL.rotation.x = -Math.max(0, swing) * 0.6 - this.tuck * 0.7
    this.kneeR.rotation.x = -Math.max(0, -swing) * 0.6 - this.tuck * 0.5
    this.armL.rotation.x = -swing * ARM_SWING - this.tuck * 1.5
    this.armR.rotation.x = swing * ARM_SWING - this.tuck * 1.5
  }
}
