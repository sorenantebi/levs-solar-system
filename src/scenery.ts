import * as THREE from 'three'
import { Planet, PLANETS, waterRadius } from './planets'
import { terrainAt } from './texture'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { trackDownload } from './loading'
import {
  CLOUD_DRIFT,
  CLOUD_HEIGHT,
  VOXEL_BLOCK,
  VOXEL_LEAF,
  VOXEL_WOOD,
} from './tuning'

/**
 * Trees and clouds on the worlds that have weather.
 *
 * Everything here is decoration — no collision — which is the same bargain the
 * game struck at the start: props are for looking at, the ground is the only
 * thing you stand on. The one exception is the house, and it earned it.
 */

/** How many of each, per planet. The exotic worlds get neither. */
const TREES: Record<string, number> = { start: 3, freljord: 2, home: 2, hoenn: 2, minecraft: 1 }
const CLOUDS: Record<string, number> = { start: 3, freljord: 3, home: 3, hoenn: 3, minecraft: 3 }
const TVS: Record<string, number> = { arrakis: 1 }
const GAMES: Record<string, number> = { freljord: 2 }
const ALBUM_SURFACE_LIFT = 0.06
const ALBUMS: Record<string, number> = {
  start: 1,
  arrakis: 1,
  freljord: 1,
  silly: 1,
  hoenn: 1,
  home: 1,
  lover: 1,
  minecraft: 1,
}
export const HOME_POKEMON_DIR = new THREE.Vector3(0.2, 0.5, 0.74).normalize()
export const HOME_POKEMON_CLEAR_RADIUS = 2
const HOENN_MILOTIC_DIR = new THREE.Vector3(-0.62, 0.12, 0.78).normalize()
const HOENN_MILOTIC_URL = new URL('./models/milotic-animation.glb', import.meta.url).href
const HOENN_PSYDUCK_URL = new URL('./models/psyduck.glb', import.meta.url).href
const HOENN_ROWLET_URL = new URL('./models/rowlet.glb', import.meta.url).href
const HOENN_PHANTUMP_URL = new URL('./models/phantump.glb', import.meta.url).href
const HOENN_TREE_URL = new URL('./models/tree.glb', import.meta.url).href
const SKY_PENGUIN_URL = new URL('./models/penguin_-_tft.glb', import.meta.url).href
const SKY_PORO_URL = new URL('./models/poro.glb', import.meta.url).href
const SKY_PENGUIN_MIN_LIFT = 0.35
const SKY_GAMEPAD_MIN_LIFT = 0.5
const SKY_TREE_FOLIAGE = 0xf3f9ff
const SKY_TREE_BARK = 0xb9c4d2
const MEADOW_TREVENANT_DIR = new THREE.Vector3(1, 0.3, 0.56).normalize()
const MEADOW_TREVENANT_URL = new URL('./models/trevenant.glb', import.meta.url).href
const MEADOW_AZUMARILL_DIR = new THREE.Vector3(0.5, 0.9, 0.62).normalize()
const MEADOW_AZUMARILL_URL = new URL('./models/azumarill.glb', import.meta.url).href
const ARRAKIS_BENCH_DIR = new THREE.Vector3(-0.24, 0.4, 0.68).normalize()
const ARRAKIS_BENCH_URL = new URL('./models/better_call_saul_bench.glb', import.meta.url).href
// Well clear of the bench — roughly 109 degrees round the sphere from it, so
// nothing ends up standing inside anything else.
const ARRAKIS_OHMU_DIR = new THREE.Vector3(-1.55, 0.4, -0.72).normalize()
const ARRAKIS_OHMU_URL = new URL('./models/ohmu.glb', import.meta.url).href
const LOVER_RADIO_DIR = new THREE.Vector3(-0.48, 0.72, -0.5).normalize()
const LOVER_RADIO_URL = new URL('./models/retro_radio.glb', import.meta.url).href
const MINECRAFT_COW_URL = new URL('./models/minecraft_-_cow.glb', import.meta.url).href
const MINECRAFT_CHEST_DIR = new THREE.Vector3(-0.34, 0.88, 0.32).normalize()
const MINECRAFT_CHEST_URL = new URL('./models/minecraft_chest.glb', import.meta.url).href
const HOME_POKEMON_URL = new URL('./models/pokemon_-_marill.glb', import.meta.url).href

/** Deterministic per-planet randomness, so nothing moves between runs. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function orient(up: THREE.Vector3, out: THREE.Quaternion, spin = 0): THREE.Quaternion {
  const forward = new THREE.Vector3(0, 0, 1).addScaledVector(up, -up.z)
  if (forward.lengthSq() < 1e-6) forward.set(1, 0, 0).addScaledVector(up, -up.x)
  forward.normalize()
  const right = new THREE.Vector3().crossVectors(forward, up).normalize()
  out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward.clone().negate()))
  if (spin) out.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin))
  return out
}

/** A leafy tree: trunk, and a canopy of overlapping blobs. */
function buildTree(foliage: THREE.Color, random: () => number, barkColor = 0x6b4a33): THREE.Group {
  const tree = new THREE.Group()
  const bark = new THREE.MeshStandardMaterial({ color: barkColor, roughness: 0.9 })
  const leaves = new THREE.MeshStandardMaterial({ color: foliage, roughness: 0.92 })

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.13, 0.78, 8), bark)
  trunk.position.y = 0.39
  tree.add(trunk)

  const blobs: [number, number, number, number][] = [
    [0.44, 0, 1.12, 0],
    [0.33, -0.26, 0.92, 0.14],
    [0.3, 0.24, 0.98, -0.16],
    [0.26, 0.05, 1.42, 0.1],
  ]
  for (const [r, x, y, z] of blobs) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(r * (0.88 + random() * 0.28), 14, 10), leaves)
    blob.position.set(x, y, z)
    blob.scale.y = 0.86
    tree.add(blob)
  }

  tree.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return tree
}

