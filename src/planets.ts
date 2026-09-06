import * as THREE from 'three'
import { buildBlockGeometry } from './blockWorld'
import { makeTerrainTexture, PlanetSkin, SHORE_SLOPE, snapToCell, terrainAt } from './texture'
import {
  SURFACE_GRAVITY,
  LEASH_GAP,
  LEASH_STRENGTH,
  NOISE_BASE,
  NOISE_SCALE,
  PLANET_GLOW,
  RELIEF_BASE,
  RELIEF_SCALE,
  SHORE_WIDTH,
  SWIRL_BANDS,
  SWIRL_TWIST,
  TERRAIN_TIERS,
  VOXEL_BLOCK,
  VOXEL_GRID,
  WATER_COLOR,
  WATER_ENV_INTENSITY,
  WATER_OPACITY,
  WATER_ROUGHNESS,
  WAVE_STRENGTH,
} from './tuning'

export interface Planet {
  name: string
  center: THREE.Vector3
  /** Sea level. Land rises above it by up to `relief`. */
  radius: number
  skin: PlanetSkin
  /** Height of the highest plateau above sea level. */
  relief: number
  /** Noise frequency, tuned per planet so islands stay a similar real size. */
  noiseScale: number
  /** Gravitational acceleration at the surface. Falls off as 1/d² beyond it. */
  surfaceGravity: number
  /** Height of the swimmable water shell above `radius`. 0 for a dry planet. */
  water: number
  /** Cube-sphere cells per face edge, or 0 for a smooth planet. */
  voxelGrid: number
}

interface PlanetOptions {
  /** Override the relief derived from radius. */
  relief?: number
  /** Override the noise frequency derived from radius. Lower = broader land. */
  noise?: number
  /**
   * Override surface gravity. Only worth doing on a very large planet: escape
   * velocity is sqrt(2 g R), so at the shared gravity a big world would be one
   * you could never jump off again.
   */
  gravity?: number
  /** Add a water shell this far above `radius`. */
  water?: number
  /** Build it out of blocks on a cube-sphere grid of this resolution. */
  voxelGrid?: number
}

function planet(
  name: string,
  center: [number, number, number],
  radius: number,
  skin: PlanetSkin,
  options: PlanetOptions = {},
): Planet {
  return {
    name,
    center: new THREE.Vector3(...center),
    radius,
    skin,
    relief: options.relief ?? RELIEF_SCALE * radius + RELIEF_BASE,
    noiseScale: options.noise ?? NOISE_SCALE * radius + NOISE_BASE,
    surfaceGravity: options.gravity ?? SURFACE_GRAVITY,
    water: options.water ?? 0,
    voxelGrid: options.voxelGrid ?? 0,
  }
}

const _cell = new THREE.Vector3()
const MINECRAFT_BLOCK_CARVE_DIR = new THREE.Vector3(-0.25, 0.9, 0.36).normalize()
const MINECRAFT_BLOCK_CARVE_CELL = snapToCell(
  MINECRAFT_BLOCK_CARVE_DIR.x,
  MINECRAFT_BLOCK_CARVE_DIR.y,
  MINECRAFT_BLOCK_CARVE_DIR.z,
  VOXEL_GRID,
  new THREE.Vector3(),
).clone()

/**
 * Distance from the planet's core to the walkable surface in direction `dir`
 * (which must be a unit vector). Over the seabed this is just the radius; over
 * land it steps up onto the plateaus.
 *
 * This is what keeps collision honest now that the surface isn't a plain
 * sphere — still one function call, still exact, still no raycasts.
 */
export function groundRadius(p: Planet, dir: THREE.Vector3): number {
  if (p.voxelGrid > 0) {
    // One height per cell, snapped to whole blocks. The mesh is built from the
    // very same call, so the top you can see is the top you stand on.
    snapToCell(dir.x, dir.y, dir.z, p.voxelGrid, _cell)
    const h = p.relief * terrainAt(p.skin, p.noiseScale, _cell.x, _cell.y, _cell.z)
    let blocks = Math.round(h / VOXEL_BLOCK)

    // Remove one voxel cell next to the chest to clear that specific terrain block.
    if (p.name === 'minecraft' && _cell.dot(MINECRAFT_BLOCK_CARVE_CELL) > 0.99999) {
      blocks = Math.max(0, blocks - 1)
    }

    return p.radius + blocks * VOXEL_BLOCK
  }
  return p.radius + p.relief * terrainAt(p.skin, p.noiseScale, dir.x, dir.y, dir.z)
}

