import * as THREE from 'three'
import { PlanetSkin, terrainAt } from './texture'
import {
  VOXEL_BLOCK,
  VOXEL_DIRT,
  VOXEL_GRASS,
  VOXEL_SAND,
  VOXEL_SIDE_SHADE,
  VOXEL_SNOW,
  VOXEL_STONE,
  VOXEL_WATER_SHALLOW,
} from './tuning'

/**
 * A world built out of actual cubes.
 *
 * Every cube-sphere cell emits a flat top quad at its block height, plus a
 * vertical side quad for each neighbour that sits lower — one quad per block
 * layer, so the exposed rock reads as stacked blocks rather than one tall
 * wall. Faces between two equal-height cells are skipped entirely, which is
 * the same hidden-face culling a chunk mesher does.
 *
 * This replaces displacing a sphere and hoping it looked blocky. A displaced
 * sphere's "walls" are just very steep ramps, and the tops stay curved; here
 * the tops are genuinely flat and the walls are genuinely vertical.
 *
 * Colour lives in a vertex attribute rather than a texture: each face gets one
 * flat colour, chosen by what it is (grass, dirt, stone, sand, snow, water)
 * and dimmed if it faces sideways — Minecraft shades top faces brightest,
 * which is a good part of why its geometry reads so clearly.
 */

export interface BlockPlanetLike {
  radius: number
  relief: number
  noiseScale: number
  skin: PlanetSkin
  voxelGrid: number
}

/**
 * Which neighbouring cell each edge faces, given corners ordered
 * (u0,v0) (u1,v0) (u1,v1) (u0,v1).
 */
const EDGE_NEIGHBOUR = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]

const FACES = [
  { axis: 0, sign: 1 },
  { axis: 0, sign: -1 },
  { axis: 1, sign: 1 },
  { axis: 1, sign: -1 },
  { axis: 2, sign: 1 },
  { axis: 2, sign: -1 },
]

/**
 * Cube face parameters to a unit direction. Must match the component order in
 * `snapToCell`, or the mesh and the collision would describe different cells.
 */
function faceDir(axis: number, sign: number, u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  if (axis === 0) out.set(sign, u, v)
  else if (axis === 1) out.set(u, sign, v)
  else out.set(u, v, sign)
  return out.normalize()
}