/**
 * The block world's tree, built out of real cubes on the same grid as the
 * terrain — a slab would read as a slab however it were shaded.
 *
 * One InstancedMesh rather than sixty separate ones: it is a single draw call,
 * and per-instance colour still gives every block its own slight tint.
 */
function buildBlockTree(): THREE.Object3D {
  const B = VOXEL_BLOCK
  const cells: [number, number, number, boolean][] = []

  const TRUNK = 4
  for (let y = 0; y < TRUNK; y++) cells.push([0, y, 0, false])

  // Two wide layers, then two narrower ones — the shape Minecraft's oak uses.
  for (const [y, half, trimCorners] of [
    [TRUNK - 1, 2, true],
    [TRUNK, 2, true],
    [TRUNK + 1, 1, false],
    [TRUNK + 2, 1, true],
  ] as const) {
    for (let x = -half; x <= half; x++) {
      for (let z = -half; z <= half; z++) {
        if (trimCorners && Math.abs(x) === half && Math.abs(z) === half) continue
        if (x === 0 && z === 0 && y < TRUNK) continue
        cells.push([x, y, z, true])
      }
    }
  }

  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(B, B, B),
    new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }),
    cells.length,
  )
  const m = new THREE.Matrix4()
  const colour = new THREE.Color()
  const wood = new THREE.Color(VOXEL_WOOD)
  const leaf = new THREE.Color(VOXEL_LEAF)

  cells.forEach(([x, y, z, isLeaf], i) => {
    m.makeTranslation(x * B, y * B + B / 2, z * B)
    mesh.setMatrixAt(i, m)
    // Same trick as the terrain: a little tint variation so a flat colour
    // doesn't melt neighbouring blocks into one shape.
    const jitter = 1 + (((i * 37) % 11) / 11 - 0.5) * 0.12
    colour.copy(isLeaf ? leaf : wood).multiplyScalar(jitter)
    mesh.setColorAt(i, colour)
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** A chunky retro arcade cabinet, sized for a tiny planet. */
function buildArcadeCabinet(): THREE.Group {
  const arcade = new THREE.Group()
  const shell = new THREE.MeshStandardMaterial({ color: 0x24476d, roughness: 0.86 })
  const trim = new THREE.MeshStandardMaterial({ color: 0xf5d86c, roughness: 0.7 })
  const screen = new THREE.MeshStandardMaterial({
    color: 0x10233f,
    emissive: 0x4dd1ff,
    emissiveIntensity: 0.8,
    roughness: 0.25,
  })
  const panel = new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.72 })
  const button = new THREE.MeshStandardMaterial({ color: 0xff6a6a, roughness: 0.55 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.35, 0.48), shell)
  body.castShadow = true
  body.receiveShadow = true
  arcade.add(body)

  const marquee = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.22, 0.08), trim)
  marquee.position.set(0, 0.58, 0.24)
  marquee.castShadow = true
  marquee.receiveShadow = true
  arcade.add(marquee)

  const display = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.4, 0.04), screen)
  display.position.set(0, 0.24, 0.24)
  display.castShadow = true
  display.receiveShadow = true
  arcade.add(display)

  const panelBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.14), panel)
  panelBox.position.set(0, -0.24, 0.18)
  panelBox.rotation.x = -0.08
  panelBox.castShadow = true
  panelBox.receiveShadow = true
  arcade.add(panelBox)

  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.16, 8), trim)
  stick.position.set(-0.18, -0.19, 0.25)
  stick.castShadow = true
  stick.receiveShadow = true
  arcade.add(stick)

  for (const [x, y] of [
    [0.05, -0.17],
    [0.14, -0.12],
    [0.23, -0.18],
  ] as const) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), button)
    b.position.set(x, y, 0.26)
    b.castShadow = true
    b.receiveShadow = true
    arcade.add(b)
  }

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.14, 0.56), shell)
  base.position.y = -0.72
  base.castShadow = true
  base.receiveShadow = true
  arcade.add(base)

  return arcade
}

