import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FollowCamera } from './followCamera'
import { Input } from './input'
import { Hud } from './hud'
import { findBuildSite, House } from './house'
import { animateCollectibles, buildCollectibles } from './items'
import { SCROLLS } from './scrolls'
import { buildPlanets, buildStarfield, buildWater, groundRadius, PLANETS } from './planets'
import { buildScenery, HOME_POKEMON_CLEAR_RADIUS, HOME_POKEMON_DIR } from './scenery'
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

const SAVE_KEY = 'sphere-game:player:v2'
const MUTE_KEY = 'sphere-game:mute:v1'
const PLANET_MUSIC_VOLUME = 0.3

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
const SUN_URL = new URL('./models/the_sun.glb', import.meta.url).href
const HOUSE_CAT_URL = new URL('./models/oiiaioooooiai_cat.glb', import.meta.url).href
const HOUSE_BED_URL = new URL('./models/bed_minecraft.glb', import.meta.url).href
const HOENN_MUSIC_URL = new URL('./music/hoenn-music.mp3', import.meta.url).href
const HOME_MUSIC_URL = new URL('./music/ghibli-music.mp3', import.meta.url).href
const LOVER_MUSIC_URL = new URL('./music/lover-music.mp3', import.meta.url).href
const MINECRAFT_MUSIC_URL = new URL('./music/minecraft-music.mp3', import.meta.url).href
const JAZZ_MUSIC_URL = new URL('./music/jazz-music.mp3', import.meta.url).href
const CAT_SPIN_URL = new URL('./music/cat-spin.mp3', import.meta.url).href

// A visible sun that tracks the same direction as the key light.
const sun = new THREE.Group()
scene.add(sun)

const sunLoader = new GLTFLoader()
sunLoader.load(
  SUN_URL,
  (gltf) => {
    const model = gltf.scene
    const box = new THREE.Box3().setFromObject(model)
    const height = box.max.y - box.min.y
    if (height > 1e-6) model.scale.setScalar(6.2 / height)
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = false
        o.receiveShadow = false
      }
    })
    sun.add(model)
  },
  undefined,
  (error) => {
    console.error('Failed to load sun model:', error)
  },
)

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
const hoennMusic = new Audio(HOENN_MUSIC_URL)
hoennMusic.preload = 'auto'
hoennMusic.loop = true
hoennMusic.volume = PLANET_MUSIC_VOLUME
let hoennMusicPendingStart = false
const homeMusic = new Audio(HOME_MUSIC_URL)
homeMusic.preload = 'auto'
homeMusic.loop = true
homeMusic.volume = PLANET_MUSIC_VOLUME
let homeMusicPendingStart = false
const loverMusic = new Audio(LOVER_MUSIC_URL)
loverMusic.preload = 'auto'
loverMusic.loop = true
loverMusic.volume = PLANET_MUSIC_VOLUME
let loverMusicPendingStart = false
const minecraftMusic = new Audio(MINECRAFT_MUSIC_URL)
minecraftMusic.preload = 'auto'
minecraftMusic.loop = true
minecraftMusic.volume = PLANET_MUSIC_VOLUME
let minecraftMusicPendingStart = false
const jazzMusic = new Audio(JAZZ_MUSIC_URL)
jazzMusic.preload = 'auto'
jazzMusic.loop = true
jazzMusic.volume = PLANET_MUSIC_VOLUME
let jazzMusicPendingStart = false
const catSpinSfx = new Audio(CAT_SPIN_URL)
catSpinSfx.preload = 'auto'
let muted = localStorage.getItem(MUTE_KEY) === '1'
hoennMusic.muted = muted
homeMusic.muted = muted
loverMusic.muted = muted
minecraftMusic.muted = muted
jazzMusic.muted = muted
catSpinSfx.muted = muted

const soundToggle = document.createElement('button')
soundToggle.id = 'sound-toggle'
soundToggle.type = 'button'
function syncSoundToggleLabel(): void {
  soundToggle.textContent = muted ? 'sound: off' : 'sound: on'
}
syncSoundToggleLabel()
soundToggle.addEventListener('click', () => {
  muted = !muted
  hoennMusic.muted = muted
  homeMusic.muted = muted
  loverMusic.muted = muted
  minecraftMusic.muted = muted
  jazzMusic.muted = muted
  catSpinSfx.muted = muted
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  syncSoundToggleLabel()
})
document.body.append(soundToggle)

