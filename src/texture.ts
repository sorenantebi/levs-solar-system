import * as THREE from 'three'
import { COAST_STEP, SHORE_WIDTH, TERRAIN_TIERS } from './tuning'

/**
 * Procedural terrain, generated at startup. No image assets, no dependencies.
 *
 * The noise is sampled in 3D on the sphere's surface direction rather than in
 * 2D across the image. Sampling in 2D would stretch the continents into smears
 * at the poles and need a seam fix at the wrap; sampling the direction vector
 * has neither problem, because the sphere is the actual domain.
 *
 * The same height function feeds three things — the shading, the displaced
 * geometry, and the player's ground collision — so what you see, what you walk
 * on, and what's painted can never disagree.
 *
 * What ships to the GPU is *data*, not colour: red is a signed sea/land field
 * with 0.5 as the waterline, green is the position within the land band. The
 * shader interpolates those smoothly and only then quantises into flat colour
 * bands, which is what keeps the coastlines and terraces crisp however close
 * the camera gets. Baking the colours into the texture instead is what made it
 * look pixelated.
 */

const DATA_W = 768
const DATA_H = 384
const OCTAVES = 2 // few octaves: big simple landmasses rather than fussy detail
const LAND_RANGE = 0.24 // how far above sea level the noise realistically climbs

/** Encoding slope of the sea/land field. Must match SHORE_SLOPE in the shader. */
export const SHORE_SLOPE = 2.0

function hash3(x: number, y: number, z: number, seed: number): number {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(z, 1274126177) ^
    Math.imul(seed, 1013904223)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/** Value noise with smoothstep interpolation. */
function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const fx = x - ix
  const fy = y - iy
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const uz = fz * fz * (3 - 2 * fz)

  const c000 = hash3(ix, iy, iz, seed)
  const c100 = hash3(ix + 1, iy, iz, seed)
  const c010 = hash3(ix, iy + 1, iz, seed)
  const c110 = hash3(ix + 1, iy + 1, iz, seed)
  const c001 = hash3(ix, iy, iz + 1, seed)
  const c101 = hash3(ix + 1, iy, iz + 1, seed)
  const c011 = hash3(ix, iy + 1, iz + 1, seed)
  const c111 = hash3(ix + 1, iy + 1, iz + 1, seed)

  return lerp(
    lerp(lerp(c000, c100, ux), lerp(c010, c110, ux), uy),
    lerp(lerp(c001, c101, ux), lerp(c011, c111, ux), uy),
    uz,
  )
}