/** A simple gamepad: grip, buttons, and sticks. */
function buildGamepad(): THREE.Group {
  const pad = new THREE.Group()
  const shell = new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.8 })
  const dpad = new THREE.MeshStandardMaterial({ color: 0xd8dce6, roughness: 0.55 })
  const action = new THREE.MeshStandardMaterial({ color: 0xff8e6f, roughness: 0.55 })
  const stick = new THREE.MeshStandardMaterial({ color: 0x181b20, roughness: 0.7 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.28, 0.72), shell)
  body.castShadow = true
  body.receiveShadow = true
  pad.add(body)

  const leftGrip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), shell)
  leftGrip.scale.set(0.86, 1.2, 1.18)
  leftGrip.position.set(-0.48, -0.06, 0)
  leftGrip.castShadow = true
  leftGrip.receiveShadow = true
  pad.add(leftGrip)

  const rightGrip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), shell)
  rightGrip.scale.set(0.86, 1.2, 1.18)
  rightGrip.position.set(0.48, -0.06, 0)
  rightGrip.castShadow = true
  rightGrip.receiveShadow = true
  pad.add(rightGrip)

  const dpadBlock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.16), dpad)
  dpadBlock.position.set(-0.25, 0.17, 0.16)
  pad.add(dpadBlock)

  const leftStick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10), stick)
  leftStick.position.set(-0.1, 0.15, -0.08)
  pad.add(leftStick)

  for (const [x, z] of [
    [0.22, 0.18],
    [0.32, 0.09],
    [0.42, 0.17],
    [0.32, 0.26],
  ] as const) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), action)
    b.position.set(x, 0.18, z)
    b.castShadow = true
    b.receiveShadow = true
    pad.add(b)
  }

  const rightStick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10), stick)
  rightStick.position.set(0.18, 0.15, -0.1)
  pad.add(rightStick)

  return pad
}

/** A tiny hardcover album prop you can walk up to and open. */
function buildPhotoAlbum(): THREE.Group {
  const album = new THREE.Group()
  const cover = new THREE.MeshStandardMaterial({ color: 0x5a2f2f, roughness: 0.78 })
  const paper = new THREE.MeshStandardMaterial({ color: 0xf3e7c7, roughness: 0.92 })
  const badge = new THREE.MeshStandardMaterial({ color: 0xd9b668, roughness: 0.5 })

  const book = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.52), cover)
  book.castShadow = true
  book.receiveShadow = true
  album.add(book)

  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.05, 0.44), paper)
  pages.position.y = 0.01
  pages.castShadow = true
  pages.receiveShadow = true
  album.add(pages)

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.08), badge)
  plate.position.set(0.18, 0.05, 0.12)
  plate.castShadow = true
  plate.receiveShadow = true
  album.add(plate)

  return album
}

function loadModelOnPlanet(
  scene: THREE.Scene,
  planet: Planet,
  url: string,
  dir: THREE.Vector3,
  targetHeight: number,
  spin: number,
  surfaceRadius: (p: Planet, d: THREE.Vector3) => number,
  errorLabel: string,
  mixers: THREE.AnimationMixer[],
  modelTilt?: THREE.Euler,
  onPlaced?: (holder: THREE.Group) => void,
): void {
  const loader = new GLTFLoader()
  loader.load(
    url,
    (gltf) => {
      const model = gltf.scene
      if (modelTilt) model.rotation.copy(modelTilt)
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })

      const box = new THREE.Box3().setFromObject(model)
      const height = box.max.y - box.min.y
      if (height > 1e-6) model.scale.setScalar(targetHeight / height)
      model.updateMatrixWorld(true)

      box.setFromObject(model)
      model.position.y -= box.min.y

      const holder = new THREE.Group()
      holder.add(model)

      holder.position
        .copy(dir)
        .multiplyScalar(surfaceRadius(planet, dir))
        .add(planet.center)
      const quat = new THREE.Quaternion()
      orient(dir, quat, spin)
      holder.quaternion.copy(quat)
      scene.add(holder)
      onPlaced?.(holder)

      if (gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(holder)
        mixer.clipAction(gltf.animations[0]).play()
        mixers.push(mixer)
      }
    },
    trackDownload(),
    (error) => {
      console.error(`Failed to load ${errorLabel} model:`, error)
    },
  )
}

function addHomePokemon(
  scene: THREE.Scene,
  home: Planet,
  surfaceRadius: (p: Planet, d: THREE.Vector3) => number,
  mixers: THREE.AnimationMixer[],
  onInteractable?: (root: THREE.Object3D, text: string) => void,
): void {
  loadModelOnPlanet(
    scene,
    home,
    HOME_POKEMON_URL,
    HOME_POKEMON_DIR.clone(),
    1.7,
    Math.PI * 0.35,
    surfaceRadius,
    'home Pokemon',
    mixers,
    undefined,
    (holder) => onInteractable?.(holder, 'MARILLL'),
  )
}

