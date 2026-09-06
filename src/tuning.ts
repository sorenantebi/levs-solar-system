/**
 * Every number that decides how the game feels lives here.
 *
 * Vite hot-reloads on save, and the player's position is restored from
 * sessionStorage, so you respawn where you were standing instead of
 * re-walking to the interesting spot.
 */

// --- gravity -----------------------------------------------------------
/**
 * The same surface gravity on every planet.
 *
 * Originally this scaled with radius, which made escape velocity scale with
 * radius too — a nice property, but it left the small worlds with so little
 * gravity that WALK_SPEED exceeded their orbital velocity. Stepping off a
 * ledge put you into a skimming orbit instead of a fall, and it could not be
 * patched: with g proportional to R, raising gravity enough to fix the 3-unit
 * planet makes the 8-unit one impossible to jump off.
 *
 * Constant gravity keeps orbital velocity above walking pace everywhere
 * (7.75 on the smallest planet against a walk of 6.5) while escape velocity
 * still varies as sqrt(R), so leaving a big planet is still harder than
 * leaving a small one — just less dramatically so.
 */
export const SURFACE_GRAVITY = 20

/**
 * Drift further than this above the nearest planet's surface and a spring
 * reels you back to it. A spring cannot be escaped at any speed, so you can
 * never be stranded.
 *
 * Measured against the nearest planet rather than the system centre. Anchoring
 * it to the centre meant the radius had to grow every time a planet moved
 * further out, which in turn let a bad jump from an inner planet drift absurdly
 * far before anything caught it. Relative to the nearest surface, one number
 * works no matter how the system is laid out.
 */
export const LEASH_GAP = 30
export const LEASH_STRENGTH = 8

// --- locomotion --------------------------------------------------------
export const WALK_SPEED = 6.5
export const GROUND_ACCEL = 16 // exponential approach rate toward desired velocity
export const TURN_RATE = 12 // how fast the character swings to face travel
export const JUMP_IMPULSE = 14
export const JUMP_CUT = 0.42 // releasing space early multiplies upward velocity by this
export const AIR_CONTROL = 7
export const AIR_MAX_TANGENT = 6.5
export const COYOTE_TIME = 0.12
export const JUMP_BUFFER = 0.12

/**
 * Extra downward pull while descending close to the ground.
 *
 * These planets are small enough that walking speed is near orbital velocity —
 * on the block world, orbital is about 6.96 against a walk of 6.5. Without
 * this, stepping off a block edge doesn't drop you, it puts you into a
 * skimming orbit that never lands. Gated on descending, so it never clips the
 * rise of a jump; a tapped hop is untouched.
 */
export const GROUND_STICK = 18
export const GROUND_STICK_HEIGHT = 1.2

/**
 * Stepping onto a higher block moves the body instantly, which reads as a
 * teleport. The physics still snaps — anything else lets you clip a cliff —
 * but the drawn character and the camera lag behind and catch up, so it plays
 * as a climb. Rate is per second; the cap stops a hard landing from smearing.
 */
export const STEP_SMOOTH_RATE = 11
export const STEP_SMOOTH_MAX = 0.85

// --- camera ------------------------------------------------------------
export const CAM_DISTANCE = 5.5
/** Pulled in indoors, where the normal distance would sit outside the walls. */
export const CAM_DISTANCE_INDOOR = 3.4
export const CAM_DISTANCE_DAMP = 5
export const CAM_PITCH_START = 0.34
export const CAM_PITCH_MIN = -0.35
export const CAM_PITCH_MAX = 1.25
export const CAM_TARGET_HEIGHT = 1.0
export const CAM_POS_DAMP = 9
export const CAM_UP_DAMP = 5 // how fast the camera's up rolls to match yours
export const MOUSE_SENS = 0.0026

// --- terrain -----------------------------------------------------------
/** How many flat plateau levels the land is quantised into above the shore. */
export const TERRAIN_TIERS = 2
/** Peak height above sea level: RELIEF_SCALE * radius + RELIEF_BASE. */
export const RELIEF_SCALE = 0.085
export const RELIEF_BASE = 0.22
/**
 * Fraction of the relief that land gains the moment it leaves the water, so a
 * coastline is a step up onto a plateau rather than a gentle swell. This is
 * what makes the landmasses read as raised.
 */
export const COAST_STEP = 0.7
/** How wide the shore ramp is, as a fraction of the land band. Keep it small. */
export const SHORE_WIDTH = 0.1
/** Noise frequency: NOISE_SCALE * radius + NOISE_BASE. Lower = bigger islands. */
export const NOISE_SCALE = 0.09
export const NOISE_BASE = 1.5

// --- the block world ---------------------------------------------------
/**
 * Cube-sphere cells per face edge. Higher means smaller blocks. At 16 the
 * cells come out ~0.54 units across on a radius-5.5 planet, so the character
 * stands about 2.4 blocks tall — close to Minecraft's own proportion.
 */
