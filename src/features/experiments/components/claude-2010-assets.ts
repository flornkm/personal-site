// Every file the Claude 2010 room fetches, kept apart from the demo so the experiments grid can
// warm them on hover without pulling in the demo's code.

export const ASSET_BASE = "/experiments/room-2010";

// Painter order, far to near. All layers are full-frame; only the plush (kept from
// the original set — it's the mascot) is positioned by hand, on the desk.
// The open door swings into the room past the desk's corner, so it draws after
// the desk stack; closed it never overlaps anything nearer than the wall.
export const LAYER_IDS = [
  "shell",
  "posters",
  "props",
  "desk",
  "crt",
  "deskstuff",
  "phone",
  "tv",
  "door",
  "floorlamp",
  "chair",
  "front",
  "bean",
  "ball",
  "bed",
] as const;

export const CHAIR_FRAMES = Array.from({ length: 8 }, (_, i) => `chair-spin-${i}`);
export const TV_FRAMES = Array.from({ length: 3 }, (_, i) => `tv-on-${i}`);
export const DOOR_FRAMES = Array.from({ length: 3 }, (_, i) => `door-${i}`);

export const IMAGE_IDS = [
  ...LAYER_IDS,
  ...CHAIR_FRAMES,
  ...TV_FRAMES,
  ...DOOR_FRAMES,
  "floorlamp-on",
  "plush",
];

export const CLAUDE_2010_ASSETS = [
  ...IMAGE_IDS.map((id) => `${ASSET_BASE}/${id}.webp`),
  // The custom cursors, set in claude-2010-demo.css.
  `${ASSET_BASE}/cursor.png`,
  `${ASSET_BASE}/cursor-hand.png`,
];