/** A small retro TV: cabinet, screen, stand, and rabbit ears. */
function buildTV(): THREE.Group {
  const tv = new THREE.Group()
  const body = new THREE.Group()
  const shell = new THREE.MeshStandardMaterial({ color: 0x4b3f35, roughness: 0.85 })
  const screenFrame = new THREE.MeshStandardMaterial({ color: 0x1d2228, roughness: 0.7 })
  const screenGlow = new THREE.MeshStandardMaterial({
    color: 0xdccba4,
    emissive: 0xb79b65,
    emissiveIntensity: 0.55,
    roughness: 0.25,
  })
  const metal = new THREE.MeshStandardMaterial({ color: 0x6f6a60, roughness: 0.55 })

  body.position.y = 0.63

  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.74, 0.45), shell)
  cabinet.castShadow = true
  cabinet.receiveShadow = true
  body.add(cabinet)

  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.48, 0.06), screenFrame)
  bezel.position.set(0, 0.08, 0.23)
  bezel.castShadow = true
  bezel.receiveShadow = true
  body.add(bezel)

  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.02), screenGlow)
  screen.position.set(0, 0.08, 0.261)
  body.add(screen)

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.2, 8), shell)
  base.position.y = -0.47
  base.castShadow = true
  base.receiveShadow = true
  body.add(base)

  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.24), shell)
  foot.position.set(0, -0.59, 0)
  foot.castShadow = true
  foot.receiveShadow = true
  body.add(foot)

  for (const side of [-1, 1] as const) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.52, 6), metal)
    mast.position.set(side * 0.16, 0.52, 0.05)
    mast.rotation.z = side * 0.32
    mast.castShadow = true
    mast.receiveShadow = true
    body.add(mast)
  }

  tv.add(body)
  return tv
}

/**
 * A cloud: one large puff in the middle, a smaller one either side.
 *
 * Fixed rather than random. Every cloud is the same shape, so they read as a
 * deliberate motif instead of as noise — and the sky looks the same every run.
 */
const CLOUD_PUFFS: [number, number][] = [
  // radius, sideways offset
  [0.85, 0],
  [0.55, -0.6],
  [0.55, 0.6],
]

/** Squashed, so a cloud sits flat rather than reading as a row of beads. */
const CLOUD_FLATTEN = 0.5

function buildCloud(material: THREE.Material): THREE.Group {
  const cloud = new THREE.Group()
  for (const [r, x] of CLOUD_PUFFS) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), material)
    // The outer two hang slightly lower, which gives the flat-bottomed,
    // heaped silhouette a cloud reads by.
    puff.position.set(x, x === 0 ? 0 : -0.1, 0)
    puff.scale.y = CLOUD_FLATTEN
    cloud.add(puff)
  }
  return cloud
}

function buildBlockCloud(material: THREE.Material): THREE.Group {
  const cloud = new THREE.Group()
  for (const [r, x] of CLOUD_PUFFS) {
    const puff = new THREE.Mesh(new THREE.BoxGeometry(r * 1.55, r * 0.9, r * 1.3), material)
    puff.position.set(x, x === 0 ? 0 : -0.1, 0)
    cloud.add(puff)
  }
  return cloud
}