/** Deterministic per-cell jitter, so flat colour doesn't read as plastic. */
function jitter(face: number, i: number, j: number): number {
  let h = Math.imul(face * 73856093 ^ i * 19349663 ^ j * 83492791, 2654435761)
  h = (h ^ (h >>> 15)) >>> 0
  // Wide enough that neighbouring blocks are individually readable across a
  // flat plateau. Too subtle and the whole thing melts into one smooth plate.
  return 1 + ((h / 4294967295) * 2 - 1) * 0.09
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _n = new THREE.Vector3()
// Kept separate from _n on purpose: quad() overwrites _n with its own cross
// product, so passing _n in as the winding hint made the test compare a vector
// against itself and never flip anything.
const _hint = new THREE.Vector3()

export function buildBlockGeometry(
  p: BlockPlanetLike,
  heightAt: (dir: THREE.Vector3) => number,
): THREE.BufferGeometry {
  const n = p.voxelGrid
  const positions: number[] = []
  const colors: number[] = []

  const grass = new THREE.Color(VOXEL_GRASS)
  const dirt = new THREE.Color(VOXEL_DIRT)
  const stone = new THREE.Color(VOXEL_STONE)
  const sand = new THREE.Color(VOXEL_SAND)
  const snow = new THREE.Color(VOXEL_SNOW)
  const water = new THREE.Color(VOXEL_WATER_SHALLOW)
  const shade = new THREE.Color()

  const corner = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]
  const centre = new THREE.Vector3()
  const edgeMid = new THREE.Vector3()
  const probe = new THREE.Vector3()

  /** Emit a quad, winding it so its normal points along `hint`. */
  function quad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    hint: THREE.Vector3,
    colour: THREE.Color,
    tint: number,
  ): void {
    _a.subVectors(b, a)
    _b.subVectors(c, a)
    _n.crossVectors(_a, _b)
    const flip = _n.dot(hint) < 0
    const q = flip ? [a, d, c, b] : [a, b, c, d]

    shade.copy(colour).multiplyScalar(tint)
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      positions.push(q[idx].x, q[idx].y, q[idx].z)
      colors.push(shade.r, shade.g, shade.b)
    }
  }

  for (let f = 0; f < FACES.length; f++) {
    const { axis, sign } = FACES[f]

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const u0 = -1 + (2 * i) / n
        const u1 = -1 + (2 * (i + 1)) / n
        const v0 = -1 + (2 * j) / n
        const v1 = -1 + (2 * (j + 1)) / n

        faceDir(axis, sign, u0, v0, corner[0])
        faceDir(axis, sign, u1, v0, corner[1])
        faceDir(axis, sign, u1, v1, corner[2])
        faceDir(axis, sign, u0, v1, corner[3])
        faceDir(axis, sign, -1 + (2 * (i + 0.5)) / n, -1 + (2 * (j + 0.5)) / n, centre)

        const top = heightAt(centre)
        const land = terrainAt(p.skin, p.noiseScale, centre.x, centre.y, centre.z)
        const height = (top - p.radius) / p.relief
        const tint = jitter(f, i, j)

        // Look at the four neighbours once: their heights decide which side
        // faces are exposed, and whether any of them is water decides whether
        // this is a beach.
        const nHeight: number[] = []
        const nWater: boolean[] = []
        for (let e = 0; e < 4; e++) {
          const ni = i + EDGE_NEIGHBOUR[e][0]
          const nj = j + EDGE_NEIGHBOUR[e][1]

          if (ni >= 0 && ni < n && nj >= 0 && nj < n) {
            // Same cube face: address the neighbour by index. Exact.
            faceDir(axis, sign, -1 + (2 * (ni + 0.5)) / n, -1 + (2 * (nj + 0.5)) / n, probe)
          } else {
            // Across a cube seam, where index arithmetic doesn't carry over.
            // Step through the shared edge instead. Cells shrink towards the
            // cube corners, so a fixed step can overshoot into the cell beyond
            // or fall short back into this one — taking the lower of two
            // distances means a wall is at worst too long, never missing.
            edgeMid.addVectors(corner[e], corner[(e + 1) % 4]).normalize()
            _hint.subVectors(edgeMid, centre)
            probe.copy(centre).addScaledVector(_hint, 1.2).normalize()
            const near = heightAt(probe)
            const nearWater = terrainAt(p.skin, p.noiseScale, probe.x, probe.y, probe.z) <= 0
            probe.copy(centre).addScaledVector(_hint, 1.7).normalize()
            nHeight.push(Math.min(near, heightAt(probe)))
            nWater.push(
              nearWater || terrainAt(p.skin, p.noiseScale, probe.x, probe.y, probe.z) <= 0,
            )
            continue
          }

          nHeight.push(heightAt(probe))
          nWater.push(terrainAt(p.skin, p.noiseScale, probe.x, probe.y, probe.z) <= 0)
        }

        // Sand because it touches water, not because it is low — the height
        // tiers are too coarse to carry a shoreline, but adjacency isn't.
        const isWater = land <= 0
        const beach = !isWater && nWater.some(Boolean)
        const surface = isWater ? water : height > 0.95 ? snow : beach ? sand : grass
        const flank = isWater ? stone : beach ? sand : dirt

        // Top face.
        _a.copy(corner[0]).multiplyScalar(top)
        _b.copy(corner[1]).multiplyScalar(top)
        const c2 = corner[2].clone().multiplyScalar(top)
        const c3 = corner[3].clone().multiplyScalar(top)
        quad(_a.clone(), _b.clone(), c2, c3, centre, surface, tint)

        // Side faces, one per exposed block layer, toward any lower neighbour.
        for (let e = 0; e < 4; e++) {
          const ca = corner[e]
          const cb = corner[(e + 1) % 4]
          const neighbour = nHeight[e]
          if (neighbour >= top - 1e-4) continue
          edgeMid.addVectors(ca, cb).normalize()

          const layers = Math.min(8, Math.round((top - neighbour) / VOXEL_BLOCK))
          for (let k = 0; k < layers; k++) {
            const hi = top - k * VOXEL_BLOCK
            // Sink the bottom layer a hair below the neighbour's top, so
            // floating-point disagreement can't leave a hairline crack along
            // the join. The overlap is buried and never seen.
            const lo = Math.max(neighbour - 0.02, hi - VOXEL_BLOCK)
            if (hi - lo < 1e-4) break
            // A side face is vertical, so its normal is tangential — pointing
            // from this cell across the shared edge. The radial direction is
            // perpendicular to it and useless as a hint.
            _hint.subVectors(edgeMid, centre)
            if (_hint.lengthSq() < 1e-12) _hint.copy(edgeMid)
            _hint.normalize()

            quad(
              ca.clone().multiplyScalar(lo),
              cb.clone().multiplyScalar(lo),
              cb.clone().multiplyScalar(hi),
              ca.clone().multiplyScalar(hi),
              _hint,
              k === 0 ? flank : stone,
              tint * VOXEL_SIDE_SHADE,
            )
          }
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  // Non-indexed, so every triangle gets its own normal: hard edges, no
  // smoothing across block corners.
  geometry.computeVertexNormals()
  return geometry
}
