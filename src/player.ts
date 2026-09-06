import * as THREE from 'three'
import { Character } from './character'
import { Input } from './input'
import {
  gravityAt,
  groundRadius,
  HOME,
  nearestPlanet,
  Planet,
  upFrom,
  waterRadius,
} from './planets'
import {
  AIR_CONTROL,
  AIR_MAX_TANGENT,
  BUOYANCY,
  COYOTE_TIME,
  GROUND_ACCEL,
  GROUND_STICK,
  STEP_SMOOTH_MAX,
  STEP_SMOOTH_RATE,
  GROUND_STICK_HEIGHT,
  JUMP_BUFFER,
  JUMP_CUT,
  JUMP_IMPULSE,
  SWIM_ACCEL,
  SWIM_DEPTH,
  SWIM_MAX_SPEED,
  SWIM_SUBMERGE,
  STEP_DOWN_LIMIT,
  SWIM_UP,
  TURN_RATE,
  WALK_SPEED,
  WATER_DRAG,
} from './tuning'

// Scratch vectors, reused every frame so the loop allocates nothing.
const _up = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _wish = new THREE.Vector3()
const _target = new THREE.Vector3()
const _accel = new THREE.Vector3()
const _tan = new THREE.Vector3()
const _toCore = new THREE.Vector3()
const _basisZ = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _qStep = new THREE.Quaternion()
const _m = new THREE.Matrix4()

/** Anything solid that isn't the ground. */
export interface Collider {
  resolve(pos: THREE.Vector3, vel: THREE.Vector3): void
  /**
   * Distance from the planet's core to a built floor at this position, or 0
   * where there isn't one.
   *
   * This has to feed the ground resolve rather than push the player out of a
   * floor-shaped box. Pushing would leave you standing above the terrain the
   * ground code still believes you should be on, and it would drop you every
   * frame and shove you back up — a flicker instead of a floor.
   */
  floorAt?(pos: THREE.Vector3, planetCentre: THREE.Vector3): number
}

export interface PlayerState {
  pos: [number, number, number]
  vel: [number, number, number]
  facing: [number, number, number]
}

/**
 * Position is the contact point at the character's feet, so "standing on the
 * surface" is exactly |pos - centre| === radius. No raycasts, no skin width,
 * no tunnelling — the surfaces are perfect spheres and the maths is exact.
 */
export class Player {
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  /** Unit vector, always tangent to the surface under the player. */
  readonly facing = new THREE.Vector3(0, 0, 1)
  readonly up = new THREE.Vector3(1, 0, 0)
  /**
   * Where the character is *drawn*. Trails `pos` when you step up onto
   * something, so a block edge plays as a climb rather than a teleport.
   */
  readonly visual = new THREE.Vector3()
  readonly character = new Character()

  /** Solid props, resolved after the ground. */
  collider: Collider | null = null

  grounded = true
  swimming = false
  planet: Planet = HOME

  private coyote = 0
  private buffer = 0
  private jumpRising = false
  private stepLag = 0
  private lastRadius = 0
  private wasGrounded = true

  constructor() {
    this.reset()
  }

  get object(): THREE.Object3D {
    return this.character.root
  }

  reset(): void {
    this.up.copy(HOME.center).normalize()
    this.pos.copy(HOME.center).addScaledVector(this.up, groundRadius(HOME, this.up))
    this.vel.set(0, 0, 0)
    this.facing.set(0, 0, 1).addScaledVector(this.up, -this.up.z).normalize()
    this.grounded = true
    this.planet = HOME
    this.jumpRising = false
    this.stepLag = 0
    this.lastRadius = this.pos.distanceTo(HOME.center)
    this.visual.copy(this.pos)
  }