/** Fractal noise, normalised to roughly 0..1. */
function fbm(x: number, y: number, z: number, seed: number): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let o = 0; o < OCTAVES; o++) {
    sum += noise3(x * freq, y * freq, z * freq, seed + o * 101) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

export interface PlanetSkin {
  land: number
  ocean: number
  /** Higher means more water. ~0.5 is half-and-half. */
  seaLevel: number
  seed: number
  /**
   * Exactly one island, instead of whatever the noise happens to produce.
   *
   * `extent` is its angular radius in radians, so its real size scales with
   * the planet. The top is flat on purpose — thresholded noise can't promise
   * a level area big enough to put a building on.
   */
  island?: { dir: [number, number, number]; extent: number }
}

/** Fraction of the island's radius given over to the sloped shore. */
const ISLAND_SHORE = 0.18

export interface TerrainSample {
  /** Height above sea level, 0..1 of the planet's relief. */
  height: number
  /** Signed sea/land field for the shader; 0.5 is the waterline. */
  field: number
  /** Position within the land band, for picking a colour tier. */
  band: number
}

/**
 * The land profile: a short steep climb out of the water onto a plateau, then
 * flat tiers above that. Returns 0 at the waterline, 1 at the highest ground.
 *
 * The shore step is the important part — without it the outermost tier sits at
 * height zero, flush with the sea, and the islands read as noise rather than
 * as raised land.
 *
 * Deliberately continuous rather than a hard staircase: a discontinuous ground
 * height would teleport the player up and down at every coastline. The ramps
 * are narrow enough to read as cliffs but real enough to walk up.
 */
function landProfile(t: number): number {
  const shore = smoothstep(0, SHORE_WIDTH, t) * COAST_STEP
  const s = t * TERRAIN_TIERS
  const i = Math.floor(s)
  const tier = Math.min(1, (i + smoothstep(0.72, 1, s - i)) / TERRAIN_TIERS)
  return Math.min(1, shore + tier * (1 - COAST_STEP))
}

/**
 * The one place terrain is decided.
 *
 * Both the collision height and the colours the shader paints come from here,
 * so the two cannot describe different worlds — a class of bug this has been
 * bitten by before.
 */
export function terrainSample(
  skin: PlanetSkin,
  scale: number,
  x: number,
  y: number,
  z: number,
): TerrainSample {
  if (skin.island) {
    const [ix, iy, iz] = skin.island.dir
    const len = Math.hypot(ix, iy, iz) || 1
    const cos = Math.max(-1, Math.min(1, (x * ix + y * iy + z * iz) / len))
    const angle = Math.acos(cos)

    // Wobble the coastline so the island isn't a drawn circle.
    const wobble = fbm(x * 2.6, y * 2.6, z * 2.6, skin.seed) - 0.5
    const edge = skin.island.extent * (1 + wobble * 0.34)
    const ramp = skin.island.extent * ISLAND_SHORE

    const t = (edge - angle) / ramp
    if (t <= 0) {
      return { height: 0, field: clamp01(0.5 + (edge - angle) * 1.6), band: 0 }
    }
    const rise = smoothstep(0, 1, Math.min(1, t))
    return { height: rise, field: clamp01(0.5 + (edge - angle) * 1.6), band: Math.min(1, t) }
  }

  const h = fbm(x * scale, y * scale, z * scale, skin.seed)
  const band = clamp01((h - skin.seaLevel) / LAND_RANGE)
  return {
    height: h <= skin.seaLevel ? 0 : landProfile(band),
    field: clamp01(0.5 + (h - skin.seaLevel) * SHORE_SLOPE),
    band,
  }
}

/**
 * Height above sea level as a 0..1 fraction of the planet's relief.
 * Returns 0 over water. `dir` must be a unit vector.
 */
export function terrainAt(
  skin: PlanetSkin,
  scale: number,
  x: number,
  y: number,
  z: number,
): number {
  return terrainSample(skin, scale, x, y, z).height
}

/** Snap a value in -1..1 to the centre of one of `n` bands. */
function quantise(t: number, n: number): number {
  const i = Math.min(n - 1, Math.max(0, Math.floor(((t + 1) / 2) * n)))
  return ((i + 0.5) / n) * 2 - 1
}

/**
 * Snap a direction to the centre of its cube-sphere cell.
 *
 * A cube-sphere grid is used rather than latitude/longitude because lat/long
 * cells collapse to slivers at the poles — the blocks would be lozenges up
 * there. Projecting a cube's uniform grid keeps every cell roughly square.
 *
 * Both the mesh and the player's collision call this, which is what stops you
 * walking through a cliff face that is drawn in one place and solid in another.
 */
export function snapToCell(
  x: number,
  y: number,
  z: number,
  grid: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  const az = Math.abs(z)

  if (ax >= ay && ax >= az && ax > 1e-6) {
    out.set(Math.sign(x), quantise(y / ax, grid), quantise(z / ax, grid))
  } else if (ay >= az && ay > 1e-6) {
    out.set(quantise(x / ay, grid), Math.sign(y), quantise(z / ay, grid))
  } else if (az > 1e-6) {
    out.set(quantise(x / az, grid), quantise(y / az, grid), Math.sign(z))
  } else {
    out.set(0, 1, 0)
  }
  return out.normalize()
}

/**
 * The terrain data the shader reads. Red: signed sea/land field, 0.5 is the
 * waterline. Green: position within the land band, for picking a colour tier.
 *
 * Pass `grid` to sample per cube-sphere cell instead of per texel, so the
 * painted colours land on exactly the same blocks as the geometry.
 */
export function makeTerrainTexture(
  skin: PlanetSkin,
  scale: number,
  grid = 0,
): THREE.DataTexture {
  const cell = new THREE.Vector3()
  const data = new Uint8Array(DATA_W * DATA_H * 4)

  // Exactly the convention THREE.SphereGeometry uses, so the shading lands on
  // the geometry it describes:
  //   uv = ( u, 1 - v ),  theta = v * PI,  phi = u * 2PI
  //   vertex = ( -cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta) )
  // Note the minus on x, and that DataTexture does NOT flip Y the way
  // CanvasTexture does — getting either wrong mirrors the whole planet, which
  // is invisible on smooth noise and glaring on blocks.
  for (let py = 0; py < DATA_H; py++) {
    const theta = (1 - (py + 0.5) / DATA_H) * Math.PI
    const sinT = Math.sin(theta)
    const cosT = Math.cos(theta)

    for (let px = 0; px < DATA_W; px++) {
      const phi = ((px + 0.5) / DATA_W) * Math.PI * 2
      let dx = -Math.cos(phi) * sinT
      let dy = cosT
      let dz = Math.sin(phi) * sinT
      if (grid > 0) {
        snapToCell(dx, dy, dz, grid, cell)
        dx = cell.x
        dy = cell.y
        dz = cell.z
      }
      const sample = terrainSample(skin, scale, dx, dy, dz)

      const i = (py * DATA_W + px) * 4
      data[i] = sample.field * 255
      data[i + 1] = sample.band * 255
      data[i + 2] = 0
      data[i + 3] = 255
    }
  }

  const texture = new THREE.DataTexture(data, DATA_W, DATA_H, THREE.RGBAFormat)
  // No colour space conversion: this is a height field, not an image.
  texture.wrapS = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}
