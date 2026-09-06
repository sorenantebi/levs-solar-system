import * as THREE from 'three'
import { buildFigure, FIGURE_HIP_Y } from './character'
import { Planet } from './planets'
import { terrainAt } from './texture'

/**
 * A little house you can walk into, and the person who lives in it.
 *
 * Everything is defined in the house's own local frame — +Y up, the door
 * facing +Z — and the whole thing is then stood upright on its planet. Doing
 * the collision in that local frame means it stays plain axis-aligned box
 * maths no matter where on the sphere the house ended up.
 *
 * The walls are the first solid props in the game: up to now every prop was
 * declared decorative and the only collider was the ground itself.
 *
 * They also extend a good way *below* the floor line. A flat-bottomed box
 * cannot sit flush on a sphere — the ground falls away toward the corners, so
 * the walls lift off and you can see underneath them. Burying the bottom is
 * what stops that, and it costs nothing because it is never seen.
 */

const WIDTH = 7
const DEPTH = 7
const WALL = 0.35
const HEIGHT = 3.2
const DOOR_W = 1.8
const DOOR_H = 2.4
/** How far the walls continue under the floor line, to bury the curvature. */
const FOOTING = 1.4

const HALF_W = WIDTH / 2
const HALF_D = DEPTH / 2
const INNER = HALF_W - WALL

interface Box {
  min: [number, number, number]
  max: [number, number, number]
}

/** Solid parts, in local space. The doorway is simply left out. */
const SOLIDS: Box[] = [
  // Back wall.
  { min: [-HALF_W, -FOOTING, -HALF_D], max: [HALF_W, HEIGHT, -INNER] },
  // Side walls.
  { min: [-HALF_W, -FOOTING, -INNER], max: [-INNER, HEIGHT, INNER] },
  { min: [INNER, -FOOTING, -INNER], max: [HALF_W, HEIGHT, INNER] },
  // Front wall, split around the doorway.
  { min: [-HALF_W, -FOOTING, INNER], max: [-DOOR_W / 2, HEIGHT, HALF_D] },
  { min: [DOOR_W / 2, -FOOTING, INNER], max: [HALF_W, HEIGHT, HALF_D] },
  // Lintel over the door. The gap below it runs all the way down, so the
  // doorway stays walkable wherever the ground happens to sit.
  { min: [-DOOR_W / 2, DOOR_H, INNER], max: [DOOR_W / 2, HEIGHT, HALF_D] },
  // Ceiling, so you can't jump out through the roof.
  { min: [-HALF_W, HEIGHT, -HALF_D], max: [HALF_W, HEIGHT + 0.3, HALF_D] },
  // The desk, so you walk round it rather than through it.
  { min: [-1.1, 0, -2.5], max: [1.1, 0.62, -1.6] },
]

/** Half-extents of the player's collision box; centred a body-height up. */
const BODY = new THREE.Vector3(0.32, 0.65, 0.32)

const _local = new THREE.Vector3()
const _centre = new THREE.Vector3()
const _push = new THREE.Vector3()
const _before = new THREE.Vector3()
const _dirLocal = new THREE.Vector3()

interface Palette {
  plaster: THREE.Material
  timber: THREE.Material
  beam: THREE.Material
  tile: THREE.Material
  stone: THREE.Material
  glass: THREE.Material
  floor: THREE.Material
}

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * The resident. The very same figure the player is — same builder, same
 * proportions, same colours — just without the hair, and posed sitting rather
 * than animated.
 *
 * Which is the point of the legs having knees: a single-segment leg rotated
 * forward sticks straight out, and the pose reads as sitting on the floor.
 */