  update(dt: number, input: Input, camForward: THREE.Vector3, camUp: THREE.Vector3): void {
    const planet = nearestPlanet(this.pos)
    upFrom(this.pos, planet, _up)

    // How far the feet are below the water surface. Hysteresis on the
    // threshold, otherwise you flicker between swimming and falling while
    // bobbing at the waterline.
    const depth = planet.water > 0 ? waterRadius(planet) - this.pos.distanceTo(planet.center) : -1
    this.swimming = depth > (this.swimming ? SWIM_DEPTH * 0.6 : SWIM_DEPTH)

    // --- desired direction, camera-relative, flattened onto the tangent plane
    _fwd.copy(camForward).addScaledVector(_up, -camForward.dot(_up))
    if (_fwd.lengthSq() < 1e-6) {
      // Camera is staring straight along the up axis; fall back to its own up.
      _fwd.copy(camUp).addScaledVector(_up, -camUp.dot(_up))
    }
    if (_fwd.lengthSq() < 1e-6) _fwd.copy(this.facing)
    _fwd.normalize()
    _right.crossVectors(_fwd, _up).normalize()

    _wish.set(0, 0, 0).addScaledVector(_right, input.x).addScaledVector(_fwd, input.z)
    const hasInput = _wish.lengthSq() > 1e-6
    if (hasInput) _wish.normalize()

    // --- jump intent, with a little forgiveness on both sides
    if (input.jumpPressed) this.buffer = JUMP_BUFFER
    this.buffer = Math.max(0, this.buffer - dt)
    this.coyote = this.grounded ? COYOTE_TIME : Math.max(0, this.coyote - dt)

    if (this.swimming) {
      this.grounded = false
      this.jumpRising = false

      // Buoyancy scales with how submerged you are, and exceeds gravity when
      // fully under, so you always rise back to a float. No drowning, no
      // pressing anything to stay alive.
      gravityAt(this.pos, _accel)
      const submersion = Math.min(1, depth / SWIM_SUBMERGE)
      this.vel.addScaledVector(_accel, (1 - BUOYANCY * submersion) * dt)

      if (hasInput) this.vel.addScaledVector(_wish, SWIM_ACCEL * dt)
      if (input.jumpHeld) this.vel.addScaledVector(_up, SWIM_UP * dt)

      // Drag is what makes it feel like water rather than low gravity.
      this.vel.multiplyScalar(Math.exp(-WATER_DRAG * dt))

      const radial = this.vel.dot(_up)
      _tan.copy(this.vel).addScaledVector(_up, -radial)
      const speed = _tan.length()
      if (speed > SWIM_MAX_SPEED) {
        _tan.multiplyScalar(SWIM_MAX_SPEED / speed)
        this.vel.copy(_tan).addScaledVector(_up, radial)
      }
    } else if (this.grounded) {
      this.vel.addScaledVector(_up, -this.vel.dot(_up))
      _target.copy(_wish).multiplyScalar(hasInput ? WALK_SPEED : 0)
      this.vel.lerp(_target, 1 - Math.exp(-GROUND_ACCEL * dt))
    } else {
      gravityAt(this.pos, _accel)
      this.vel.addScaledVector(_accel, dt)

      // Near-ground stick, so a step off a ledge falls instead of orbiting.
      // Only while descending, so the rise of a jump is never clipped.
      const radial = this.vel.dot(_up)
      if (radial <= 0) {
        const altitude = this.pos.distanceTo(planet.center) - groundRadius(planet, _up)
        if (altitude < GROUND_STICK_HEIGHT) {
          this.vel.addScaledVector(_up, -GROUND_STICK * dt)
        }
      }

      if (hasInput) {
        this.vel.addScaledVector(_wish, AIR_CONTROL * dt)
        const radial = this.vel.dot(_up)
        _tan.copy(this.vel).addScaledVector(_up, -radial)
        const speed = _tan.length()
        if (speed > AIR_MAX_TANGENT) {
          _tan.multiplyScalar(AIR_MAX_TANGENT / speed)
          this.vel.copy(_tan).addScaledVector(_up, radial)
        }
      }

      // Variable jump height: let go early and the rise is cut short.
      if (this.jumpRising) {
        const radial = this.vel.dot(_up)
        if (radial <= 0) {
          this.jumpRising = false
        } else if (!input.jumpHeld) {
          this.vel.addScaledVector(_up, -radial * (1 - JUMP_CUT))
          this.jumpRising = false
        }
      }
    }

    if (this.buffer > 0 && this.coyote > 0) {
      this.buffer = 0
      this.coyote = 0
      this.grounded = false
      this.jumpRising = true
      this.vel.addScaledVector(_up, JUMP_IMPULSE - this.vel.dot(_up))
    }

    this.pos.addScaledVector(this.vel, dt)

    // --- resolve against whichever planet now owns us
    const landing = nearestPlanet(this.pos)
    _toCore.subVectors(this.pos, landing.center)
    const dist = _toCore.length()
    const normal = _toCore.multiplyScalar(1 / Math.max(dist, 1e-6))
    // The surface is no longer a constant radius — it steps up onto the
    // plateaus — so the ground height has to be sampled in the direction we
    // actually ended up in. A built floor overrides the terrain beneath it.
    const built = this.collider?.floorAt?.(this.pos, landing.center) ?? 0
    const surface = Math.max(groundRadius(landing, normal), built)

    if (this.swimming) {
      // Floating, so no ground contact — but don't sink through the seabed.
      if (dist < surface) {
        this.pos.copy(landing.center).addScaledVector(normal, surface)
        const closing = -this.vel.dot(normal)
        if (closing > 0) this.vel.addScaledVector(normal, closing)
      }
      this.planet = landing
    } else if (this.grounded) {
      if (dist - surface > STEP_DOWN_LIMIT) {
        // The ground fell away sharply — a block edge. Drop off it rather than
        // being magnetised down the cliff face.
        this.grounded = false
        this.planet = landing
      } else {
        // Walking along a tangent lifts you off a curved surface every frame.
        // Gluing back down is what makes the sphere feel like ground, and it is
        // also what walks you up the terrain ramps and onto blocks.
        this.pos.copy(landing.center).addScaledVector(normal, surface)
        this.vel.addScaledVector(normal, -this.vel.dot(normal))
        this.planet = landing
      }
    } else if (dist <= surface) {
      const closing = -this.vel.dot(normal)
      this.character.impact(Math.max(0, closing))
      this.pos.copy(landing.center).addScaledVector(normal, surface)
      if (closing > 0) this.vel.addScaledVector(normal, closing)
      this.grounded = true
      this.jumpRising = false
      this.planet = landing
    }

    this.collider?.resolve(this.pos, this.vel)

    this.up.copy(this.pos).sub(this.planet.center).normalize()

    // A step up moves the body instantly — it has to, or you would clip into
    // the block. Instead the drawn position lags by the height gained and
    // catches up, which reads as climbing. Only while already on foot: a
    // landing has its own squash and shouldn't be smeared as well.
    const radius = this.pos.distanceTo(this.planet.center)
    if (this.grounded && this.wasGrounded) {
      const rise = radius - this.lastRadius
      if (rise > 0) this.stepLag = Math.min(STEP_SMOOTH_MAX, this.stepLag + rise)
    } else {
      this.stepLag = 0
    }
    this.stepLag *= Math.exp(-STEP_SMOOTH_RATE * dt)
    this.lastRadius = radius
    this.wasGrounded = this.grounded
    this.visual.copy(this.pos).addScaledVector(this.up, -this.stepLag)

    // --- face the direction of travel
    if (hasInput) {
      _q.setFromUnitVectors(this.facing, _wish)
      _qStep.identity().slerp(_q, 1 - Math.exp(-TURN_RATE * dt))
      this.facing.applyQuaternion(_qStep)
    }
    this.facing.addScaledVector(this.up, -this.facing.dot(this.up))
    if (this.facing.lengthSq() < 1e-6) this.facing.copy(_fwd)
    this.facing.normalize()

    // --- orient the mesh: local +Y is up, local -Z is facing
    _right.crossVectors(this.facing, this.up).normalize()
    _basisZ.copy(this.facing).negate()
    _m.makeBasis(_right, this.up, _basisZ)
    this.character.root.quaternion.setFromRotationMatrix(_m)
    this.character.root.position.copy(this.visual)

    const radialSpeed = this.vel.dot(this.up)
    _tan.copy(this.vel).addScaledVector(this.up, -radialSpeed)
    this.character.update(dt, _tan.length(), radialSpeed, this.grounded, this.swimming)
  }

  serialize(): PlayerState {
    return {
      pos: this.pos.toArray(),
      vel: this.vel.toArray(),
      facing: this.facing.toArray(),
    }
  }

  restore(state: PlayerState): void {
    this.pos.fromArray(state.pos)
    this.vel.fromArray(state.vel)
    this.facing.fromArray(state.facing).normalize()
    this.planet = nearestPlanet(this.pos)
    this.up.copy(this.pos).sub(this.planet.center).normalize()
    this.grounded =
      this.pos.distanceTo(this.planet.center) <= groundRadius(this.planet, this.up) + 0.01
    this.stepLag = 0
    this.lastRadius = this.pos.distanceTo(this.planet.center)
    this.wasGrounded = this.grounded
    this.visual.copy(this.pos)
  }
}