function isJazzPlanet(name: string): boolean {
  return name !== 'hoenn' && name !== 'home' && name !== 'lover' && name !== 'minecraft'
}

type InteractionTarget = {
  root: THREE.Object3D
  text?: string
  onClick?: () => void
}

const interactionRoots = new Map<number, InteractionTarget>()
const scrollRoots = new Map<number, (typeof items)[number]>()
const raycaster = new THREE.Raycaster()
const pointerNdc = new THREE.Vector2()
const hoverNdc = new THREE.Vector2(0, 0)
let hoverActive = false
const _camPos = new THREE.Vector3()
const _objPos = new THREE.Vector3()
const _toTarget = new THREE.Vector3()
const aimDot = document.createElement('div')
aimDot.id = 'aim-dot'
document.body.append(aimDot)
const interactHint = document.createElement('div')
interactHint.id = 'interact-hint'
document.body.append(interactHint)
const SCROLL_CLICK_RADIUS = 2.6
const INTERACT_CLICK_RADIUS = 2.5
const TARGET_CONE_COS = 0.992
const ARRAKIS_ROCKY_COLLIDER_DIR = new THREE.Vector3(0.72, 0.45, -0.53).normalize()
const ARRAKIS_ROCKY_COLLIDER_RADIUS = 1.55
const _rockyToPlayer = new THREE.Vector3()

for (const item of items) scrollRoots.set(item.object.id, item)

function setAimDot(clientX: number, clientY: number): void {
  aimDot.style.left = `${clientX}px`
  aimDot.style.top = `${clientY}px`
}

function refreshAimDot(): void {
  if (hud.open || document.pointerLockElement === renderer.domElement) {
    aimDot.classList.add('hidden')
    renderer.domElement.style.cursor = ''
    return
  }
  aimDot.classList.remove('hidden')
  renderer.domElement.style.cursor = 'none'
}

function bindInteraction(root: THREE.Object3D, text?: string, onClick?: () => void): void {
  interactionRoots.set(root.id, { root, text, onClick })
}

function findInteractionTarget(hit: THREE.Object3D): InteractionTarget | null {
  let node: THREE.Object3D | null = hit
  while (node) {
    const entry = interactionRoots.get(node.id)
    if (entry) return entry
    node = node.parent
  }
  return null
}

function findScrollTarget(hit: THREE.Object3D): (typeof items)[number] | null {
  let node: THREE.Object3D | null = hit
  while (node) {
    const item = scrollRoots.get(node.id)
    if (item) return item
    node = node.parent
  }
  return null
}

function nextScrollPlanet(): string | null {
  for (const scroll of SCROLLS) {
    const item = items.find((i) => i.planet.name === scroll.planet)
    if (item && !item.collected) return scroll.planet
  }
  return null
}

type ClickTarget =
  | { kind: 'scroll'; item: (typeof items)[number] }
  | { kind: 'interaction'; root: THREE.Object3D; text?: string; onClick?: () => void }