function buildResident(): THREE.Group {
  const figure = buildFigure({}, { hair: false })

  // Thighs forward, shins back down. The two cancel, so the shins hang
  // vertically and the read of "sitting" comes from the fold at the hip.
  for (const [hip, knee] of [
    [figure.legL, figure.kneeL],
    [figure.legR, figure.kneeR],
  ] as const) {
    hip.rotation.x = 1.42
    knee.rotation.x = -1.42
  }
  // Hands out to the keyboard.
  figure.armL.rotation.x = 1.15
  figure.armR.rotation.x = 1.15

  return figure.rig
}

/** Desk, chair, screen, shelf — the room's contents. */
function buildStudy(mats: Palette): THREE.Group {
  const study = new THREE.Group()
  const screenGlow = new THREE.MeshStandardMaterial({
    color: 0xbfe4f5,
    emissive: 0x7fc4e8,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  })
  const dark = new THREE.MeshStandardMaterial({ color: 0x2f3540, roughness: 0.6 })

  // --- desk, set against the back wall. Sized to the figure: its hips are
  // only 0.27 off the floor, so anything taller turns the chair into a stool.
  const deskZ = -2.05
  const DESK_TOP = 0.52
  study.add(box(2.2, 0.09, 0.9, mats.timber, 0, DESK_TOP - 0.045, deskZ))
  for (const side of [-1, 1]) {
    study.add(box(0.09, DESK_TOP - 0.09, 0.8, mats.timber, side * 1.0, (DESK_TOP - 0.09) / 2, deskZ))
  }
  study.add(box(1.9, 0.24, 0.06, mats.timber, 0, 0.3, deskZ - 0.42))
  // Drawers.
  for (const y of [0.22, 0.4]) {
    study.add(box(0.5, 0.14, 0.06, mats.beam, 0.62, y, deskZ + 0.43))
  }

  // --- screen, on a stand
  study.add(box(0.28, 0.03, 0.2, dark, 0, DESK_TOP + 0.02, deskZ - 0.2))
  study.add(box(0.07, 0.24, 0.07, dark, 0, DESK_TOP + 0.14, deskZ - 0.2))
  const bezel = box(0.92, 0.58, 0.05, dark, 0, DESK_TOP + 0.5, deskZ - 0.2)
  bezel.rotation.x = 0.06
  study.add(bezel)
  const screen = box(0.84, 0.5, 0.02, screenGlow, 0, DESK_TOP + 0.5, deskZ - 0.15)
  screen.rotation.x = 0.06
  study.add(screen)

  // The screen throws a little light of its own — cheap, and it is what makes
  // the room read as occupied rather than staged.
  const glow = new THREE.PointLight(0x8fd0ee, 1.6, 5.5, 2)
  glow.position.set(0, DESK_TOP + 0.5, deskZ + 0.25)
  study.add(glow)

  // --- keyboard, mouse, mug
  study.add(box(0.62, 0.035, 0.2, dark, -0.05, DESK_TOP + 0.02, deskZ + 0.24))
  study.add(box(0.1, 0.035, 0.15, dark, 0.44, DESK_TOP + 0.02, deskZ + 0.24))
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.14, 12), mats.tile)
  mug.position.set(-0.78, DESK_TOP + 0.07, deskZ + 0.15)
  mug.castShadow = true
  study.add(mug)

  // --- chair
  const chairZ = deskZ + 0.92
  const SEAT = 0.26
  study.add(box(0.62, 0.07, 0.6, mats.timber, 0, SEAT - 0.035, chairZ))
  const back = box(0.58, 0.6, 0.08, mats.timber, 0, SEAT + 0.3, chairZ + 0.27)
  back.rotation.x = 0.12
  study.add(back)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      study.add(box(0.07, SEAT - 0.07, 0.07, mats.timber, sx * 0.25, (SEAT - 0.07) / 2, chairZ + sz * 0.24))
    }
  }

  // Placed by the hips, not the feet: seated, the feet are off the floor.
  const resident = buildResident()
  resident.position.set(0, SEAT + 0.03 - FIGURE_HIP_Y, chairZ - 0.02)
  study.add(resident)

  // --- rug
  const rug = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 0.03, 24),
    new THREE.MeshStandardMaterial({ color: 0xa8564e, roughness: 0.95 }),
  )
  rug.position.set(0.4, 0.02, 0.7)
  rug.receiveShadow = true
  study.add(rug)
  const border = new THREE.Mesh(
    new THREE.CylinderGeometry(1.62, 1.62, 0.025, 24),
    new THREE.MeshStandardMaterial({ color: 0xd8a05e, roughness: 0.95 }),
  )
  border.position.set(0.4, 0.015, 0.7)
  border.receiveShadow = true
  study.add(border)

  return study
}

