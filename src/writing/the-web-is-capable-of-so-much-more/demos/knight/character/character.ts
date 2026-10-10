import { GeometryBuilder, VERTEX_STRIDE, type GeometryData } from "../engine/geometry";
import { buildArms } from "./arms";
import { buildHead } from "./head";
import { buildLegs } from "./legs";
import { buildTorso } from "./torso";
import { buildScabbard } from "./weapon";
import { ARM, JOINT, LEG, bone, boneDefs, resolveRegions } from "./rig";
import type { CharacterAsset, CharacterDims } from "../core/types";

// The player: a Zelda-style toon knight, about 5 helms tall. Rounded forms throughout (an egg-shaped
// closed helm with a plume, a barrel cuirass, capsule limbs, mitten fists, soft boots) in dark
// armour: blackened steel with silver edges over a near-black gambeson and tunic. Modelled
// procedurally and rigidly skinned, apart from cloth that blends across hips, knees, ankles and
// shoulders. One buffer, one draw call.
export function buildCharacter(): CharacterAsset {
  const b = new GeometryBuilder();
  buildLegs(b);
  buildTorso(b);
  buildArms(b);
  buildHead(b);
  buildScabbard(b);
  const geometry = b.build();
  resolveRegions(geometry);

  const dims: CharacterDims = {
    height: Math.round(topWithout(geometry, bone("accessory")) * 1000) / 1000,
    hipHeight: JOINT.pelvis[1],
    hipWidth: JOINT.thighL[0] - JOINT.thighR[0],
    thighLength: LEG.thigh,
    shinLength: LEG.shin,
    ankleHeight: JOINT.footL[1],
    toeLength: 0.22,
    heelLength: 0.1,
    shoulderWidth: JOINT.upperArmL[0] - JOINT.upperArmR[0],
    upperArmLength: ARM.upper,
    foreArmLength: ARM.fore,
    radius: 0.26,
  };
  return { geometry, bones: boneDefs(), dims };
}

// Highest vertex not carried by `skip` (the plume bobs above the helm and is not part of the body).
function topWithout(g: GeometryData, skip: number) {
  const f32 = new Float32Array(g.data);
  const u8 = new Uint8Array(g.data);
  let top = 0;
  for (let i = 0; i < g.vertexCount; i++) {
    if (u8[i * VERTEX_STRIDE + 20] !== skip) top = Math.max(top, f32[i * 6 + 1]);
  }
  return top;
}