/** Radius of the water surface. Equals `radius` on a dry planet. */
export function waterRadius(p: Planet): number {
  return p.radius + p.water
}

/**
 * A loose ring of four, tilted off the horizontal, plus the Hoenn sitting
 * above the ring. The spacing is tuned so the worlds feel separated, while a
 * held jump still carries you between the nearby neighbours.
 *
 * Each world gets its own land/sea palette and its own noise seed, so they
 * read as five places rather than five recolours.
 */
export const PLANETS: Planet[] = [
  planet('start', [24, 0, 0], 8, {
    land: 0x8fd8a4,
    ocean: 0x46a8d8,
    seaLevel: 0.545,
    seed: 1207,
    whitePatch: { dir: [0.56, 0.38, 0.74], extent: 0.24 },
  }),
  planet('arrakis', [0, 5, 24], 5, {
    land: 0xe8d2a6,
    ocean: 0xcdb58a,
    seaLevel: 0.56,
    seed: 3391,
  }),
  planet('freljord', [-24, -3, 0], 4, {
    land: 0xe6f4ff,
    ocean: 0xbfdcff,
    seaLevel: 0.565,
    seed: 5087,
  }),
  planet('silly', [0, -5, -24], 3, {
    land: 0xdcc6ff,
    ocean: 0x8f7fd4,
    seaLevel: 0.55,
    seed: 7723,
  }),
  // The water world. Its "ocean" colour is a sandy seabed, because here the
  // water is a real transparent shell above it rather than paint. Relief is
  // overridden well above the water line so the plateaus break the surface as
  // islands instead of drowning.
  planet(
    'hoenn',
    [0, 23, 3],
    6,
    { land: 0x86d69a, ocean: 0xdccba4, seaLevel: 0.575, seed: 9161 },
    { relief: 2.2, water: 1.5 },
  ),
  // The big one, with a house on it. Large enough that the horizon is far
  // away and the ground reads as almost flat underfoot.
  // Set well apart from the rest, out past the silly planet — that is the one
  // world close enough to jump from, so reaching the home world means crossing the
  // ring first. Small enough now to use the shared gravity: the override it
  // needed at radius 20 was only there because escape velocity would have been
  // 28 against a jump of 14, trapping you on it.
  planet(
    'home',
    [0, -8, -57],
    9,
    {
      land: 0x9ad978,
      // A seabed, not a painted sea: the water here is a real shell above it.
      ocean: 0xdccba4,
      seaLevel: 0.47,
      seed: 6301,
      // One island, flat on top and wide enough to stand the house on with
      // room to walk round it.
      island: { dir: [0.42, 0.28, 0.86], extent: 0.8 },
      
    },
    // Relief is measured from the seabed, so with a water shell the island's
    // *visible* height is relief - water. That difference is kept at 0.2, as
    // flat above the waterline as it was when the planet was dry; the rest of
    // the mesa is underwater, making the sea deep enough to float in. Below
    // the 1.04 float equilibrium you scrape along the bottom instead.
    { relief: 1.4, noise: 2.0, water: 1.2 },
  ),
  // A painted sphere — light blue, pink and beige wound together. No land,
  // no sea, no relief: the swirl is the whole surface.
  planet(
    'lover',
    [-15, 13, 15],
    6,
    {
      land: 0xf5aecb,
      ocean: 0x9ed8f2,
      seaLevel: 0.3,
      seed: 1989,
      swirl: [0x7ec6ec, 0xf28cb4, 0xf0dcb8],
    },
    { relief: 0 },
  ),
  // The block world. Colour comes from which way a face points rather than
  // from a palette ramp: anything pointing outward is a top, anything pointing
  // sideways is the exposed side of a block. That one test is what turns a
  // stepped sphere into grass-on-dirt.
  planet(
    'minecraft',
    [4, -22, 2],
    5.5,
    { land: 0x6fb03f, ocean: 0x2a5fa8, seaLevel: 0.5, seed: 4441 },
    { relief: 2.0, voxelGrid: VOXEL_GRID },
  ),
]

export const HOME = PLANETS[0]

