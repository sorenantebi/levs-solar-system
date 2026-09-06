import * as THREE from 'three'
import { Planet, PLANETS } from './planets'
import { terrainAt } from './texture'
import { ITEM_BOB, ITEM_HOVER, ITEM_PICKUP_RADIUS, ITEM_SPIN } from './tuning'

/**
 * One keepsake per world, sitting on dry land, waiting to be walked into.
 *
 * Each is assembled from a handful of primitives — same approach as the
 * character, for the same reason: no assets to source, and the shapes stay
 * readable at the size they're actually seen.
 */

export interface Collectible {
  planet: Planet
  /** Shown in the planet's panel. */
  label: string
  name: string
  colour: number
  object: THREE.Object3D
  position: THREE.Vector3
  up: THREE.Vector3
  collected: boolean
}

interface ItemSpec {
  planet: string
  label: string
  name: string
  colour: number
  build: (colour: number) => THREE.Object3D
}

function glowing(colour: number, emissive = 0.55): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: colour,
    emissive: colour,
    emissiveIntensity: emissive,
    roughness: 0.35,
    metalness: 0.1,
  })
}

function gem(colour: number, scaleY: number): THREE.Object3D {
  const group = new THREE.Group()
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), glowing(colour))
  body.scale.set(1, scaleY, 1)
  group.add(body)
  return group
}

const ITEMS: ItemSpec[] = [
  {
    planet: 'home',
    label: 'Home',
    name: 'the rose',
    colour: 0xff5f7e,
    build: (colour) => {
      const group = new THREE.Group()
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x4f9d54, roughness: 0.8 }),
      )
      stem.position.y = 0.25
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), glowing(colour, 0.35))
      bloom.position.y = 0.56
      for (const angle of [0, 2.1, 4.2]) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), glowing(colour, 0.3))
        petal.position.set(Math.cos(angle) * 0.14, 0.52, Math.sin(angle) * 0.14)
        petal.scale.set(1, 0.7, 1)
        group.add(petal)
      }
      group.add(stem, bloom)
      return group
    },
  },
  {
    planet: 'coral',
    label: 'Coral',
    name: 'the lantern',
    colour: 0xffcf6a,
    build: (colour) => {
      const group = new THREE.Group()
      const frame = new THREE.MeshStandardMaterial({ color: 0x6b4a3a, roughness: 0.7 })
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.34, 8, 1, true), frame)
      cage.position.y = 0.34
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 8), frame)
      cap.position.y = 0.59
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 8), frame)
      base.position.y = 0.15
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), glowing(colour, 1.4))
      flame.position.y = 0.34
      group.add(cage, cap, base, flame)
      return group
    },
  },
  {
    planet: 'sky',
    label: 'Sky',
    name: 'the star',
    colour: 0xffe066,
    build: (colour) => {
      const group = new THREE.Group()
      const a = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), glowing(colour, 1.1))
      a.scale.set(1, 1.5, 1)
      const b = a.clone()
      b.rotation.z = Math.PI / 2
      group.add(a, b)
      group.position.y = 0.1
      return group
    },
  },
  {
    planet: 'lilac',
    label: 'Lilac',
    name: 'the crystal',
    colour: 0xc79bff,
    build: (colour) => {
      const group = gem(colour, 1.9)
      group.position.y = 0.34
      return group
    },
  },
  {
    planet: 'lagoon',
    label: 'Lagoon',
    name: 'the pearl',
    colour: 0xfff0f5,
    build: (colour) => {
      const group = new THREE.Group()
      const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 16), glowing(colour, 0.5))
      pearl.position.y = 0.3
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 18, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
        new THREE.MeshStandardMaterial({ color: 0xf0b8c8, roughness: 0.5, side: THREE.DoubleSide }),
      )
      shell.position.y = 0.28
      shell.rotation.x = Math.PI
      group.add(shell, pearl)
      return group
    },
  },
  {
    planet: 'meadow',
    label: 'Meadow',
    name: 'the little key',
    colour: 0xffd479,
    build: (colour) => {
      const group = new THREE.Group()
      const metal = glowing(colour, 0.5)
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.46, 8), metal)
      shaft.position.y = 0.32
      shaft.rotation.z = Math.PI / 2
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.032, 8, 16), metal)
      bow.position.set(-0.31, 0.32, 0)
      bow.rotation.y = Math.PI / 2
      group.add(shaft, bow)
      for (const x of [0.12, 0.2]) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.04), metal)
        tooth.position.set(x, 0.26, 0)
        group.add(tooth)
      }
      return group
    },
  },
  {
    planet: 'blocks',
    label: 'Blocks',
    name: 'the diamond',
    colour: 0x5ce6e0,
    build: (colour) => {
      const group = gem(colour, 1.35)
      group.position.y = 0.34
      return group
    },
  },
]

/**
 * Pick a spot on dry land. Deterministic — walks a Fibonacci spiral from an
 * offset derived from the planet's own seed — so the keepsake is in the same
 * place every run rather than moving between reloads.
 */
function findSpot(p: Planet, groundRadius: (p: Planet, dir: THREE.Vector3) => number): THREE.Vector3 {
  const total = 2000
  const start = p.skin.seed % total
  const dir = new THREE.Vector3()

  for (let k = 0; k < total; k++) {
    const i = (start + k * 7) % total
    const y = 1 - (2 * i + 1) / total
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = i * Math.PI * (3 - Math.sqrt(5))
    dir.set(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize()

    // Solid ground, not the shore ramp — otherwise a keepsake can end up on a
    // sliver of beach barely above the waterline, half-buried in the coast.
    if (terrainAt(p.skin, p.noiseScale, dir.x, dir.y, dir.z) < 0.5) continue
    // On a water world the land has to clear the waterline, or the keepsake
    // ends up submerged on a shoal.
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

  for (const spec of ITEMS) {
    const planet = PLANETS.find((p) => p.name === spec.planet)
    if (!planet) continue

    const up = findSpot(planet, groundRadius)
    const position = up.clone().multiplyScalar(groundRadius(planet, up) + ITEM_HOVER).add(planet.center)

    const object = spec.build(spec.colour)
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
    object.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true
    })
    scene.add(holder)

    out.push({
      planet,
      label: spec.label,
      name: spec.name,
      colour: spec.colour,
      object: holder,
      position,
      up,
      collected: false,
    })
  }

  return out
}

/** Idle spin and hover, so a keepsake reads as something to walk into. */
export function animateCollectibles(items: Collectible[], elapsed: number): void {
  for (const item of items) {
    if (item.collected) continue
    const child = item.object.children[0]
    child.rotation.y = elapsed * ITEM_SPIN
    child.position.y = Math.sin(elapsed * 1.8 + item.planet.radius) * ITEM_BOB
  }
}

/** Returns the item just picked up, or null. */
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
