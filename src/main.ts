import * as THREE from 'three'
import { FollowCamera } from './followCamera'
import { Input } from './input'
import { Hud } from './hud'
import { findBuildSite, House } from './house'
import { animateCollectibles, buildCollectibles, tryCollect } from './items'
import { buildPlanets, buildStarfield, buildWater, groundRadius, PLANETS } from './planets'
import { Player, PlayerState } from './player'
import type { Planet } from './planets'
import {
  AMBIENT_GROUND,
  AMBIENT_INTENSITY,
  AMBIENT_SKY,
  BACKGROUND,
  FILL_COLOR,
  FILL_INTENSITY,
  KEY_COLOR,
  KEY_INTENSITY,
  LIGHT_DISTANCE,
  MAX_PIXEL_RATIO,
  SHADOW_MAP_SIZE,
  SHADOW_MARGIN,
  CAM_DISTANCE,
  CAM_DISTANCE_INDOOR,
  WAVE_SPEED,
} from './tuning'

const SAVE_KEY = 'sphere-game:player'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(BACKGROUND)

buildStarfield(scene)
buildPlanets(scene)

// Three-part lighting, all aimed at "cosy": a warm key with soft shadows, a
// dim warm bounce from behind so nothing falls to black, and a bright ambient
// wrap. The old setup had a near-black ground tone, which is what made the
// undersides read as dead.
const key = new THREE.DirectionalLight(KEY_COLOR, KEY_INTENSITY)
key.castShadow = true
key.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
key.shadow.bias = -0.0005
key.shadow.normalBias = 0.06
key.shadow.camera.near = 1
key.shadow.camera.far = LIGHT_DISTANCE * 2.2
scene.add(key)
// The light's target has to be in the scene for its matrix to update.
scene.add(key.target)
const LIGHT_DIR = new THREE.Vector3(0.45, 0.8, 0.35).normalize()

const fill = new THREE.DirectionalLight(FILL_COLOR, FILL_INTENSITY)
fill.position.set(-0.6, -0.35, -0.55).normalize().multiplyScalar(80)
scene.add(fill)

scene.add(new THREE.HemisphereLight(AMBIENT_SKY, AMBIENT_GROUND, AMBIENT_INTENSITY))

// Capture the lit scene into an environment map and hand it to the water, so
// the surface reflects the actual planets and starfield. Reflections are most
// of what makes water read as water, and this needs no HDRI asset.
//
// Given only to the water material, not to scene.environment: applying it
// globally would relight every planet and undo the mood tuning.
const pmrem = new THREE.PMREMGenerator(renderer)
const envMap = pmrem.fromScene(scene, 0.02).texture
pmrem.dispose()
const setWaveTime = buildWater(scene, envMap)

const items = buildCollectibles(scene, groundRadius)
const hud = new Hud()

// The house, and the one keepsake you have to go indoors to find.
const meadow = PLANETS.find((p) => p.name === 'meadow')
const house = meadow ? new House(meadow, findBuildSite(meadow, groundRadius), groundRadius) : null
if (house) {
  scene.add(house.group)
  const key = items.find((i) => i.planet.name === 'meadow')
  if (key) {
    key.position.copy(house.interior)
    key.object.position.copy(house.interior)
    // Match the building's frame, or it stands at the angle of wherever the
    // placement scan happened to land rather than upright on the floor.
    key.object.quaternion.copy(house.group.quaternion)
  }
}

const player = new Player()
player.collider = house
scene.add(player.object)

const cam = new FollowCamera(innerWidth / innerHeight)
const input = new Input(renderer.domElement)

// Dev hook so a headless browser can read the simulation out of the page —
// screenshots show what it looks like, this says where you actually are.
;(window as unknown as Record<string, unknown>).__sphere = {
  state: () => ({
    planet: player.planet.name,
    grounded: player.grounded,
    swimming: player.swimming,
    indoors: house?.contains(player.pos) ?? false,
    lag: +player.pos.distanceTo(player.visual).toFixed(3),
    found: items.filter((i) => i.collected).map((i) => i.planet.name),
    items: items.map((i) => ({
      planet: i.planet.name,
      name: i.name,
      collected: i.collected,
      pos: i.position.toArray().map((n) => +n.toFixed(2)),
    })),
    altitude: +(player.pos.distanceTo(player.planet.center) - player.planet.radius).toFixed(2),
    speed: +player.vel.length().toFixed(2),
    pos: player.pos.toArray().map((n) => +n.toFixed(1)),
  }),
}