export class House {
  readonly group = new THREE.Group()
  /** Roof and ceiling together; hidden while you're inside. */
  readonly roof = new THREE.Group()
  /** World position of the middle of the room, just above the floor. */
  readonly interior = new THREE.Vector3()

  private readonly toLocal = new THREE.Matrix4()
  private readonly toWorld = new THREE.Matrix4()
  private readonly floorProbe = new THREE.Vector3()

  constructor(
    planet: Planet,
    up: THREE.Vector3,
    groundRadius: (p: Planet, d: THREE.Vector3) => number,
  ) {
    const base = up.clone().multiplyScalar(groundRadius(planet, up)).add(planet.center)

    // Stand it upright on the planet, facing an arbitrary tangent.
    const forward = new THREE.Vector3(0, 0, 1).addScaledVector(up, -up.z)
    if (forward.lengthSq() < 1e-6) forward.set(1, 0, 0).addScaledVector(up, -up.x)
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, up).normalize()
    const basis = new THREE.Matrix4().makeBasis(right, up, forward.clone().negate())

    this.group.position.copy(base)
    this.group.quaternion.setFromRotationMatrix(basis)
    this.group.updateMatrixWorld(true)
    this.toWorld.copy(this.group.matrixWorld)
    this.toLocal.copy(this.toWorld).invert()

    this.interior.set(0, 0.2, 0.8).applyMatrix4(this.toWorld)

    // Single-sided. Every part here is a closed box or cone, so the face you
    // see from inside the room is the box's own front face — double-siding
    // them only disabled backface culling and doubled the fragment work.
    const mats: Palette = {
      plaster: new THREE.MeshStandardMaterial({ color: 0xf6e8cf, roughness: 0.94 }),
      timber: new THREE.MeshStandardMaterial({ color: 0x8a5c42, roughness: 0.85 }),
      beam: new THREE.MeshStandardMaterial({ color: 0x5c3d2c, roughness: 0.88 }),
      tile: new THREE.MeshStandardMaterial({
        color: 0xc4574f,
        roughness: 0.8,
        flatShading: true,
      }),
      stone: new THREE.MeshStandardMaterial({ color: 0x9a8f83, roughness: 0.95 }),
      glass: new THREE.MeshStandardMaterial({
        color: 0xa8dcee,
        emissive: 0x6fb6cf,
        emissiveIntensity: 0.45,
        roughness: 0.2,
      }),
      floor: new THREE.MeshStandardMaterial({ color: 0xa9764f, roughness: 0.88 }),
    }

    this.buildShell(mats)
    this.buildTimberwork(mats)
    this.buildDoorway(mats)
    this.buildWindows(mats)
    this.buildRoof(mats)