/**
 * The planet whose *surface* is closest. Dominant-body gravity, not a sum of
 * fields: summing produces dead zones where forces cancel and makes standing
 * on a surface wobble.
 */
export function nearestPlanet(pos: THREE.Vector3): Planet {
  let best = PLANETS[0]
  let bestDist = Infinity
  for (const p of PLANETS) {
    const d = pos.distanceTo(p.center) - waterRadius(p)
    if (d < bestDist) {
      bestDist = d
      best = p
    }
  }
  return best
}

/** Unit vector from the planet's core out through `pos`. This is "up". */
export function upFrom(pos: THREE.Vector3, p: Planet, out: THREE.Vector3): THREE.Vector3 {
  return out.subVectors(pos, p.center).normalize()
}

/** Gravity plus the leash, as an acceleration vector. */
export function gravityAt(pos: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const p = nearestPlanet(pos)
  out.subVectors(p.center, pos)
  const d = Math.max(out.length(), 0.001)
  out.multiplyScalar(1 / d)

  let accel = p.surfaceGravity * (p.radius / d) ** 2

  // Drifted too far from the nearest surface: add a spring toward it.
  // Inescapable at any speed, which is what guarantees a missed jump always
  // comes back down somewhere.
  const above = d - waterRadius(p)
  if (above > LEASH_GAP) accel += LEASH_STRENGTH * (above - LEASH_GAP)

  return out.multiplyScalar(accel)
}

/**
 * Flat colour bands, chosen per-pixel from the interpolated height field.
 *
 * Quantising in the shader rather than in the texture is the whole point: the
 * data can stay at a modest resolution and the band edges are still one pixel
 * wide at any magnification. Bake the colours into the texture instead and you
 * see texels, which is exactly what looked pixelated before.
 */
function shadeAsBands(material: THREE.MeshStandardMaterial, skin: PlanetSkin): void {
  const land = new THREE.Color(skin.land)
  const ocean = new THREE.Color(skin.ocean)
  const white = new THREE.Color(0xffffff)

  const uniforms = {
    uDeep: { value: ocean.clone().multiplyScalar(0.85) },
    uShallow: { value: ocean.clone().lerp(land, 0.34) },
    uSand: { value: land.clone().lerp(new THREE.Color(0xfff0cf), 0.6) },
    uBandLo: { value: land.clone() },
    uBandHi: { value: land.clone().lerp(white, 0.26) },
    uTiers: { value: TERRAIN_TIERS },
    uShoreWidth: { value: SHORE_WIDTH },
    uShoreSlope: { value: SHORE_SLOPE },
  }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSand;
uniform vec3 uBandLo;
uniform vec3 uBandHi;
uniform float uTiers;
uniform float uShoreWidth;
uniform float uShoreSlope;
vec3 gBandColor;
void main() {`,
      )
      // `map` holds terrain data, not colour, so replace how it gets applied.
      .replace(
        '#include <map_fragment>',
        `{
  vec2 terrain = texture2D( map, vMapUv ).rg;
  float snow = texture2D( map, vMapUv ).b;
  vec3 banded;
  if ( terrain.r <= 0.5 ) {
    float depth = ( 0.5 - terrain.r ) / uShoreSlope;
    banded = mix( uShallow, uDeep, step( 0.07, depth ) );
  } else if ( snow > 0.5 ) {
    banded = vec3( 1.0 );
  } else if ( terrain.g < uShoreWidth ) {
    banded = uSand;
  } else {
    float tier = min( floor( terrain.g * uTiers ), uTiers - 1.0 );
    float amount = uTiers > 1.0 ? tier / ( uTiers - 1.0 ) : 0.0;
    banded = mix( uBandLo, uBandHi, amount );
  }
  gBandColor = banded;
  diffuseColor.rgb *= banded;
}`,
      )
      // Tint the night-side self-illumination to match, rather than glowing white.
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= gBandColor;')
  }
}

/**
 * A painted sphere: three colours arranged as broad atmospheric bands.
 *
 * Nothing here touches the terrain path — there is no heightfield and no data
 * texture. The band is computed straight from the object-space direction, so
 * it stays smooth at any distance and costs no memory.
 */
function shadeAsSwirl(material: THREE.MeshStandardMaterial, colours: [number, number, number]): void {
  // The bands stay mostly latitudinal, with only a small wobble for motion.
  const axis = new THREE.Vector3(0.32, 0.8, -0.38).normalize()
  const ref1 = new THREE.Vector3(0, 1, 0).cross(axis)
  if (ref1.lengthSq() < 1e-6) ref1.set(1, 0, 0)
  ref1.normalize()
  const ref2 = new THREE.Vector3().crossVectors(axis, ref1).normalize()

  const uniforms = {
    uAxis: { value: axis },
    uRef1: { value: ref1 },
    uRef2: { value: ref2 },
    uColA: { value: new THREE.Color(colours[0]) },
    uColB: { value: new THREE.Color(colours[1]) },
    uColC: { value: new THREE.Color(colours[2]) },
    uTwist: { value: SWIRL_TWIST },
    uBands: { value: SWIRL_BANDS },
    uWarpA: { value: new THREE.Vector3(1.9, 0.7, -1.2) },
    uWarpB: { value: new THREE.Vector3(-0.8, 1.5, 2.1) },
  }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vSwirlPos;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSwirlPos = position;')

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying vec3 vSwirlPos;
uniform vec3 uAxis;
uniform vec3 uRef1;
uniform vec3 uRef2;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform vec3 uWarpA;
uniform vec3 uWarpB;
uniform float uTwist;
uniform float uBands;
vec3 gSwirl;
void main() {`,
      )
      // No map on this planet, so the chunk is empty — we put the colour here.
      .replace(
        '#include <map_fragment>',
        `{
  vec3 p = normalize( vSwirlPos );
  float lat = asin( clamp( dot( p, uAxis ), -1.0, 1.0 ) );
  float band = lat * ( uBands * 0.5 ) + 0.5 * 3.14159265;
  // Two long waves gently disturb the bands so the planet feels gaseous, not striped.
  float warp = sin( dot( p, uWarpA ) * 2.2 ) * 0.09 + sin( dot( p, uWarpB ) * 3.1 ) * 0.05;
  float w = fract( band * 0.15915494 + warp );
  vec3 tint;
  if ( w < 0.3333 ) tint = mix( uColA, uColB, w * 3.0 );
  else if ( w < 0.6667 ) tint = mix( uColB, uColC, ( w - 0.3333 ) * 3.0 );
  else tint = mix( uColC, uColA, ( w - 0.6667 ) * 3.0 );
  gSwirl = tint;
  diffuseColor.rgb *= tint;
}`,
      )
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= gSwirl;')
  }
}