export const VOXEL_GRID = 16
/** Height quantum. Matched to the cell width, so the blocks really are cubes. */
export const VOXEL_BLOCK = 0.55
/**
 * A drop larger than this un-grounds you instead of snapping you down, so you
 * fall off a block edge rather than being glued to the cliff face. Normal
 * walking on a smooth planet only ever drifts a thousandth of a unit, so this
 * never fires there.
 */
export const STEP_DOWN_LIMIT = 0.2
/** Side faces are dimmer than tops, the way Minecraft shades its blocks. */
export const VOXEL_SIDE_SHADE = 0.78
export const VOXEL_GRASS = 0x6fb03f
export const VOXEL_DIRT = 0x8a6440
export const VOXEL_STONE = 0x909496
export const VOXEL_SAND = 0xe0d3a3
export const VOXEL_SNOW = 0xf2f6fa
export const VOXEL_WATER_DEEP = 0x2a5fa8
export const VOXEL_WATER_SHALLOW = 0x4a92cf

// --- keepsakes ---------------------------------------------------------
/** How far a keepsake floats above the ground it sits on. */
export const ITEM_HOVER = 0.55
export const ITEM_BOB = 0.09
export const ITEM_SPIN = 0.9
/** Generous: walking into it should be enough, no precision required. */
export const ITEM_PICKUP_RADIUS = 1.5

// --- water & swimming --------------------------------------------------
export const WATER_COLOR = 0x1d6f9e
export const WATER_OPACITY = 0.55
/** Very low: sharp reflections are most of what makes water read as water. */
export const WATER_ROUGHNESS = 0.04
export const WATER_ENV_INTENSITY = 1.0
/** How hard the waves bend the surface normal. */
export const WAVE_STRENGTH = 0.12
/** Wave animation rate. */
export const WAVE_SPEED = 1.0

/**
 * Depth of your feet below the surface at which you start swimming.
 *
 * Kept shallow on purpose. At 0.7 there was a dead band: wade out and you'd
 * leave the seabed before swimming engaged, so you were neither grounded nor
 * swimming — just falling through shallow water.
 */
export const SWIM_DEPTH = 0.25
/** Depth counted as fully submerged, for buoyancy purposes. */
export const SWIM_SUBMERGE = 1.3
/**
 * Above 1 means net upward force when fully under, so you always bob back to
 * the surface and can never drown. Kept modest: at 1.55 it launched you clear
 * of the water and back onto the beach. Equilibrium float depth is
 * SWIM_SUBMERGE / BUOYANCY = 1.04, which must stay *deeper* than SWIM_DEPTH or
 * you oscillate between swimming and falling at the waterline.
 */
export const BUOYANCY = 1.25
export const WATER_DRAG = 2.4
export const SWIM_ACCEL = 9
export const SWIM_MAX_SPEED = 4.2
/** Upward push while holding jump underwater. Lets you porpoise out. */
export const SWIM_UP = 9

// --- rendering cost ----------------------------------------------------
/**
 * Cap on the render scale. On a Retina display devicePixelRatio is 2, which
 * means four times the fragments — usually the single biggest cost on a Mac.
 * Raise toward 2 for a sharper image, drop to 1 if the frame rate matters more.
 */
export const MAX_PIXEL_RATIO = 1.5
/**
 * The shadow camera follows the planet you're on rather than trying to span
 * the whole system. Covering everything at once needed a 168-unit box and a
 * 4096 map just to stay legible; a box around one planet gets sharper shadows
 * out of a quarter of the texels.
 */
export const SHADOW_MAP_SIZE = 2048
export const SHADOW_MARGIN = 12
export const LIGHT_DISTANCE = 90

// --- lighting & mood ---------------------------------------------------
export const BACKGROUND = 0x272049 // warm deep plum rather than near-black
export const KEY_COLOR = 0xfff0d6
export const KEY_INTENSITY = 2.6
/** Dim warm light from behind, so unlit sides glow instead of going black. */
export const FILL_COLOR = 0xffb894
export const FILL_INTENSITY = 1.05
export const AMBIENT_SKY = 0xd2dcff
export const AMBIENT_GROUND = 0xa08cae
export const AMBIENT_INTENSITY = 2.7
/** How much a planet self-lights on its night side. Keeps colour in shadow. */
export const PLANET_GLOW = 0.17

// --- character animation ----------------------------------------------
export const SQUASH_MAX = 0.34
export const SQUASH_DECAY = 9
export const SQUASH_IMPACT_REF = 14 // landing speed that produces a full squash
export const STRETCH_MAX = 0.22
// Step cycles per unit walked. At WALK_SPEED 6.5 this gives ~1.3 cycles/sec,
// i.e. about 2.6 steps a second — a brisk but readable walk. Raise it if the
// legs look like they're sliding, lower it for a loping, floatier gait.
export const BOB_FREQ = 0.2
export const BOB_AMP = 0.075
export const LEAN_MAX = 0.22
export const STEP_SWING = 0.75 // radians the legs swing at full gait
export const ARM_SWING = 0.55
export const GAIT_DAMP = 7 // how fast limbs spin up / settle when you start or stop