function pickTarget(ndc: THREE.Vector2): ClickTarget | null {
  const nextPlanet = nextScrollPlanet()
  const pickables: THREE.Object3D[] = []
  for (const item of items) {
    if (!item.collected) pickables.push(item.object)
  }
  for (const entry of interactionRoots.values()) pickables.push(entry.root)
  if (pickables.length === 0) return null

  raycaster.setFromCamera(ndc, cam.camera)
  const hits = raycaster.intersectObjects(pickables, true)
  for (const hit of hits) {
    const scroll = findScrollTarget(hit.object)
    if (scroll) {
      if (nextPlanet && scroll.planet.name !== nextPlanet) continue
      if (scroll.collected || scroll.planet !== player.planet) continue
      if (player.pos.distanceTo(scroll.position) > SCROLL_CLICK_RADIUS) continue
      return { kind: 'scroll', item: scroll }
    }

    const target = findInteractionTarget(hit.object)
    if (target) {
      target.root.getWorldPosition(_objPos)
      if (player.pos.distanceTo(_objPos) > INTERACT_CLICK_RADIUS) continue
      return { kind: 'interaction', root: target.root, text: target.text, onClick: target.onClick }
    }
  }

  // Slightly forgiving fallback: if you're close and aiming near the target,
  // treat near-miss clicks as intentional.
  cam.camera.getWorldPosition(_camPos)
  const rayDir = raycaster.ray.direction
  let best: { score: number; target: ClickTarget } | null = null

  for (const item of items) {
    if (nextPlanet && item.planet.name !== nextPlanet) continue
    if (item.collected || item.planet !== player.planet) continue
    if (player.pos.distanceTo(item.position) > SCROLL_CLICK_RADIUS) continue

    _toTarget.copy(item.position).sub(_camPos)
    const dist = _toTarget.length()
    if (dist <= 1e-5) continue
    const align = _toTarget.multiplyScalar(1 / dist).dot(rayDir)
    if (align < TARGET_CONE_COS) continue

    const score = align - dist * 0.0008
    if (!best || score > best.score) best = { score, target: { kind: 'scroll', item } }
  }

  for (const entry of interactionRoots.values()) {
    entry.root.getWorldPosition(_objPos)
    if (player.pos.distanceTo(_objPos) > INTERACT_CLICK_RADIUS) continue

    _toTarget.copy(_objPos).sub(_camPos)
    const dist = _toTarget.length()
    if (dist <= 1e-5) continue
    const align = _toTarget.multiplyScalar(1 / dist).dot(rayDir)
    if (align < TARGET_CONE_COS) continue

    const score = align - dist * 0.0008
    if (!best || score > best.score) best = {
      score,
      target: { kind: 'interaction', root: entry.root, text: entry.text, onClick: entry.onClick },
    }
  }

  return best?.target ?? null
}

function refreshInteractHint(): void {
  if (hud.open) {
    interactHint.classList.remove('on')
    return
  }

  const ndc = document.pointerLockElement === renderer.domElement
    ? pointerNdc.set(0, 0)
    : hoverActive
      ? hoverNdc
      : null
  if (!ndc) {
    interactHint.classList.remove('on')
    return
  }

  const target = pickTarget(ndc)
  if (!target) {
    interactHint.classList.remove('on')
    return
  }

  interactHint.textContent = target.kind === 'scroll' ? 'Click to pick up scroll' : 'Click to interact'
  interactHint.classList.add('on')
}