export function buildPlanets(scene: THREE.Scene): void {
  const dir = new THREE.Vector3()

  for (const p of PLANETS) {
    let mesh: THREE.Mesh

    if (p.voxelGrid > 0) {
      // Real cubes: flat tops, vertical sides, hidden faces culled, colour in
      // a vertex attribute. No terrain texture and no shader patching needed.
      mesh = new THREE.Mesh(
        buildBlockGeometry(p, (d) => groundRadius(p, d)),
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.95,
          metalness: 0,
          flatShading: true,
        }),
      )
    } else if (p.skin.swirl) {
      // A perfect sphere. relief is 0, so the displacement below would be a
      // no-op anyway; skipping it keeps the geometry exact.
      const material = new THREE.MeshStandardMaterial({
        roughness: 0.85,
        metalness: 0,
        emissive: 0xffffff,
        emissiveIntensity: PLANET_GLOW,
      })
      shadeAsSwirl(material, p.skin.swirl)
      mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 128, 80), material)
    } else {
      const texture = makeTerrainTexture(p.skin, p.noiseScale)

      // Push every vertex out to the terrain height, so the plateaus are real
      // geometry with real silhouettes rather than a painted-on illusion.
      const geometry = new THREE.SphereGeometry(p.radius, 160, 96)
      const position = geometry.attributes.position
      for (let i = 0; i < position.count; i++) {
        dir.fromBufferAttribute(position, i).normalize()
        const r = groundRadius(p, dir)
        position.setXYZ(i, dir.x * r, dir.y * r, dir.z * r)
      }
      position.needsUpdate = true
      geometry.computeVertexNormals()

      const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.92,
        metalness: 0,
        // A touch of self-illumination, so the night side stays a dim version
        // of the planet rather than a black silhouette.
        emissiveMap: texture,
        emissive: 0xffffff,
        emissiveIntensity: PLANET_GLOW,
      })
      shadeAsBands(material, p.skin)
      mesh = new THREE.Mesh(geometry, material)
    }

    mesh.position.copy(p.center)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = p.name
    scene.add(mesh)
  }
}