// Restore across hot reloads so tweaking a number in tuning.ts doesn't cost
// you a walk back to wherever you were testing.
const saved = sessionStorage.getItem(SAVE_KEY)
if (saved) {
  try {
    const state = JSON.parse(saved) as PlayerState & { collected?: string[] }
    player.restore(state)
    for (const name of state.collected ?? []) {
      const item = items.find((i) => i.planet.name === name)
      if (item) {
        item.collected = true
        item.object.visible = false
      }
    }
  } catch {
    sessionStorage.removeItem(SAVE_KEY)
  }
}
cam.up.copy(player.up)
cam.forward.copy(player.facing)
cam.transport(player.up, true, 1)
cam.follow(player.visual, 0, true)

function save(): void {
  sessionStorage.setItem(
    SAVE_KEY,
    JSON.stringify({
      ...player.serialize(),
      collected: items.filter((i) => i.collected).map((i) => i.planet.name),
    }),
  )
}
addEventListener('visibilitychange', save)
addEventListener('pagehide', save)
let saveTimer = 0

const controlsHint = document.getElementById('hud')

// Press P for a live readout. I can only measure this machine's software
// renderer; these are the numbers from yours.
const perf = document.createElement('div')
perf.id = 'perf'
document.body.append(perf)
addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') perf.classList.toggle('on')
})
let perfTimer = 0
let perfFrames = 0
let fps = 0
let elapsed = 0

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight)
  cam.resize(innerWidth / innerHeight)
})

const _camTarget = new THREE.Vector3()
const _camDir = new THREE.Vector3()
let shadowPlanet: Planet | null = null
const clock = new THREE.Clock()

function frame(): void {
  // Clamped so a backgrounded tab doesn't resume with a giant integration step.
  const dt = Math.min(clock.getDelta(), 1 / 30)
  elapsed += dt

  input.sample()
  cam.look(input.lookX, input.lookY)
  if (input.resetPressed) player.reset()

  setWaveTime?.(elapsed * WAVE_SPEED)
  animateCollectibles(items, elapsed)

  // Swimming counts as settled, not airborne. Freezing the camera's up-vector
  // is meant to stop the world spinning during a jump — but if it stays frozen
  // while you float, the camera keeps the up-vector of the planet you left and
  // the camera-relative controls come out rotated.
  cam.transport(player.up, player.grounded || player.swimming, dt)
  player.update(dt, input, cam.forward, cam.up)

  // Indoors the normal boom length would put the camera out in the garden, so
  // pull it in and take the roof off.
  // Park the shadow camera over whichever planet you're on. A frustum big
  // enough for the whole system wastes almost all its resolution on empty
  // space between planets.
  if (shadowPlanet !== player.planet) {
    shadowPlanet = player.planet
    const extent = shadowPlanet.radius + shadowPlanet.water + SHADOW_MARGIN
    key.shadow.camera.left = -extent
    key.shadow.camera.right = extent
    key.shadow.camera.top = extent
    key.shadow.camera.bottom = -extent
    key.shadow.camera.updateProjectionMatrix()
    key.target.position.copy(shadowPlanet.center)
    key.position.copy(shadowPlanet.center).addScaledVector(LIGHT_DIR, LIGHT_DISTANCE)
  }

  const indoors = house?.contains(player.pos) ?? false
  if (house) house.roof.visible = !indoors
  let boom = indoors ? CAM_DISTANCE_INDOOR : CAM_DISTANCE
  if (indoors && house) {
    boom = house.maxBoom(
      cam.targetPoint(player.visual, _camTarget),
      cam.boomDirection(_camDir),
      boom,
    )
  }
  cam.setDistance(boom, dt)
  cam.follow(player.visual, dt)

  const picked = tryCollect(items, player.pos, player.planet)
  if (picked) hud.announce(picked)
  hud.update(player.planet.name, items, dt)

  input.endFrame()

  saveTimer += dt
  if (saveTimer > 0.4) {
    saveTimer = 0
    save()
  }

  perfFrames++
  perfTimer += dt
  if (perfTimer >= 0.5) {
    fps = perfFrames / perfTimer
    perfFrames = 0
    perfTimer = 0
  }
  if (perf.classList.contains('on')) {
    const info = renderer.info.render
    perf.textContent =
      `${fps.toFixed(0)} fps\n` +
      `${info.calls} draw calls\n` +
      `${(info.triangles / 1000).toFixed(0)}k triangles\n` +
      `pixel ratio ${renderer.getPixelRatio()}\n` +
      `shadows ${renderer.shadowMap.enabled ? SHADOW_MAP_SIZE : 'off'}`
  }

  if (controlsHint && elapsed > 8) controlsHint.classList.add('faded')

  renderer.render(scene, cam.camera)
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