// The house, and the one scroll you have to go indoors to find.
const homeWorld = PLANETS.find((p) => p.name === 'home')
const house = homeWorld ? new House(homeWorld, findBuildSite(homeWorld, groundRadius), groundRadius) : null
let residentSpeaking = false
if (house) {
  scene.add(house.group)
  if (house.resident) {
    bindInteraction(house.resident, undefined, () => {
      residentSpeaking = true
      hud.sayTyped('Hi my love. You made it. Its been a long journey, and I hope you can see how much I love you. Love -Soren')
    })
  }
  const key = items.find((i) => i.planet.name === 'home')
  if (key) {
    key.position.copy(house.interior)
    key.object.position.copy(house.interior)
    // Match the building's frame, or it stands at the angle of wherever the
    // placement scan happened to land rather than upright on the floor.
    key.object.quaternion.copy(house.group.quaternion)
  }

  const catLoader = new GLTFLoader()
  catLoader.load(
    HOUSE_CAT_URL,
    (gltf) => {
      const cat = gltf.scene
      cat.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })

      const box = new THREE.Box3().setFromObject(cat)
      const height = box.max.y - box.min.y
      if (height > 1e-6) cat.scale.setScalar(0.92 / height)
      cat.updateMatrixWorld(true)
      box.setFromObject(cat)
      cat.position.y -= box.min.y

      const catHolder = new THREE.Group()
      catHolder.add(cat)

      const catOffset = new THREE.Vector3(0.7, -0.35, -0.7).applyQuaternion(house.group.quaternion)
      catHolder.position.copy(house.interior).add(catOffset)
      catHolder.quaternion.copy(house.group.quaternion)
      catHolder.rotateY(-Math.PI * 0.1)
      scene.add(catHolder)
      bindInteraction(catHolder, undefined, () => {
        catSpinSfx.currentTime = 0
        void catSpinSfx.play()
      })
    },
    undefined,
    (error) => {
      console.error('Failed to load house cat model:', error)
    },
  )

  const bedLoader = new GLTFLoader()
  bedLoader.load(
    HOUSE_BED_URL,
    (gltf) => {
      const bed = gltf.scene
      bed.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })

      const box = new THREE.Box3().setFromObject(bed)
      const height = box.max.y - box.min.y
      if (height > 1e-6) bed.scale.setScalar(0.7 / height)
      bed.updateMatrixWorld(true)
      box.setFromObject(bed)
      bed.position.y -= box.min.y

      const bedHolder = new THREE.Group()
      bedHolder.add(bed)

      const bedOffset = new THREE.Vector3(-2.45, -0.35, 1.05).applyQuaternion(house.group.quaternion)
      bedHolder.position.copy(house.interior).add(bedOffset)
      bedHolder.quaternion.copy(house.group.quaternion)
      bedHolder.rotateY(-Math.PI)
      scene.add(bedHolder)
      bindInteraction(bedHolder, 'eepy... so very eepy...')
    },
    undefined,
    (error) => {
      console.error('Failed to load house bed model:', error)
    },
  )
}

// Trees and clouds, kept clear of the house and of every scroll so nothing
// ends up planted through a doorway or hiding what you came to find.
const home = PLANETS.find((p) => p.name === 'start')
const keepClear = [
  ...(house ? [{ point: house.group.position, radius: 6.5 }] : []),
  ...(home ? [{ point: home.center.clone().addScaledVector(HOME_POKEMON_DIR, groundRadius(home, HOME_POKEMON_DIR)), radius: HOME_POKEMON_CLEAR_RADIUS }] : []),
  ...items.map((i) => ({ point: i.position, radius: 2.2 })),
]
const scenery = buildScenery(scene, groundRadius, keepClear, bindInteraction)

const arrakis = PLANETS.find((p) => p.name === 'arrakis')
const rockyColliderCenter = arrakis
  ? arrakis.center.clone().addScaledVector(ARRAKIS_ROCKY_COLLIDER_DIR, groundRadius(arrakis, ARRAKIS_ROCKY_COLLIDER_DIR))
  : null

hud.onReset = () => {
  for (const item of items) {
    item.collected = false
    item.object.visible = true
  }
  hud.invalidate()
  save()
}