/**
 * Ripples, as a sum of travelling plane waves evaluated in the sphere's own
 * object space.
 *
 * Deliberately not a scrolling normal map. A normal map needs UVs, and a
 * sphere's equirectangular UVs collapse to a point at each pole — which showed
 * up as hard radial streaks converging on the pole. Sampling position in 3D
 * has no UVs, so no seam and no pinch, and a time uniform makes the waves
 * actually travel instead of sliding a texture sideways.
 *
 * The gradient of the wave height gives the surface slope analytically; we
 * project it onto the tangent plane and tilt the normal by it.
 */
function shadeAsWater(material: THREE.MeshStandardMaterial): { value: number } {
  const time = { value: 0 }

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.uniforms.uWaveStrength = { value: WAVE_STRENGTH }

    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vWavePos;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWavePos = position;')

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying vec3 vWavePos;
uniform float uTime;
uniform float uWaveStrength;
uniform mat3 normalMatrix;
void main() {`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
  vec3 p = vWavePos;
  vec3 k0 = vec3(  2.10, 0.80,  0.40 );
  vec3 k1 = vec3( -0.90, 1.90,  1.10 );
  vec3 k2 = vec3(  1.30, -0.60, 2.40 );
  vec3 k3 = vec3(  3.70, 2.10, -1.50 );
  vec3 grad = vec3( 0.0 );
  grad += k0 * ( cos( dot( k0, p ) + uTime * 1.05 ) * 0.34 );
  grad += k1 * ( cos( dot( k1, p ) + uTime * 0.87 ) * 0.26 );
  grad += k2 * ( cos( dot( k2, p ) + uTime * 1.31 ) * 0.18 );
  grad += k3 * ( cos( dot( k3, p ) - uTime * 0.72 ) * 0.07 );
  vec3 radial = normalize( p );
  grad -= radial * dot( grad, radial );
  normal = normalize( normalMatrix * normalize( radial - grad * uWaveStrength ) );
}`,
      )
  }

  return time
}

/**
 * The water shell. Returns a setter for the wave clock, or null if no planet
 * has water.
 *
 * Two meshes rather than one double-sided mesh: a transparent sphere has to be
 * drawn back face first, otherwise the far hemisphere paints over the near one
 * and the surface looks inside out. It also means the water still renders
 * correctly from underneath, while you are swimming.
 */
export function buildWater(
  scene: THREE.Scene,
  environment: THREE.Texture | null,
): ((t: number) => void) | null {
  const withWater = PLANETS.filter((p) => p.water > 0)
  if (withWater.length === 0) return null

  const clocks: { value: number }[] = []

  for (const p of withWater) {
    const geometry = new THREE.SphereGeometry(waterRadius(p), 160, 96)

    for (const side of [THREE.BackSide, THREE.FrontSide]) {
      const material = new THREE.MeshStandardMaterial({
        color: WATER_COLOR,
        transparent: true,
        opacity: WATER_OPACITY,
        roughness: WATER_ROUGHNESS,
        metalness: 0.05,
        envMap: environment,
        envMapIntensity: WATER_ENV_INTENSITY,
        side,
        // Transparent surfaces must not write depth, or they occlude each other.
        depthWrite: false,
      })
      clocks.push(shadeAsWater(material))

      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.copy(p.center)
      mesh.renderOrder = side === THREE.BackSide ? 1 : 2
      mesh.name = `${p.name}-water`
      scene.add(mesh)
    }
  }

  return (t: number) => {
    for (const clock of clocks) clock.value = t
  }
}

export function buildStarfield(scene: THREE.Scene): void {
  const count = 2200
  const positions = new Float32Array(count * 3)
  const v = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    // Uniform on a sphere shell, well outside the play area.
    v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
    if (v.lengthSq() < 0.0001) v.set(0, 1, 0)
    v.normalize().multiplyScalar(160 + Math.random() * 60)
    v.toArray(positions, i * 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xfff2dc, size: 1.7, sizeAttenuation: false }),
  )
  stars.name = 'starfield'
  scene.add(stars)
}
