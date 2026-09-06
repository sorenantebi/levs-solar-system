import * as THREE from 'three'
import {
  CAM_DISTANCE,
  CAM_DISTANCE_DAMP,
  CAM_PITCH_MAX,
  CAM_PITCH_MIN,
  CAM_PITCH_START,
  CAM_POS_DAMP,
  CAM_TARGET_HEIGHT,
  CAM_UP_DAMP,
  MOUSE_SENS,
} from './tuning'

const _q = new THREE.Quaternion()
const _qStep = new THREE.Quaternion()
const _target = new THREE.Vector3()
const _desired = new THREE.Vector3()
const _perp = new THREE.Vector3()

/**
 * The hard part of a spherical-gravity game.
 *
 * The camera's own up-vector is *parallel-transported* toward the player's up
 * — rotate the up and the forward by the same quaternion — rather than
 * recomputed from scratch. Recomputing degenerates when you cross a pole and
 * the forward becomes parallel to the up; transporting never does.
 *
 * While airborne the transport is frozen, so the world doesn't spin around you
 * mid-flight. The roll happens once, on landing.
 */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera
  readonly up = new THREE.Vector3(1, 0, 0)
  readonly forward = new THREE.Vector3(0, 0, 1)

  private pitch = CAM_PITCH_START
  private distance = CAM_DISTANCE

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.1, 400)
    this.camera.up.copy(this.up)
  }

  look(dx: number, dy: number): void {
    if (dx !== 0) {
      _q.setFromAxisAngle(this.up, -dx * MOUSE_SENS)
      this.forward.applyQuaternion(_q).normalize()
    }
    if (dy !== 0) {
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * MOUSE_SENS, CAM_PITCH_MIN, CAM_PITCH_MAX)
    }
  }

  /** Roll the camera basis toward the player's up. No-op while airborne. */
  transport(playerUp: THREE.Vector3, grounded: boolean, dt: number): void {
    if (grounded) {
      _q.setFromUnitVectors(this.up, playerUp)
      _qStep.identity().slerp(_q, 1 - Math.exp(-CAM_UP_DAMP * dt))
      this.up.applyQuaternion(_qStep).normalize()
      this.forward.applyQuaternion(_qStep)
    }

    // Re-orthogonalise against accumulated float drift.
    this.forward.addScaledVector(this.up, -this.forward.dot(this.up))
    if (this.forward.lengthSq() < 1e-8) {
      _perp.set(0, 0, 1)
      if (Math.abs(this.up.z) > 0.9) _perp.set(1, 0, 0)
      this.forward.crossVectors(this.up, _perp)
    }
    this.forward.normalize()
  }

  /** Unit vector from the look-at point out toward the camera. */
  boomDirection(out: THREE.Vector3): THREE.Vector3 {
    return out
      .copy(this.up)
      .multiplyScalar(Math.sin(this.pitch))
      .addScaledVector(this.forward, -Math.cos(this.pitch))
      .normalize()
  }

  /** The point the camera is aimed at. */
  targetPoint(playerPos: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(playerPos).addScaledVector(this.up, CAM_TARGET_HEIGHT)
  }

  /** Ease the boom length toward a target, for ducking indoors. */
  setDistance(target: number, dt: number): void {
    this.distance = target + (this.distance - target) * Math.exp(-CAM_DISTANCE_DAMP * dt)
  }

  follow(playerPos: THREE.Vector3, dt: number, snap = false): void {
    _target.copy(playerPos).addScaledVector(this.up, CAM_TARGET_HEIGHT)
    _desired
      .copy(_target)
      .addScaledVector(this.up, this.distance * Math.sin(this.pitch))
      .addScaledVector(this.forward, -this.distance * Math.cos(this.pitch))

    if (snap) this.camera.position.copy(_desired)
    else this.camera.position.lerp(_desired, 1 - Math.exp(-CAM_POS_DAMP * dt))

    this.camera.up.copy(this.up)
    this.camera.lookAt(_target)
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }
}
