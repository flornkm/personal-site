import { buildCharacter } from "./character/character";
import { JOINT } from "./character/rig";
import { SHIELD_BACK, SWORD_BACK, buildShield, buildSword, mountMatrix } from "./character/weapon";
import { GeometryBuilder, VERTEX_STRIDE, type GeometryData } from "./engine/geometry";
import { mat4, type Mat4 } from "./engine/math";
import { buildHorse } from "./horse/model";
import { buildClub, buildGoblin, goblinBones, type GoblinLook } from "./monsters/goblin-model";

// The figure shows each model as the game builds it, in its bind pose, on a little grass plinth.
// Weapons are separate meshes in the game (they move between hand and back); here they are baked
// into the body where the game stows them, so every model is one buffer and one draw call.

export type ModelName = "knight" | "goblin" | "horse";

export interface Model {
  geometry: GeometryData;
  // Where the soft contact shadow sits on the plinth, in model space: centre x, z and radii x, z.
  shadow: [number, number, number, number];
}

// The red grunt from monsters/goblin.ts.
const GOBLIN: GoblinLook = {
  scale: 1,
  girth: 1,
  skin: 0xc95b4d,
  belly: 0xe2b08c,
  snout: 0xdd8b7d,
  eye: 0xf2e292,
  pupil: 0x1e1420,
  brow: 0x4a1d1d,
  horn: 0xe9e0cc,
  horns: 1,
  cloth: 0x6e4428,
  belt: 0x3a2418,
  club: { length: 0.62, head: 0.075, wood: 0x936539, band: 0x4f321d },
};

const PLINTH = { top: 0x6f8f45, side: 0x56402c };

export function buildModel(name: ModelName): Model {
  if (name === "knight") {
    const chest = JOINT.chest;
    return {
      geometry: merge([
        [buildCharacter().geometry],
        [buildSword(), mounted(chest, mountMatrix(mat4.create(), SWORD_BACK))],
        [buildShield(), mounted(chest, mountMatrix(mat4.create(), SHIELD_BACK))],
        [plinth(0.62)],
      ]),
      shadow: [0, 0.02, 0.36, 0.3],
    };
  }
  if (name === "goblin") {
    // Same grip as monsters/humanoid.ts: the club in the right fist, pointing forward and down.
    const grip = mountMatrix(mat4.create(), {
      bone: "handR",
      offset: [0, -0.05, 0.015],
      pitch: 2.3,
      yaw: 0,
      roll: 0,
    });
    return {
      geometry: merge([
        [buildGoblin(GOBLIN)],
        [buildClub(GOBLIN), mounted(jointOf(goblinBones(1), "handR"), grip)],
        [plinth(0.7)],
      ]),
      shadow: [0, 0.03, 0.42, 0.32],
    };
  }
  return {
    geometry: merge([[buildHorse()], [plinth(1.5)]]),
    shadow: [0, 0.2, 0.42, 1.25],
  };
}

function jointOf(bones: { name: string; parent: number; offset: number[] }[], name: string) {
  let i = bones.findIndex((b) => b.name === name);
  const p = [0, 0, 0];
  while (i >= 0) {
    for (let k = 0; k < 3; k++) p[k] += bones[i].offset[k];
    i = bones[i].parent;
  }
  return p;
}

function mounted(joint: ArrayLike<number>, mount: Mat4) {
  const m = mat4.identity(mat4.create());
  m[12] = joint[0];
  m[13] = joint[1];
  m[14] = joint[2];
  return mat4.multiply(m, m, mount);
}

// A low grass drum the model stands on, its top just below the soles.
function plinth(radius: number) {
  const b = new GeometryBuilder();
  b.push().translate(0, -0.07, 0).color(PLINTH.side);
  b.cylinder(radius, radius * 0.96, 0.14, 40, false);
  b.pop();
  b.push().translate(0, -0.001, 0).color(PLINTH.top);
  b.cylinder(radius, radius, 0.002, 40, true);
  b.pop();
  return b.build();
}

// Concatenates meshes into one buffer, moving positions and normals through each part's matrix.
function merge(parts: ([GeometryData] | [GeometryData, Mat4])[]): GeometryData {
  const total = parts.reduce((n, [g]) => n + g.vertexCount, 0);
  const data = new ArrayBuffer(total * VERTEX_STRIDE);
  const out = new Uint8Array(data);
  const f32 = new Float32Array(data);
  const i8 = new Int8Array(data);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let at = 0;
  for (const [g, m] of parts) {
    out.set(new Uint8Array(g.data, 0, g.vertexCount * VERTEX_STRIDE), at * VERTEX_STRIDE);
    for (let i = at; i < at + g.vertexCount; i++) {
      const f = i * 6;
      const o = i * VERTEX_STRIDE;
      if (m) {
        const [x, y, z] = [f32[f], f32[f + 1], f32[f + 2]];
        f32[f] = m[0] * x + m[4] * y + m[8] * z + m[12];
        f32[f + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        f32[f + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        const [nx, ny, nz] = [i8[o + 12], i8[o + 13], i8[o + 14]];
        const tx = m[0] * nx + m[4] * ny + m[8] * nz;
        const ty = m[1] * nx + m[5] * ny + m[9] * nz;
        const tz = m[2] * nx + m[6] * ny + m[10] * nz;
        const l = Math.hypot(tx, ty, tz) || 1;
        i8[o + 12] = Math.round((tx / l) * 127);
        i8[o + 13] = Math.round((ty / l) * 127);
        i8[o + 14] = Math.round((tz / l) * 127);
      }
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], f32[f + k]);
        max[k] = Math.max(max[k], f32[f + k]);
      }
    }
    at += g.vertexCount;
  }
  const center: [number, number, number] = [0, 1, 2].map((k) => (min[k] + max[k]) / 2) as [
    number,
    number,
    number,
  ];
  let radius = 0;
  for (let i = 0; i < total; i++) {
    const f = i * 6;
    radius = Math.max(
      radius,
      Math.hypot(f32[f] - center[0], f32[f + 1] - center[1], f32[f + 2] - center[2]),
    );
  }
  return { data, vertexCount: total, bounds: { min, max, center, radius } };
}
