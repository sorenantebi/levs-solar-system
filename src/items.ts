import * as THREE from 'three'
import { Planet, PLANETS } from './planets'
import { SCROLLS, ScrollText } from './scrolls'
import { terrainAt } from './texture'
import { ITEM_BOB, ITEM_HOVER, ITEM_PICKUP_RADIUS, ITEM_SPIN } from './tuning'

const MINECRAFT_CHEST_DIR = new THREE.Vector3(-0.34, 0.88, 0.32).normalize()

/**
 * One scroll per planet, lying somewhere on dry land, waiting to be walked
 * into. Deliberately small — finding it is the point.
 *
 * The words are in scrolls.ts; this file is only about the object and where
 * it sits.
 */

export interface Collectible {
  planet: Planet
  scroll: ScrollText
  object: THREE.Object3D
  position: THREE.Vector3
  up: THREE.Vector3
  collected: boolean
}

/**
 * A rolled-up scroll: a tube of parchment with thicker ends, tied with a
 * ribbon in the planet's own colour so each one is recognisable.
 */
function buildScroll(colour: number): THREE.Object3D {
  const scroll = new THREE.Group()
  const parchment = new THREE.MeshStandardMaterial({
    color: 0xf3e4c0,
    emissive: 0xd8c79a,
    emissiveIntensity: 0.35,
    roughness: 0.85,
  })
  const cap = new THREE.MeshStandardMaterial({ color: 0xdcc79c, roughness: 0.8 })
  const ribbon = new THREE.MeshStandardMaterial({
    color: colour,
    emissive: colour,
    emissiveIntensity: 0.5,
    roughness: 0.7,
  })

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.3, 14), parchment)
  tube.rotation.z = Math.PI / 2
  scroll.add(tube)

  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.035, 14), cap)
    end.rotation.z = Math.PI / 2
    end.position.x = side * 0.155
    scroll.add(end)
  }

  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.016, 8, 16), ribbon)
  tie.rotation.y = Math.PI / 2
  scroll.add(tie)

  scroll.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true
  })
  return scroll
}

/**
 * Pick a spot on dry land. Deterministic — walks a Fibonacci spiral from an
 * offset derived from the planet's own seed — so the scroll is in the same
 * place every run rather than moving between reloads.
 */
function findSpot(p: Planet, groundRadius: (p: Planet, dir: THREE.Vector3) => number): THREE.Vector3 {
  if (p.name === 'minecraft') return MINECRAFT_CHEST_DIR.clone()

  const total = 2000
  const start = p.skin.seed % total
  const dir = new THREE.Vector3()

  for (let k = 0; k < total; k++) {
    const i = (start + k * 7) % total
    const y = 1 - (2 * i + 1) / total
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = i * Math.PI * (3 - Math.sqrt(5))
    dir.set(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize()

    // Solid ground, not the shore ramp — otherwise a scroll can end up on a
    // sliver of beach barely above the waterline, half-buried in the coast.
    if (terrainAt(p.skin, p.noiseScale, dir.x, dir.y, dir.z) < 0.5) continue
    // On a water world the land has to clear the waterline too.
    if (p.water > 0 && groundRadius(p, dir) <= p.radius + p.water + 0.25) continue
    return dir.clone()
  }
  return dir.set(0, 1, 0)
}

export function buildCollectibles(
  scene: THREE.Scene,
  groundRadius: (p: Planet, dir: THREE.Vector3) => number,
): Collectible[] {
  const out: Collectible[] = []
  const basis = new THREE.Matrix4()
  const right = new THREE.Vector3()
  const forward = new THREE.Vector3()

  for (const scroll of SCROLLS) {
    const planet = PLANETS.find((p) => p.name === scroll.planet)
    if (!planet) continue

    const up = findSpot(planet, groundRadius)
    const position = up
      .clone()
      .multiplyScalar(groundRadius(planet, up) + ITEM_HOVER)
      .add(planet.center)

    const object = buildScroll(scroll.colour)
    // Stand it up relative to its own planet, not the world.
    forward.set(0, 0, 1).addScaledVector(up, -up.z)
    if (forward.lengthSq() < 1e-6) forward.set(1, 0, 0).addScaledVector(up, -up.x)
    forward.normalize()
    right.crossVectors(forward, up).normalize()
    basis.makeBasis(right, up, forward.clone().negate())

    const holder = new THREE.Group()
    holder.position.copy(position)
    holder.quaternion.setFromRotationMatrix(basis)
    holder.add(object)
    scene.add(holder)

    out.push({ planet, scroll, object: holder, position, up, collected: false })
  }

  return out
}

/** Idle spin and hover, so a scroll reads as something to walk into. */
export function animateCollectibles(items: Collectible[], elapsed: number): void {
  for (const item of items) {
    if (item.collected) continue
    const child = item.object.children[0]
    child.rotation.y = elapsed * ITEM_SPIN
    child.position.y = Math.sin(elapsed * 1.8 + item.planet.radius) * ITEM_BOB
  }
}

/** Returns the scroll just picked up, or null. */
export function tryCollect(
  items: Collectible[],
  playerPos: THREE.Vector3,
  planet: Planet,
): Collectible | null {
  for (const item of items) {
    if (item.collected || item.planet !== planet) continue
    if (playerPos.distanceTo(item.position) > ITEM_PICKUP_RADIUS) continue
    item.collected = true
    item.object.visible = false
    return item
  }
  return null
}