    this.group.add(buildStudy(mats))
    this.group.add(this.roof)
  }

  /** Walls and lintel, straight from the collision boxes so the two can't drift. */
  private buildShell(mats: Palette): void {
    for (const b of SOLIDS.slice(0, 6)) {
      this.group.add(
        box(
          b.max[0] - b.min[0],
          b.max[1] - b.min[1],
          b.max[2] - b.min[2],
          mats.plaster,
          (b.min[0] + b.max[0]) / 2,
          (b.min[1] + b.max[1]) / 2,
          (b.min[2] + b.max[2]) / 2,
        ),
      )
    }

    // Floorboards. The player genuinely stands on these — see floorAt.
    const floor = box(WIDTH - WALL, 0.14, DEPTH - WALL, mats.floor, 0, -0.07, 0)
    this.group.add(floor)
    for (let i = -4; i <= 4; i++) {
      this.group.add(box(0.03, 0.015, DEPTH - WALL, mats.beam, i * 0.72, 0.003, 0))
    }

    // Stone footing course, so the building meets the ground with some weight.
    // Its top must stay *below* the floorboards: any higher and the slab caps
    // the whole room and you are walking on grey stone instead of wood.
    this.group.add(box(WIDTH + 0.14, 0.9, DEPTH + 0.14, mats.stone, 0, -0.52, 0))
  }

  /** Corner posts, wall plates and braces — the half-timbered look. */
  private buildTimberwork(mats: Palette): void {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.group.add(
          box(0.3, HEIGHT, 0.3, mats.beam, sx * (HALF_W - 0.14), HEIGHT / 2, sz * (HALF_D - 0.14)),
        )
      }
    }

    for (const y of [1.5, HEIGHT - 0.16]) {
      for (const sz of [-1, 1]) {
        // On the front face, anything below the lintel has to stop either side
        // of the doorway — a full-width rail runs straight through the opening.
        if (sz === 1 && y < DOOR_H) {
          const segment = HALF_W - DOOR_W / 2
          for (const sx of [-1, 1]) {
            this.group.add(
              box(
                segment,
                0.22,
                0.16,
                mats.beam,
                sx * (DOOR_W / 2 + segment / 2),
                y,
                sz * (HALF_D - 0.03),
              ),
            )
          }
          continue
        }
        this.group.add(box(WIDTH, 0.22, 0.16, mats.beam, 0, y, sz * (HALF_D - 0.03)))
      }
      for (const sx of [-1, 1]) {
        this.group.add(box(0.16, 0.22, DEPTH, mats.beam, sx * (HALF_W - 0.03), y, 0))
      }
    }

    // Diagonal braces on the blank side walls.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const brace = box(0.14, 2.0, 0.14, mats.beam, sx * (HALF_W - 0.03), 0.78, sz * 1.75)
        brace.rotation.x = sz * 0.5
        this.group.add(brace)
      }
    }
  }

  private buildDoorway(mats: Palette): void {
    // Set proud of the wall rather than flush — coplanar faces z-fight.
    const z = HALF_D + 0.07
    for (const side of [-1, 1]) {
      this.group.add(
        box(0.22, DOOR_H + 0.9, 0.2, mats.beam, side * (DOOR_W / 2 + 0.11), DOOR_H / 2 - 0.45, z),
      )
    }
    this.group.add(box(DOOR_W + 0.5, 0.26, 0.24, mats.beam, 0, DOOR_H + 0.13, z))

    // The door itself, standing open against the inner wall.
    const door = new THREE.Group()
    door.position.set(-DOOR_W / 2, 0, HALF_D - WALL / 2)
    door.rotation.y = -1.9
    const slab = box(DOOR_W, DOOR_H - 0.06, 0.09, mats.timber, DOOR_W / 2, (DOOR_H - 0.06) / 2, 0)
    door.add(slab)
    for (const y of [0.55, 1.75]) {
      door.add(box(DOOR_W - 0.26, 0.07, 0.11, mats.beam, DOOR_W / 2, y, 0))
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), mats.stone)
    knob.position.set(DOOR_W - 0.2, 1.15, 0.1)
    door.add(knob)
    this.group.add(door)

    // Threshold slab and a step down to the ground.
    this.group.add(box(DOOR_W + 0.6, 0.12, 0.7, mats.stone, 0, 0.02, HALF_D + 0.2))
    this.group.add(box(DOOR_W + 0.9, 0.14, 0.5, mats.stone, 0, -0.14, HALF_D + 0.62))

    // A lantern by the door.
    const bracket = box(0.08, 0.08, 0.36, mats.beam, DOOR_W / 2 + 0.5, 2.15, HALF_D + 0.16)
    this.group.add(bracket)
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 14, 12),
      new THREE.MeshStandardMaterial({
        color: 0xffd9a0,
        emissive: 0xffb85c,
        emissiveIntensity: 1.8,
      }),
    )
    lamp.position.set(DOOR_W / 2 + 0.5, 2.02, HALF_D + 0.3)
    this.group.add(lamp)
  }

  private buildWindows(mats: Palette): void {
    for (const side of [-1, 1]) {
      const x = side * (HALF_W - WALL / 2)
      // Thicker than the wall, or it is entombed inside it and never shows.
      this.group.add(box(WALL + 0.16, 1.2, 1.5, mats.glass, x, 1.75, 0))
      // Frame, mullions and sill.
      this.group.add(box(WALL + 0.26, 0.12, 1.7, mats.beam, x, 2.4, 0))
      this.group.add(box(WALL + 0.3, 0.16, 1.9, mats.timber, x, 1.08, 0))
      this.group.add(box(WALL + 0.22, 1.24, 0.09, mats.beam, x, 1.75, 0))
      this.group.add(box(WALL + 0.22, 0.09, 1.54, mats.beam, x, 1.75, 0))
      for (const sz of [-1, 1]) {
        this.group.add(box(WALL + 0.2, 1.3, 0.12, mats.beam, x, 1.75, sz * 0.79))
        // Shutters, folded back against the wall.
        this.group.add(box(0.07, 1.2, 0.5, mats.timber, x + side * 0.16, 1.75, sz * 1.12))
      }
    }

    // Flower box under the right-hand window.
    const x = HALF_W - WALL / 2 + 0.14
    this.group.add(box(0.34, 0.26, 1.4, mats.timber, x, 0.86, 0))
    const blooms = [0xe8697d, 0xf3c65a, 0xe58fb4, 0xd9585f, 0xf2b0c4]
    for (let i = 0; i < 5; i++) {
      const bloom = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 10, 8),
        new THREE.MeshStandardMaterial({ color: blooms[i], roughness: 0.85 }),
      )
      bloom.position.set(x, 1.06, -0.52 + i * 0.26)
      bloom.castShadow = true
      this.group.add(bloom)
    }
  }

  /**
   * A stepped pyramid rather than a plain cone: three square frustums, each
   * starting a little wider than the one below finished, which reads as
   * courses of tiles instead of one smooth slope.
   */
  private buildRoof(mats: Palette): void {
    const courses: [number, number, number][] = [
      [5.3, 3.9, 0.66],
      [4.05, 2.6, 0.66],
      [2.75, 1.3, 0.66],
    ]
    let y = HEIGHT
    for (const [bottom, top, h] of courses) {
      const course = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, h, 4), mats.tile)
      course.position.y = y + h / 2
      course.rotation.y = Math.PI / 4
      course.castShadow = true
      this.roof.add(course)
      y += h
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.62, 4), mats.tile)
    cap.position.y = y + 0.31
    cap.rotation.y = Math.PI / 4
    cap.castShadow = true
    this.roof.add(cap)

    // Fascia boards along the eaves.
    for (const [ax, az] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const board = box(
        ax !== 0 ? 0.16 : WIDTH + 1.1,
        0.3,
        az !== 0 ? 0.16 : DEPTH + 1.1,
        mats.beam,
        ax * (HALF_W + 0.45),
        HEIGHT + 0.06,
        az * (HALF_D + 0.45),
      )
      this.roof.add(board)
    }

    // Ceiling, plus the beams under it. Hidden with the roof, so that looking
    // in from above shows the room rather than the underside of the tiles.
    this.roof.add(box(WIDTH - WALL, 0.12, DEPTH - WALL, mats.plaster, 0, HEIGHT - 0.06, 0))
    for (let i = -1; i <= 1; i++) {
      this.roof.add(box(0.22, 0.26, DEPTH - WALL, mats.beam, i * 1.9, HEIGHT - 0.25, 0))
    }

    // Chimney, tall enough to clear the slope of the roof at its position.
    const cx = 1.5
    this.roof.add(box(0.72, 2.6, 0.72, mats.stone, cx, HEIGHT + 1.5, -cx))
    this.roof.add(box(0.92, 0.16, 0.92, mats.beam, cx, HEIGHT + 2.86, -cx))
  }

  /** True when the player is standing in the room. */
  contains(worldPos: THREE.Vector3): boolean {
    _local.copy(worldPos).applyMatrix4(this.toLocal)
    return (
      Math.abs(_local.x) < INNER &&
      Math.abs(_local.z) < INNER &&
      _local.y > -1.5 &&
      _local.y < HEIGHT
    )
  }

  /**
   * How long the camera boom can be before it pushes through a wall.
   *
   * A 3.4 boom in a room 6.3 across only fits if you stand dead centre, so
   * indoors the length has to answer to the room rather than be a constant.
   */
  maxBoom(target: THREE.Vector3, direction: THREE.Vector3, wanted: number): number {
    _local.copy(target).applyMatrix4(this.toLocal)
    _dirLocal.copy(direction).transformDirection(this.toLocal)

    const lo = [-INNER + 0.25, 0.3, -INNER + 0.25]
    const hi = [INNER - 0.25, HEIGHT - 0.35, INNER - 0.25]
    const from = [_local.x, _local.y, _local.z]
    const dir = [_dirLocal.x, _dirLocal.y, _dirLocal.z]

    let limit = wanted
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(dir[axis]) < 1e-6) continue
      const exit = Math.max(
        (lo[axis] - from[axis]) / dir[axis],
        (hi[axis] - from[axis]) / dir[axis],
      )
      if (exit > 0) limit = Math.min(limit, exit)
    }
    // Never so short that the camera ends up inside the character.
    return Math.max(1.35, Math.min(wanted, limit))
  }

  /** Height of the floorboards here, as a distance from the planet's core. */
  floorAt(pos: THREE.Vector3, planetCentre: THREE.Vector3): number {
    this.floorProbe.copy(pos).applyMatrix4(this.toLocal)
    // Reaches through the doorway too, so crossing the threshold is one step
    // rather than a stumble on and off the boards.
    if (Math.abs(this.floorProbe.x) > INNER) return 0
    if (this.floorProbe.z < -INNER || this.floorProbe.z > HALF_D) return 0
    if (this.floorProbe.y < -1.2 || this.floorProbe.y > HEIGHT) return 0

    this.floorProbe.y = 0
    this.floorProbe.applyMatrix4(this.toWorld)
    return this.floorProbe.distanceTo(planetCentre)
  }

  /**
   * Push the player out of any solid they're inside, along whichever axis they
   * are least deep into — the standard box resolution, and the reason a
   * glancing brush against a wall slides along it rather than stopping dead.
   */
  resolve(pos: THREE.Vector3, vel: THREE.Vector3): void {
    _local.copy(pos).applyMatrix4(this.toLocal)
    _centre.set(_local.x, _local.y + BODY.y, _local.z)

    // Cheap reject: nowhere near the building.
    if (Math.abs(_centre.x) > HALF_W + 1 || Math.abs(_centre.z) > HALF_D + 1) return
    if (_centre.y < -FOOTING - 1 || _centre.y > HEIGHT + 2) return

    let moved = false
    for (const b of SOLIDS) {
      const dx = Math.min(b.max[0] - (_centre.x - BODY.x), _centre.x + BODY.x - b.min[0])
      if (dx <= 0) continue
      const dy = Math.min(b.max[1] - (_centre.y - BODY.y), _centre.y + BODY.y - b.min[1])
      if (dy <= 0) continue
      const dz = Math.min(b.max[2] - (_centre.z - BODY.z), _centre.z + BODY.z - b.min[2])
      if (dz <= 0) continue

      _push.set(0, 0, 0)
      if (dx <= dy && dx <= dz) {
        _push.x = _centre.x < (b.min[0] + b.max[0]) / 2 ? -dx : dx
      } else if (dy <= dz) {
        _push.y = _centre.y < (b.min[1] + b.max[1]) / 2 ? -dy : dy
      } else {
        _push.z = _centre.z < (b.min[2] + b.max[2]) / 2 ? -dz : dz
      }

      _local.add(_push)
      _centre.add(_push)
      moved = true
    }

    if (!moved) return

    // Back to world space, and drop the velocity that was driving us in.
    _before.copy(pos)
    pos.copy(_local).applyMatrix4(this.toWorld)
    _push.subVectors(pos, _before)
    if (_push.lengthSq() > 1e-10) {
      _push.normalize()
      const into = vel.dot(_push)
      if (into < 0) vel.addScaledVector(_push, -into)
    }
  }
}

