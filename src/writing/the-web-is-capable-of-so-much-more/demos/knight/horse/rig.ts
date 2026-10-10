import type { BoneDef } from "../engine/skeleton";

// The horse's bind pose in model space (metres, +Y up, +Z toward the head, +X the horse's left),
// with the root on the ground under the middle of the barrel. A 16-hand riding horse: 1.6 m at
// the withers, the saddle seat at ~1.58 m, about 2.5 m from nose to tail. Legs hang in their
// standing angles (the bind pose is the square stance), so every joint but the root is placed
// where it really sits, and the procedural animator only ever rotates bones (and slides the
// spine and reins).

export type V3 = [number, number, number];

// Front legs pivot at the top of the shoulder blade (it swings with the leg, which is what lets a
// horse reach so far), then point of shoulder, elbow, knee, fetlock; hind legs at the hip joint,
// then stifle, hock, fetlock. The hoof's ground point ends each chain.
export const FRONT_X = 0.2;
export const HIND_X = 0.18;
const FRONT: V3[] = [
  [FRONT_X, 1.42, 0.48],
  [FRONT_X, 1.1, 0.66],
  [FRONT_X, 0.86, 0.44],
  [FRONT_X, 0.48, 0.5],
  [FRONT_X, 0.17, 0.5],
  [FRONT_X, 0, 0.57],
];
const HIND: V3[] = [
  [HIND_X, 1.18, -0.52],
  [HIND_X, 0.9, -0.37],
  [HIND_X, 0.55, -0.79],
  [HIND_X, 0.17, -0.78],
  [HIND_X, 0, -0.71],
];

export const LEG_NAMES = ["FL", "FR", "HL", "HR"] as const;
export type LegName = (typeof LEG_NAMES)[number];
const FRONT_BONES = ["scap", "upper", "fore", "cannon", "pastern"];
const HIND_BONES = ["thigh", "gaskin", "cannon", "pastern"];

const mirror = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];

// Joint chain (including the hoof's ground point) and bone names per leg.
export const LEG_CHAIN: Record<LegName, V3[]> = {
  FL: FRONT,
  FR: FRONT.map((p) => mirror(p, -1)),
  HL: HIND,
  HR: HIND.map((p) => mirror(p, -1)),
};
export const legBones = (leg: LegName) =>
  (leg[0] === "F" ? FRONT_BONES : HIND_BONES).map((n) => `${n}${leg}`);

export const JOINT: Record<string, V3> = {
  root: [0, 0, 0],
  spine: [0, 1.22, 0],
  chest: [0, 1.3, 0.42],
  hips: [0, 1.32, -0.45],
  neck1: [0, 1.42, 0.68],
  neck2: [0, 1.72, 0.93],
  head: [0, 1.97, 1.1],
  earL: [0.072, 2.06, 1.07],
  earR: [-0.072, 2.06, 1.07],
  tail1: [0, 1.47, -0.86],
  tail2: [0, 1.33, -0.98],
  tail3: [0, 1.02, -1.02],
  // Where the reins meet in the rider's hands (resting on the withers when nobody holds them).
  reins: [0, 1.7, 0.36],
};

const PARENT: Record<string, string | null> = {
  root: null,
  spine: "root",
  chest: "spine",
  hips: "spine",
  neck1: "chest",
  neck2: "neck1",
  head: "neck2",
  earL: "head",
  earR: "head",
  tail1: "hips",
  tail2: "tail1",
  tail3: "tail2",
  reins: "spine",
};

for (const leg of LEG_NAMES) {
  const names = legBones(leg);
  const chain = LEG_CHAIN[leg];
  names.forEach((n, i) => {
    JOINT[n] = chain[i];
    PARENT[n] = i === 0 ? (leg[0] === "F" ? "chest" : "hips") : names[i - 1];
  });
}

export const BONE_ORDER = [
  "root",
  "spine",
  "chest",
  "hips",
  "neck1",
  "neck2",
  "head",
  "earL",
  "earR",
  "tail1",
  "tail2",
  "tail3",
  "reins",
  ...LEG_NAMES.flatMap(legBones),
];

export const hb = (name: string) => {
  const i = BONE_ORDER.indexOf(name);
  if (i < 0) throw new Error(`No horse bone ${name}`);
  return i;
};

export function horseBones(): BoneDef[] {
  return BONE_ORDER.map((name) => {
    const parent = PARENT[name];
    const p = parent ? JOINT[parent] : [0, 0, 0];
    const j = JOINT[name];
    return {
      name,
      parent: parent ? hb(parent) : -1,
      offset: [j[0] - p[0], j[1] - p[1], j[2] - p[2]],
    };
  });
}

// Tack the rider and the stable need, in model space (bind pose).
// Lowest point of the seat, where the rider's seat bones rest.
export const SEAT: V3 = [0, 1.585, -0.03];
// Stirrup treads (the ball of the rider's foot), left and right.
export const STIRRUP: V3 = [0.385, 0.96, 0.04];
// Saddle horn (the knob the rider grabs to hop on) and the back of the cantle.
export const HORN: V3 = [0, 1.71, 0.27];
export const CANTLE: V3 = [0, 1.68, -0.27];
// Bit rings at the corners of the mouth.
export const BIT: V3 = [0.088, 1.6, 1.4];
// Half the barrel's width at stirrup height plus the saddle flap: legs straddle outside this.
export const BARREL_HALF = 0.33;
// Where a rider stands to hop on (each side): beside the girth.
export const MOUNT_SPOT: V3 = [0.82, 0, 0.05];
export const WITHERS = 1.6;
