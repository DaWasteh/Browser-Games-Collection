// Tile type ids and their physical properties. Pure module.

export const T = {
  WALL: 0,      // solid rock / masonry: blocks movement, projectiles and light
  FLOOR: 1,
  PIT: 2,       // chasm: blocks walking, but projectiles and light pass over it
  WATER: 3,     // shallow water: walkable, slows
  LIQUID: 4,    // hazardous liquid (lava / acid / void ooze depending on theme): walkable, damages
  GRASS: 5,     // town ground types
  COBBLE: 6,
  DIRT: 7,
  DEEPWATER: 8, // town pond: blocks walking
  BLOCK: 9,     // invisible blocker under large props (houses, stalls)
  PLANK: 10,    // wooden floor / bridge
  RUG: 11,      // decorative floor inside special rooms
};

const WALKABLE = new Uint8Array(16);
const OPAQUE = new Uint8Array(16);
const PROJ_BLOCK = new Uint8Array(16);

for (const id of [T.FLOOR, T.WATER, T.LIQUID, T.GRASS, T.COBBLE, T.DIRT, T.PLANK, T.RUG]) WALKABLE[id] = 1;
for (const id of [T.WALL, T.BLOCK]) { OPAQUE[id] = 1; PROJ_BLOCK[id] = 1; }

export const isWalkableId = (id) => WALKABLE[id] === 1;
export const isOpaqueId = (id) => OPAQUE[id] === 1;
export const blocksProjectileId = (id) => PROJ_BLOCK[id] === 1;
/** Tiles the AI prefers to avoid while pathing (still walkable). */
export const isHazardId = (id) => id === T.LIQUID;