const player = new Player()
player.collider = {
  resolve(pos: THREE.Vector3, vel: THREE.Vector3): void {
    house?.resolve(pos, vel)
    if (!rockyColliderCenter) return

    _rockyToPlayer.subVectors(pos, rockyColliderCenter)
    const dist = _rockyToPlayer.length()
    if (dist >= ARRAKIS_ROCKY_COLLIDER_RADIUS) return

    const normal = _rockyToPlayer.multiplyScalar(1 / Math.max(dist, 1e-6))
    pos.copy(rockyColliderCenter).addScaledVector(normal, ARRAKIS_ROCKY_COLLIDER_RADIUS)

    const into = vel.dot(normal)
    if (into < 0) vel.addScaledVector(normal, -into)
  },
  floorAt(pos: THREE.Vector3, planetCentre: THREE.Vector3): number {
    return house?.floorAt?.(pos, planetCentre) ?? 0
  },
}
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
    trees: scenery.trees.map((t) => t.toArray().map((n) => +n.toFixed(2))),
    lag: +player.pos.distanceTo(player.visual).toFixed(3),
    found: items.filter((i) => i.collected).map((i) => i.planet.name),
    reading: hud.open,
    items: items.map((i) => ({
      planet: i.planet.name,
      title: i.scroll.title,
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
const ALBUM_INTERACT_RADIUS = 2.2

renderer.domElement.addEventListener('pointermove', (e) => {
  if (hud.open || document.pointerLockElement === renderer.domElement) return
  const rect = renderer.domElement.getBoundingClientRect()
  hoverNdc.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  )
  hoverActive = true
  setAimDot(e.clientX, e.clientY)
  refreshInteractHint()
})

renderer.domElement.addEventListener('pointerenter', (e) => {
  if (document.pointerLockElement === renderer.domElement) return
  const rect = renderer.domElement.getBoundingClientRect()
  hoverNdc.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  )
  hoverActive = true
  setAimDot(e.clientX, e.clientY)
  refreshAimDot()
  refreshInteractHint()
})

renderer.domElement.addEventListener('pointerleave', () => {
  if (document.pointerLockElement === renderer.domElement) return
  hoverActive = false
  aimDot.classList.add('hidden')
  interactHint.classList.remove('on')
})

addEventListener('pointerlockchange', () => {
  refreshAimDot()
  if (document.pointerLockElement === renderer.domElement) hoverActive = false
  refreshInteractHint()
})
refreshAimDot()
refreshInteractHint()

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (hud.open || (interactionRoots.size === 0 && scrollRoots.size === 0)) return

  const locked = document.pointerLockElement === renderer.domElement
  if (!locked) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    hoverNdc.copy(pointerNdc)
    hoverActive = true
  } else {
    pointerNdc.set(0, 0)
  }

  const target = pickTarget(pointerNdc)
  if (!target) {
    residentSpeaking = false
    hud.dismissToast()
    return
  }
  if (target.kind === 'scroll') {
    residentSpeaking = false
    target.item.collected = true
    target.item.object.visible = false
    hud.announce(target.item)
    refreshInteractHint()
    return
  }
  const clickedResident = !!house?.resident && target.root === house.resident
  if (!clickedResident) residentSpeaking = false
  target.onClick?.()
  if (target.text) hud.say(target.text)
})

// Press P for a live readout. I can only measure this machine's software
// renderer; these are the numbers from yours.
const perf = document.createElement('div')
perf.id = 'perf'
document.body.append(perf)
addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') perf.classList.toggle('on')
  // E frees the cursor so the shelf is clickable, and closes an open scroll.
  if (e.code === 'KeyE') hud.toggle()
  if (e.code === 'Escape') hud.close()
})
let perfTimer = 0
let perfFrames = 0
let fps = 0
let elapsed = 0

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight)
  cam.resize(innerWidth / innerHeight)
  refreshAimDot()
})