/** Somewhere on dry land, clear of anything already standing there. */
function scatter(
  planet: Planet,
  count: number,
  groundRadius: (p: Planet, d: THREE.Vector3) => number,
  avoid: { point: THREE.Vector3; radius: number }[],
  random: () => number,
  minLift = 0,
): THREE.Vector3[] {
  const chosen: THREE.Vector3[] = []
  const dir = new THREE.Vector3()
  const world = new THREE.Vector3()
  const spacing = 2.6 / planet.radius // keep them from clumping

  for (let attempt = 0; attempt < 3000 && chosen.length < count; attempt++) {
    const y = random() * 2 - 1
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = random() * Math.PI * 2
    dir.set(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize()

    if (terrainAt(planet.skin, planet.noiseScale, dir.x, dir.y, dir.z) < 0.5) continue
    const ground = groundRadius(planet, dir)
    // Strictly below, not at or below: lover is relief 0, so its ground sits
    // exactly at the base radius everywhere. Rejecting equality rejected that
    // whole planet, and its album was never placed. Anywhere with relief the
    // terrain test above already guarantees ground > radius, so this only
    // changes the smooth worlds.
    if (ground < planet.radius + minLift) continue
    // On a water world it also has to be above the waterline, not on a shoal.
    if (planet.water > 0 && ground <= waterRadius(planet) + 0.15) continue

    world.copy(dir).multiplyScalar(ground).add(planet.center)
    if (avoid.some((a) => world.distanceTo(a.point) < a.radius)) continue
    if (chosen.some((c) => c.angleTo(dir) < spacing)) continue

    chosen.push(dir.clone())
  }
  return chosen
}

function primaryAvoidAxis(
  planet: Planet,
  avoid: { point: THREE.Vector3; radius: number }[],
): THREE.Vector3 | null {
  const dir = new THREE.Vector3()
  let best: { radius: number; axis: THREE.Vector3 } | null = null

  for (const a of avoid) {
    dir.copy(a.point).sub(planet.center)
    const dist = dir.length()
    if (dist < planet.radius * 0.6 || dist > planet.radius + planet.relief + 20) continue
    if (!best || a.radius > best.radius) {
      best = { radius: a.radius, axis: dir.clone().normalize() }
    }
  }

  return best?.axis ?? null
}

export interface Scenery {
  /** Drifts the clouds. `t` is elapsed seconds. */
  update(t: number): void
  /** Where the trees ended up, in world space. */
  trees: THREE.Vector3[]
  /** Album interaction anchors, one per planet. */
  albums: { planet: Planet; point: THREE.Vector3 }[]
}

export function buildScenery(
  scene: THREE.Scene,
  groundRadius: (p: Planet, d: THREE.Vector3) => number,
  avoid: { point: THREE.Vector3; radius: number }[],
  onInteractable?: (root: THREE.Object3D, text: string) => void,
): Scenery {
  const drifting: { group: THREE.Group; axis: THREE.Vector3; speed: number }[] = []
  const trees: THREE.Vector3[] = []
  const albums: { planet: Planet; point: THREE.Vector3 }[] = []
  const mixers: THREE.AnimationMixer[] = []
  const quat = new THREE.Quaternion()
  let lastT = 0

  for (const planet of PLANETS) {
    const random = rng(planet.skin.seed * 7919 + 13)
    const planetAvoid = avoid.slice()

    if (planet.name === 'hoenn') {
      let azurillDir: THREE.Vector3 | null = null
      const dir = scatter(planet, 1, groundRadius, planetAvoid, random)[0]
      if (dir) {
        azurillDir = dir.clone()
        const surfaceRadius = groundRadius(planet, dir)
        const point = dir.clone().multiplyScalar(surfaceRadius).add(planet.center)
        planetAvoid.push({ point, radius: 2.0 })
        loadModelOnPlanet(
          scene,
          planet,
          new URL('./models/azurill.glb', import.meta.url).href,
          dir,
          0.8,
          Math.PI * 0.3,
          groundRadius,
          'hoenn Pokemon',
          mixers,
          undefined,
          (holder) => onInteractable?.(holder, 'azuu meep'),
        )
      }

      const miloticPoint = HOENN_MILOTIC_DIR.clone()
        .multiplyScalar(waterRadius(planet) - 0.6)
        .add(planet.center)
      planetAvoid.push({ point: miloticPoint, radius: 3.0 })
      loadModelOnPlanet(
        scene,
        planet,
        HOENN_MILOTIC_URL,
        HOENN_MILOTIC_DIR.clone(),
        2.4,
        -Math.PI * 0.12,
        () => waterRadius(planet) - 0.6,
        'hoenn Milotic',
        mixers,
        undefined,
        (holder) => onInteractable?.(holder, 'AOOOOOOOWOWOOOOO'),
      )

      const psyduckCandidates = scatter(planet, 24, groundRadius, planetAvoid, random)
      const farCandidates =
        azurillDir === null ? psyduckCandidates : psyduckCandidates.filter((d) => d.angleTo(azurillDir as THREE.Vector3) > 1.1)
      const pickFrom = farCandidates.length > 0 ? farCandidates : psyduckCandidates
      const psyduckDir = pickFrom.reduce<THREE.Vector3 | null>((best, d) => {
        const upAxis = Math.abs(d.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
        const tangentA = new THREE.Vector3().crossVectors(d, upAxis)
        if (tangentA.lengthSq() < 1e-6) return best ?? d
        tangentA.normalize()
        const tangentB = new THREE.Vector3().crossVectors(d, tangentA).normalize()

        const baseMargin = groundRadius(planet, d) - waterRadius(planet)
        let minMargin = baseMargin
        let roughness = 0
        for (const t of [tangentA, tangentA.clone().negate(), tangentB, tangentB.clone().negate()]) {
          const probe = d.clone().addScaledVector(t, 0.18).normalize()
          const margin = groundRadius(planet, probe) - waterRadius(planet)
          minMargin = Math.min(minMargin, margin)
          roughness += Math.abs(margin - baseMargin)
        }

        const separation = azurillDir ? d.angleTo(azurillDir) : 0
        const score = minMargin * 4.2 - roughness * 1.8 + separation * 0.4
        if (!best) return d

        const bestBase = groundRadius(planet, best) - waterRadius(planet)
        let bestMin = bestBase
        let bestRough = 0
        const bestAxis = Math.abs(best.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
        const bestA = new THREE.Vector3().crossVectors(best, bestAxis)
        if (bestA.lengthSq() < 1e-6) return d
        bestA.normalize()
        const bestB = new THREE.Vector3().crossVectors(best, bestA).normalize()
        for (const t of [bestA, bestA.clone().negate(), bestB, bestB.clone().negate()]) {
          const probe = best.clone().addScaledVector(t, 0.18).normalize()
          const margin = groundRadius(planet, probe) - waterRadius(planet)
          bestMin = Math.min(bestMin, margin)
          bestRough += Math.abs(margin - bestBase)
        }
        const bestSeparation = azurillDir ? best.angleTo(azurillDir) : 0
        const bestScore = bestMin * 4.2 - bestRough * 1.8 + bestSeparation * 0.4
        return score > bestScore ? d : best
      }, null)
      if (psyduckDir) {
        const psyduckPoint = psyduckDir
          .clone()
          .multiplyScalar(groundRadius(planet, psyduckDir))
          .add(planet.center)
        planetAvoid.push({ point: psyduckPoint, radius: 2.0 })
        loadModelOnPlanet(
          scene,
          planet,
          HOENN_PSYDUCK_URL,
          psyduckDir,
          1.0,
          random() * Math.PI * 2,
          groundRadius,
          'hoenn Psyduck',
          mixers,
          undefined,
          (holder) => onInteractable?.(holder, 'PSYDUCKKK... my head hurt'),
        )
      }

      const rowletDir = scatter(planet, 1, groundRadius, planetAvoid, random)[0]
      if (rowletDir) {
        const rowletPoint = rowletDir
          .clone()
          .multiplyScalar(groundRadius(planet, rowletDir))
          .add(planet.center)
        planetAvoid.push({ point: rowletPoint, radius: 1.8 })
        loadModelOnPlanet(
          scene,
          planet,
          HOENN_ROWLET_URL,
          rowletDir,
          0.75,
          random() * Math.PI * 2,
          groundRadius,
          'hoenn Rowlet',
          mixers,
          undefined,
          (holder) => onInteractable?.(holder, 'CAWWW'),
        )
      }

      const phantumpDir = scatter(planet, 1, groundRadius, planetAvoid, random)[0]
      if (phantumpDir) {
        const phantumpPoint = phantumpDir
          .clone()
          .multiplyScalar(groundRadius(planet, phantumpDir))
          .add(planet.center)
        planetAvoid.push({ point: phantumpPoint, radius: 1.8 })
        loadModelOnPlanet(
          scene,
          planet,
          HOENN_PHANTUMP_URL,
          phantumpDir,
          0.8,
          random() * Math.PI * 2,
          groundRadius,
          'hoenn Phantump',
          mixers,
          undefined,
          (holder) => onInteractable?.(holder, 'boo'),
        )
      }
    }

    if (planet.name === 'home') {
      const trevenantPoint = MEADOW_TREVENANT_DIR.clone()
        .multiplyScalar(groundRadius(planet, MEADOW_TREVENANT_DIR))
        .add(planet.center)
      planetAvoid.push({ point: trevenantPoint, radius: 3.0 })
      loadModelOnPlanet(
        scene,
        planet,
        MEADOW_TREVENANT_URL,
        MEADOW_TREVENANT_DIR.clone(),
        2,
        Math.PI * 1.15,
        (p, d) => groundRadius(p, d) - 0.3,
        'home Trevenant',
        mixers,
        undefined,
        (holder) => onInteractable?.(holder, 'BOOO'),
      )

      const azumarillPoint = MEADOW_AZUMARILL_DIR.clone()
        .multiplyScalar(groundRadius(planet, MEADOW_AZUMARILL_DIR))
        .add(planet.center)
      planetAvoid.push({ point: azumarillPoint, radius: 2.2 })
      loadModelOnPlanet(
        scene,
        planet,
        MEADOW_AZUMARILL_URL,
        MEADOW_AZUMARILL_DIR.clone(),
        1.2,
        Math.PI * 0.15,
        (p, d) => groundRadius(p, d) - 0.1,
        'home Azumarill',
        mixers,
        undefined,
        (holder) => onInteractable?.(holder, 'I love you so much AZUUUUU'),
      )
    }

    if (planet.name === 'freljord') {
      const penguinDir = scatter(planet, 1, groundRadius, planetAvoid, random, SKY_PENGUIN_MIN_LIFT)[0]
      if (penguinDir) {
        const penguinPoint = penguinDir
          .clone()
          .multiplyScalar(groundRadius(planet, penguinDir))
          .add(planet.center)
        planetAvoid.push({ point: penguinPoint, radius: 2.2 })
        loadModelOnPlanet(
          scene,
          planet,
          SKY_PENGUIN_URL,
          penguinDir,
          0.9,
          random() * Math.PI * 2,
          groundRadius,
          'freljord Penguin',
          mixers,
        )
      }

      const poroDir = scatter(planet, 1, groundRadius, planetAvoid, random, SKY_PENGUIN_MIN_LIFT)[0]
      if (poroDir) {
        const poroPoint = poroDir
          .clone()
          .multiplyScalar(groundRadius(planet, poroDir))
          .add(planet.center)
        planetAvoid.push({ point: poroPoint, radius: 2.1 })
        loadModelOnPlanet(
          scene,
          planet,
          SKY_PORO_URL,
          poroDir,
          0.8,
          random() * Math.PI * 2,
          groundRadius,
          'freljord Poro',
          mixers,
        )
      }
    }

    if (planet.name === 'minecraft') {
      const chestPoint = MINECRAFT_CHEST_DIR.clone()
        .multiplyScalar(groundRadius(planet, MINECRAFT_CHEST_DIR))
        .add(planet.center)
      planetAvoid.push({ point: chestPoint, radius: 4.8 })
      loadModelOnPlanet(
        scene,
        planet,
        MINECRAFT_CHEST_URL,
        MINECRAFT_CHEST_DIR.clone(),
        0.7,
        Math.PI * 0.25,
        groundRadius,
        'minecraft Chest',
        mixers,
      )

      const cowDir = scatter(planet, 1, groundRadius, planetAvoid, random, VOXEL_BLOCK)[0]
      if (cowDir) {
        const cowPoint = cowDir
          .clone()
          .multiplyScalar(groundRadius(planet, cowDir))
          .add(planet.center)
        planetAvoid.push({ point: cowPoint, radius: 2.2 })
        loadModelOnPlanet(
          scene,
          planet,
          MINECRAFT_COW_URL,
          cowDir,
          1.4,
          random() * Math.PI * 2,
          groundRadius,
          'minecraft Cow',
          mixers,
        )
      }
    }

    if (planet.name === 'lover') {
      const radioPoint = LOVER_RADIO_DIR.clone()
        .multiplyScalar(groundRadius(planet, LOVER_RADIO_DIR))
        .add(planet.center)
      planetAvoid.push({ point: radioPoint, radius: 2.1 })
      loadModelOnPlanet(
        scene,
        planet,
        LOVER_RADIO_URL,
        LOVER_RADIO_DIR.clone(),
        1.0,
        Math.PI * 0.35,
        (p, d) => groundRadius(p, d) - 0.1,
        'lover Radio',
        mixers,
      )
    }

    if (planet.name === 'arrakis') {
      const benchPoint = ARRAKIS_BENCH_DIR.clone()
        .multiplyScalar(groundRadius(planet, ARRAKIS_BENCH_DIR))
        .add(planet.center)
      planetAvoid.push({ point: benchPoint, radius: 2.0 })
      loadModelOnPlanet(
        scene,
        planet,
        ARRAKIS_BENCH_URL,
        ARRAKIS_BENCH_DIR.clone(),
        1.0,
        -Math.PI * 0.3,
        (p, d) => groundRadius(p, d) - 0.24,
        'arrakis Bench',
        mixers,
        new THREE.Euler(0, 0, -0.18),
      )

      // Big enough to read as one of the giant ones, on a planet of radius 5.
      const ohmuPoint = ARRAKIS_OHMU_DIR.clone()
        .multiplyScalar(groundRadius(planet, ARRAKIS_OHMU_DIR))
        .add(planet.center)
      planetAvoid.push({ point: ohmuPoint, radius: 3.2 })
      loadModelOnPlanet(
        scene,
        planet,
        ARRAKIS_OHMU_URL,
        ARRAKIS_OHMU_DIR.clone(),
        0.5,
        Math.PI * 0.75,
        (p, d) => groundRadius(p, d) - 0.05,
        'arrakis Ohmu',
        mixers,
        new THREE.Euler(-0.2, 0, 0),
        (holder) => onInteractable?.(holder, 'meep'),
      )
    }

    // --- photo albums
    const albumCount = ALBUMS[planet.name] ?? 0
    if (albumCount > 0) {
      for (const dir of scatter(planet, albumCount, groundRadius, planetAvoid, random)) {
        const point = dir
          .clone()
          .multiplyScalar(groundRadius(planet, dir) + ALBUM_SURFACE_LIFT)
          .add(planet.center)
        const album = buildPhotoAlbum()
        album.position.copy(point)
        orient(dir, quat, random() * Math.PI * 2)
        album.quaternion.copy(quat)
        album.scale.setScalar(0.95)
        planetAvoid.push({ point: point.clone(), radius: 2.0 })
        albums.push({ planet, point: point.clone() })
        scene.add(album)
      }
    }

    // --- trees
    const treeCount = TREES[planet.name] ?? 0
    if (treeCount > 0) {
      const isSky = planet.name === 'freljord'
      const foliage = isSky
        ? new THREE.Color(SKY_TREE_FOLIAGE)
        : new THREE.Color(planet.skin.land).lerp(new THREE.Color(0x2f7a3f), 0.55)
      const minTreeLift = planet.voxelGrid > 0 ? VOXEL_BLOCK : 0
      for (const dir of scatter(planet, treeCount, groundRadius, planetAvoid, random, minTreeLift)) {
        if (planet.name === 'hoenn') {
          const treePoint = dir
            .clone()
            .multiplyScalar(groundRadius(planet, dir))
            .add(planet.center)
          planetAvoid.push({ point: treePoint, radius: 1.8 })
          trees.push(treePoint.clone())
          loadModelOnPlanet(
            scene,
            planet,
            HOENN_TREE_URL,
            dir,
            1.8,
            random() * Math.PI * 2,
            groundRadius,
            'hoenn Tree',
            mixers,
          )
          continue
        }

        const tree =
          planet.voxelGrid > 0
            ? buildBlockTree()
            : buildTree(foliage, random, isSky ? SKY_TREE_BARK : 0x6b4a33)
        // Smooth trees need a tiny sink; voxel trees already sit on exact block tops.
        const groundOffset = planet.voxelGrid > 0 ? 0 : -0.08
        tree.position
          .copy(dir)
          .multiplyScalar(groundRadius(planet, dir) + groundOffset)
          .add(planet.center)
        orient(dir, quat, random() * Math.PI * 2)
        tree.quaternion.copy(quat)
        const s = 0.85 + random() * 0.45
        if (planet.voxelGrid === 0) tree.scale.setScalar(s)
        planetAvoid.push({ point: tree.position.clone(), radius: planet.voxelGrid > 0 ? 1.8 : 1.5 })
        trees.push(tree.position.clone())
        scene.add(tree)
      }
    }

    // --- gaming props
    const gameCount = GAMES[planet.name] ?? 0
    if (gameCount > 0) {
      if (planet.name === 'freljord') {
        const skyGamepadCount = Math.max(0, gameCount - 1)
        for (let i = 0; i < skyGamepadCount; i++) {
          const candidates = scatter(planet, 10, groundRadius, planetAvoid, random, SKY_GAMEPAD_MIN_LIFT)
          if (candidates.length === 0) break
          const dir = candidates.reduce((best, d) =>
            groundRadius(planet, d) > groundRadius(planet, best) ? d : best,
          )
          const point = dir.clone().multiplyScalar(groundRadius(planet, dir)).add(planet.center)
          planetAvoid.push({ point, radius: 2.2 })

          const gamepad = buildGamepad()
          gamepad.position.copy(point)
          orient(dir, quat, random() * Math.PI * 2)
          gamepad.quaternion.copy(quat)
          gamepad.scale.setScalar(1.15)
          scene.add(gamepad)
        }
      } else {
        const gameDirs = scatter(planet, gameCount, groundRadius, planetAvoid, random)
        for (const [i, dir] of gameDirs.entries()) {
          const game = i === 0 ? buildArcadeCabinet() : buildGamepad()
          game.position
            .copy(dir)
            .multiplyScalar(groundRadius(planet, dir))
            .add(planet.center)
          orient(dir, quat, random() * Math.PI * 2)
          game.quaternion.copy(quat)
          game.scale.setScalar(i === 0 ? 0.9 : 1.15)
          scene.add(game)
        }
      }
    }

    // --- TVs
    const tvCount = TVS[planet.name] ?? 0
    if (tvCount > 0) {
      for (const dir of scatter(planet, tvCount, groundRadius, planetAvoid, random)) {
        const tv = buildTV()
        tv.position
          .copy(dir)
          .multiplyScalar(groundRadius(planet, dir))
          .add(planet.center)
        orient(dir, quat, random() * Math.PI * 2)
        tv.quaternion.copy(quat)
        tv.scale.setScalar(0.85)
        scene.add(tv)
      }
    }

    // --- clouds
    const cloudCount = CLOUDS[planet.name] ?? 0
    if (cloudCount === 0) continue

    const homeCloudAxis = planet.name === 'home' ? primaryAvoidAxis(planet, avoid) : null

    // One group per planet, spun slowly about its own axis: the whole sky
    // drifts for the cost of a single quaternion per frame.
    const sky = new THREE.Group()
    sky.position.copy(planet.center)
    const ceiling = planet.radius + planet.relief + CLOUD_HEIGHT

    // Slightly self-lit, so the night side keeps its shape instead of going
    // flat. Shared across every puff on the planet: one material, one program.
    const vapour = new THREE.MeshStandardMaterial({
      color: 0xfdfbff,
      roughness: 1,
      emissive: 0xb9c4e8,
      emissiveIntensity: 0.16,
    })

    for (let i = 0; i < cloudCount; i++) {
      let theta = i * Math.PI * (3 - Math.sqrt(5))
      let dir: THREE.Vector3
      if (homeCloudAxis) {
        // Keep Home clouds on a dedicated ring opposite the house side.
        theta = (i / cloudCount) * Math.PI * 2
        const away = -0.62
        const ringR = Math.sqrt(Math.max(0, 1 - away * away))
        const tangent = Math.abs(homeCloudAxis.y) > 0.95
          ? new THREE.Vector3(1, 0, 0)
          : new THREE.Vector3(0, 1, 0)
        tangent.addScaledVector(homeCloudAxis, -tangent.dot(homeCloudAxis)).normalize()
        const bitangent = new THREE.Vector3().crossVectors(homeCloudAxis, tangent).normalize()
        dir = tangent.multiplyScalar(Math.cos(theta) * ringR)
          .addScaledVector(bitangent, Math.sin(theta) * ringR)
          .addScaledVector(homeCloudAxis, away)
          .normalize()
      } else {
        // Spread evenly by golden angle rather than scattered at random, so the
        // sky is never lopsided and never changes between runs. `y` has to stay
        // inside -1..1 or the ring radius goes imaginary and the clouds pile up
        // on a pole.
        const y = 1 - (2 * i + 1) / cloudCount
        const r = Math.sqrt(Math.max(0, 1 - y * y))
        dir = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize()
      }

      const cloud = planet.name === 'minecraft' ? buildBlockCloud(vapour) : buildCloud(vapour)
      cloud.position.copy(dir).multiplyScalar(ceiling)
      orient(dir, quat, theta)
      cloud.quaternion.copy(quat)
      sky.add(cloud)
    }

    scene.add(sky)
    const driftAxis = homeCloudAxis
      ? homeCloudAxis.clone()
      : new THREE.Vector3(random() - 0.5, 1, random() - 0.5).normalize()
    drifting.push({
      group: sky,
      axis: driftAxis,
      speed: CLOUD_DRIFT * (0.6 + random() * 0.8),
    })
  }

  const home = PLANETS.find((planet) => planet.name === 'start')
  if (home) addHomePokemon(scene, home, groundRadius, mixers, onInteractable)

  return {
    albums,
    trees,
    update(t: number) {
      const dt = Math.max(0, t - lastT)
      lastT = t
      for (const mixer of mixers) mixer.update(dt)
      for (const d of drifting) d.group.quaternion.setFromAxisAngle(d.axis, t * d.speed)
    },
  }
}