/**
 * Find somewhere level and dry to build.
 *
 * Deterministic from the planet's seed, so the house is in the same place
 * every run. The footprint is checked on two rings, because a spot that is
 * merely *on* land can still be straddling a plateau edge — or have an inlet
 * of sea reaching in between the probes and surfacing inside the room.
 */
export function findBuildSite(
  planet: Planet,
  groundRadius: (p: Planet, d: THREE.Vector3) => number,
): THREE.Vector3 {
  const total = 4000
  const start = planet.skin.seed % total
  const dir = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const bitangent = new THREE.Vector3()
  const probe = new THREE.Vector3()
  let fallback: THREE.Vector3 | null = null
  let best: THREE.Vector3 | null = null
  let bestScore = Infinity

  // Reach a little past the corners of the footprint.
  const span = (HALF_W * 1.5) / planet.radius

  for (let k = 0; k < total; k++) {
    const i = (start + k * 13) % total
    const y = 1 - (2 * i + 1) / total
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = i * Math.PI * (3 - Math.sqrt(5))
    dir.set(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize()

    if (terrainAt(planet.skin, planet.noiseScale, dir.x, dir.y, dir.z) < 0.5) continue
    if (!fallback) fallback = dir.clone()

    tangent.set(-dir.y, dir.x, 0)
    if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0)
    tangent.normalize()
    bitangent.crossVectors(dir, tangent).normalize()

    const here = groundRadius(planet, dir)
    let worst = 0
    let dry = true
    for (const [ax, az, ring] of [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1],
      [1, -1, 1],
      [-1, 1, 1],
      [-1, -1, 1],
      [1, 0, 0.55],
      [-1, 0, 0.55],
      [0, 1, 0.55],
      [0, -1, 0.55],
      [1, 1, 0.55],
      [-1, -1, 0.55],
    ]) {
      probe
        .copy(dir)
        .addScaledVector(tangent, ax * span * ring)
        .addScaledVector(bitangent, az * span * ring)
        .normalize()
      if (terrainAt(planet.skin, planet.noiseScale, probe.x, probe.y, probe.z) <= 0) {
        dry = false
        break
      }
      worst = Math.max(worst, Math.abs(groundRadius(planet, probe) - here))
    }
    if (!dry) continue

    // Score rather than accept-or-reject. Demanding dead-level ground finds
    // nothing — the terrain steps in tiers far coarser than any sane
    // tolerance — and then it quietly falls back to the first patch of land
    // it saw, which is how the house ended up on a beach.
    if (worst < bestScore) {
      bestScore = worst
      best = dir.clone()
      if (worst < 0.02) break
    }
  }

  return best ?? fallback ?? dir.set(0, 1, 0).clone()
}