const _camTarget = new THREE.Vector3()
const _camDir = new THREE.Vector3()
let shadowPlanet: Planet | null = null
let indoorsLatched = false
let prevPlanetName = ''
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
  scenery.update(elapsed)

  // Swimming counts as settled, not airborne. Freezing the camera's up-vector
  // is meant to stop the world spinning during a jump — but if it stays frozen
  // while you float, the camera keeps the up-vector of the planet you left and
  // the camera-relative controls come out rotated.
  cam.transport(player.up, player.grounded || player.swimming, dt)
  player.update(dt, input, cam.forward, cam.up)

  const currentPlanetName = player.planet.name
  if (currentPlanetName !== prevPlanetName) {
    if (prevPlanetName === 'hoenn') {
      hoennMusic.pause()
      hoennMusic.currentTime = 0
      hoennMusicPendingStart = false
    }
    if (prevPlanetName === 'home') {
      homeMusic.pause()
      homeMusic.currentTime = 0
      homeMusicPendingStart = false
    }
    if (prevPlanetName === 'lover') {
      loverMusic.pause()
      loverMusic.currentTime = 0
      loverMusicPendingStart = false
    }
    if (prevPlanetName === 'minecraft') {
      minecraftMusic.pause()
      minecraftMusic.currentTime = 0
      minecraftMusicPendingStart = false
    }
    if (prevPlanetName && isJazzPlanet(prevPlanetName)) {
      jazzMusic.pause()
      jazzMusic.currentTime = 0
      jazzMusicPendingStart = false
    }
    if (currentPlanetName === 'hoenn') hoennMusicPendingStart = true
    if (currentPlanetName === 'home') homeMusicPendingStart = true
    if (currentPlanetName === 'lover') loverMusicPendingStart = true
    if (currentPlanetName === 'minecraft') minecraftMusicPendingStart = true
    if (isJazzPlanet(currentPlanetName)) jazzMusicPendingStart = true
    prevPlanetName = currentPlanetName
  }

  if (currentPlanetName === 'hoenn' && hoennMusicPendingStart && player.grounded) {
    const duration = Number.isFinite(hoennMusic.duration) ? hoennMusic.duration : 0
    const randomStart = duration > 0.25 ? Math.random() * (duration - 0.01) : 0
    hoennMusic.currentTime = randomStart
    void hoennMusic.play().then(
      () => {
        hoennMusicPendingStart = false
      },
      () => {
        // Browser blocked autoplay; keep pending and retry once user interaction permits.
      },
    )
  }

  if (currentPlanetName === 'home' && homeMusicPendingStart && player.grounded) {
    const duration = Number.isFinite(homeMusic.duration) ? homeMusic.duration : 0
    const randomStart = duration > 0.25 ? Math.random() * (duration - 0.01) : 0
    homeMusic.currentTime = randomStart
    void homeMusic.play().then(
      () => {
        homeMusicPendingStart = false
      },
      () => {
        // Browser blocked autoplay; keep pending and retry once user interaction permits.
      },
    )
  }

  if (currentPlanetName === 'lover' && loverMusicPendingStart && player.grounded) {
    const duration = Number.isFinite(loverMusic.duration) ? loverMusic.duration : 0
    const randomStart = duration > 0.25 ? Math.random() * (duration - 0.01) : 0
    loverMusic.currentTime = randomStart
    void loverMusic.play().then(
      () => {
        loverMusicPendingStart = false
      },
      () => {
        // Browser blocked autoplay; keep pending and retry once user interaction permits.
      },
    )
  }

  if (currentPlanetName === 'minecraft' && minecraftMusicPendingStart && player.grounded) {
    const duration = Number.isFinite(minecraftMusic.duration) ? minecraftMusic.duration : 0
    const randomStart = duration > 0.25 ? Math.random() * (duration - 0.01) : 0
    minecraftMusic.currentTime = randomStart
    void minecraftMusic.play().then(
      () => {
        minecraftMusicPendingStart = false
      },
      () => {
        // Browser blocked autoplay; keep pending and retry once user interaction permits.
      },
    )
  }

  if (isJazzPlanet(currentPlanetName) && jazzMusicPendingStart && player.grounded) {
    const duration = Number.isFinite(jazzMusic.duration) ? jazzMusic.duration : 0
    const randomStart = duration > 0.25 ? Math.random() * (duration - 0.01) : 0
    jazzMusic.currentTime = randomStart
    void jazzMusic.play().then(
      () => {
        jazzMusicPendingStart = false
      },
      () => {
        // Browser blocked autoplay; keep pending and retry once user interaction permits.
      },
    )
  }

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
    sun.position.copy(shadowPlanet.center).addScaledVector(LIGHT_DIR, LIGHT_DISTANCE * 1.35)
  }

  if (house) {
    indoorsLatched = indoorsLatched ? house.contains(player.pos, 0.55) : house.contains(player.pos)
    house.roof.visible = !indoorsLatched
    if (residentSpeaking) house.lookResidentAt(player.pos, dt)
    else house.resetResidentLook(dt)
  } else {
    indoorsLatched = false
  }
  const indoors = indoorsLatched
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

  const nearbyAlbum = scenery.albums.find(
    (a) => a.planet === player.planet && player.pos.distanceTo(a.point) <= ALBUM_INTERACT_RADIUS,
  )
  hud.setAlbumHint(nearbyAlbum ? nearbyAlbum.planet.name : null)
  if (nearbyAlbum && input.interactPressed) hud.openAlbum(nearbyAlbum.planet.name)

  hud.update(player.planet.name, items, dt)
  input.blocked = hud.open
  refreshAimDot()
  refreshInteractHint()

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
