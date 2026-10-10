import type { GeometryData } from "../engine/geometry";
import { VERTEX_STRIDE } from "../engine/geometry";
import type { BoneDef } from "../engine/skeleton";
import { BONE_NAMES, type BoneName } from "../core/types";
import { smooth, type V3 } from "./shapes";

// Bind pose joint positions in model space (metres, +Y up, +Z forward, +X the character's left).
// Arms hang straight down from the shoulders and legs straight down from the hips. Proportions are
// a stylised adult, about 5 helms tall: long legs, real shoulders, fists reaching mid-thigh. The
// shoulders sit just outside the chest so the A-posed arms swing clear of the torso.
const SHOULDER: V3 = [0.2, 1.36, 0];
const HIP: V3 = [0.1, 0.87, 0];
export const ARM = { upper: 0.29, fore: 0.26 };
export const LEG = { thigh: 0.4, shin: 0.39 };

const side = (p: V3, s: 1 | -1): V3 => [p[0] * s, p[1], p[2]];
const down = (p: V3, d: number): V3 => [p[0], p[1] - d, p[2]];

export const JOINT: Record<BoneName, V3> = {
  root: [0, 0, 0],
  pelvis: [0, 0.9, 0],
  spine: [0, 1.02, 0],
  chest: [0, 1.2, 0],
  neck: [0, 1.37, 0],
  head: [0, 1.445, 0],
  upperArmL: side(SHOULDER, 1),
  foreArmL: down(side(SHOULDER, 1), ARM.upper),
  handL: down(side(SHOULDER, 1), ARM.upper + ARM.fore),
  upperArmR: side(SHOULDER, -1),
  foreArmR: down(side(SHOULDER, -1), ARM.upper),
  handR: down(side(SHOULDER, -1), ARM.upper + ARM.fore),
  thighL: side(HIP, 1),
  shinL: down(side(HIP, 1), LEG.thigh),
  footL: down(side(HIP, 1), LEG.thigh + LEG.shin),
  thighR: side(HIP, -1),
  shinR: down(side(HIP, -1), LEG.thigh),
  footR: down(side(HIP, -1), LEG.thigh + LEG.shin),
  // The helm's plume socket, on the crown a little behind the top.
  accessory: [0, 1.756, -0.028],
};

const PARENT: Record<BoneName, BoneName | null> = {
  root: null,
  pelvis: "root",
  spine: "pelvis",
  chest: "spine",
  neck: "chest",
  head: "neck",
  upperArmL: "chest",
  foreArmL: "upperArmL",
  handL: "foreArmL",
  upperArmR: "chest",
  foreArmR: "upperArmR",
  handR: "foreArmR",
  thighL: "pelvis",
  shinL: "thighL",
  footL: "shinL",
  thighR: "pelvis",
  shinR: "thighR",
  footR: "shinR",
  accessory: "head",
};

export const bone = (name: BoneName) => BONE_NAMES.indexOf(name);

export function boneDefs(): BoneDef[] {
  return BONE_NAMES.map((name) => {
    const parent = PARENT[name];
    const p = parent ? JOINT[parent] : [0, 0, 0];
    const j = JOINT[name];
    return {
      name,
      parent: parent ? bone(parent) : -1,
      offset: [j[0] - p[0], j[1] - p[1], j[2] - p[2]],
    };
  });
}

// Cloth that bends across a joint is bound to a placeholder "region" index while modelling; after
// the mesh is built every vertex in a region gets a two-bone blend from its bind position, so
// sleeves, trousers, boots and the tunic skirt stretch across joints instead of opening seams.
export const REGION = {
  legL: 64,
  legR: 65,
  armL: 66,
  armR: 67,
  torso: 68,
  neck: 69,
  skirtL: 70,
  skirtR: 71,
  bootL: 72,
  bootR: 73,
} as const;

type Blend = [a: BoneName, b: BoneName, weightA: number];
type Resolver = (x: number, y: number, z: number) => Blend;

// Keyframes run from the top of the region down; between two keys the vertex blends smoothly from
// the upper bone to the lower one.
type Key = [y: number, bone: BoneName];
const byHeight =
  (keys: Key[]): Resolver =>
  (_x, y) => {
    if (y >= keys[0][0]) return [keys[0][1], keys[0][1], 1];
    for (let k = 0; k < keys.length - 1; k++) {
      const [y0, b0] = keys[k];
      const [y1, b1] = keys[k + 1];
      if (y <= y0 && y >= y1) {
        const t = (y0 - y) / (y0 - y1);
        return [b0, b1, b0 === b1 ? 1 : 1 - t * t * (3 - 2 * t)];
      }
    }
    const last = keys[keys.length - 1][1];
    return [last, last, 1];
  };

const legKeys = (s: "L" | "R"): Key[] => [
  [JOINT.pelvis[1] + 0.01, "pelvis"],
  [JOINT[`thigh${s}`][1] - 0.005, `thigh${s}`],
  [JOINT[`shin${s}`][1] + 0.07, `thigh${s}`],
  [JOINT[`shin${s}`][1] - 0.06, `shin${s}`],
];
const armKeys = (s: "L" | "R"): Key[] => [
  [JOINT[`upperArm${s}`][1] + 0.04, "chest"],
  [JOINT[`upperArm${s}`][1] - 0.07, `upperArm${s}`],
];
const bootKeys = (s: "L" | "R"): Key[] => [
  [0.165, `shin${s}`],
  [0.105, `foot${s}`],
];

// The tunic skirt hangs from the belt and follows each thigh most of the way at the hem, so a
// striding leg carries its half of the skirt instead of pushing through it. Where it is tucked
// under the belt it stays on the pelvis, so its top edge never wanders out from under it.
const skirt =
  (s: "L" | "R"): Resolver =>
  (_x, y) => [`thigh${s}`, "pelvis", 0.85 * smooth(0.92, 0.7, y)];

const RESOLVE: Record<number, Resolver> = {
  [REGION.legL]: byHeight(legKeys("L")),
  [REGION.legR]: byHeight(legKeys("R")),
  [REGION.armL]: byHeight(armKeys("L")),
  [REGION.armR]: byHeight(armKeys("R")),
  [REGION.torso]: byHeight([
    [JOINT.chest[1], "chest"],
    [JOINT.spine[1] + 0.08, "spine"],
    [JOINT.spine[1] + 0.03, "spine"],
    [0.975, "pelvis"],
  ]),
  [REGION.neck]: byHeight([
    [JOINT.neck[1] + 0.03, "neck"],
    [JOINT.neck[1] - 0.03, "chest"],
  ]),
  [REGION.skirtL]: skirt("L"),
  [REGION.skirtR]: skirt("R"),
  [REGION.bootL]: byHeight(bootKeys("L")),
  [REGION.bootR]: byHeight(bootKeys("R")),
};

export function resolveRegions(g: GeometryData) {
  const f32 = new Float32Array(g.data);
  const u8 = new Uint8Array(g.data);
  for (let i = 0; i < g.vertexCount; i++) {
    const o = i * VERTEX_STRIDE;
    const resolve = RESOLVE[u8[o + 20]];
    if (!resolve) {
      if (u8[o + 20] >= BONE_NAMES.length) throw new Error(`Unknown bone ${u8[o + 20]}`);
      continue;
    }
    const [a, c, w] = resolve(f32[i * 6], f32[i * 6 + 1], f32[i * 6 + 2]);
    u8[o + 20] = bone(a);
    u8[o + 21] = bone(c);
    u8[o + 22] = Math.round(w * 255);
  }
}
