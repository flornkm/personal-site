import type { GeometryBuilder } from "../engine/geometry";
import { JOINT, REGION, bone } from "./rig";
import { COLOR, GLOSS, rgb } from "./palette";
import {
  capsule,
  ellipsoid,
  mix,
  range,
  sectionPoint,
  shell,
  smooth,
  surface,
  sweep,
  tube,
  type Section,
  type V3,
} from "./shapes";

type Side = 1 | -1;
const SIDES: Side[] = [1, -1];
const sideName = (s: Side) => (s === 1 ? "L" : "R");
const LAME_GLOSS = GLOSS.steel * 0.6;

// Puffy gambeson sleeve from under the pauldron to a round elbow.
function sleeve(b: GeometryBuilder, s: Side, x: number) {
  b.bone(REGION[`arm${sideName(s)}`]).color(COLOR.cloth);
  tube(
    b,
    [
      { y: 1.04, rx: 0.048, zf: 0.05, x },
      { y: 1.09, rx: 0.053, zf: 0.055, x },
      { y: 1.19, rx: 0.062, zf: 0.064, x },
      { y: 1.29, rx: 0.066, zf: 0.068, x: x - s * 0.002 },
      { y: 1.355, rx: 0.062, zf: 0.064, x: x - s * 0.006 },
    ],
    { capBottom: 0.04, capTop: 0.028, segments: 18 },
  );
}

// Spaulder: a low dome over the shoulder that stops short of the neck, with a silver rolled rim,
// and two overlapping lames wrapping the outside of the upper arm. Rigid on the upper arm.
function pauldron(b: GeometryBuilder, s: Side, x: number) {
  b.bone(bone(`upperArm${sideName(s)}`));
  const c: V3 = [x + s * 0.014, 1.346, -0.004];
  const r: V3 = [0.1, 0.06, 0.11];
  // Lowest latitude by angle around: down over the outside of the shoulder, short toward the neck.
  const phiMin = (th: number) => {
    const inner = (1 - s * Math.sin(th)) / 2;
    return -0.2 + 0.75 * inner ** 1.6;
  };
  const at = (th: number, k: number, grow: number): V3 => {
    const ph = phiMin(th) + (Math.PI / 2 - phiMin(th)) * k;
    return [
      c[0] + (r[0] + grow) * Math.cos(ph) * Math.sin(th),
      c[1] + (r[1] + grow) * Math.sin(ph),
      c[2] + (r[2] + grow) * Math.cos(ph) * Math.cos(th),
    ];
  };
  const ths = range(-Math.PI, Math.PI, 24);
  // Matte like the helm, fading up to a lighter steel on top: the sky reflected in the dome.
  const lo = rgb(COLOR.steel),
    hi = rgb(COLOR.steelLight);
  b.color(COLOR.steel, GLOSS.dome);
  surface(b, ths, range(0, 1, 8), (th, k) => at(th, k, 0), {
    closedU: true,
    tint: (_th, k) => {
      const f = smooth(0.25, 0.95, k);
      return [
        lo[0] + (hi[0] - lo[0]) * f,
        lo[1] + (hi[1] - lo[1]) * f,
        lo[2] + (hi[2] - lo[2]) * f,
      ];
    },
  });
  b.color(COLOR.steelInside);
  surface(b, ths, range(0, 1, 4), (th, k) => at(th, k, -0.01), { closedU: true, flip: true });
  b.color(COLOR.silver, GLOSS.silver);
  surface(b, ths, [0, 0.5, 1], (th, v) => mix(at(th, 0, 0.005), at(th, 0, -0.012), v), {
    closedU: true,
    flip: true,
  });

  // Lames: open cones around the arm's outer side, each tucked under the one above. Less glossy
  // than the bracers: stacked, their streaks line up into one white bar.
  const ax = x + s * 0.004;
  const mid = s === 1 ? 0.25 : 0.75;
  for (const [i, top] of [1.33, 1.284].entries()) {
    const r0 = 0.086 - 0.005 * i;
    const ring = (y: number, rr: number): Section => ({ y, rx: rr, zf: rr * 1.06, x: ax });
    b.color(COLOR.steel, LAME_GLOSS);
    shell(b, [ring(top - 0.062, r0 + 0.008), ring(top - 0.052, r0 + 0.0075), ring(top, r0)], {
      from: mid - 0.33,
      to: mid + 0.33,
      segments: 22,
      thick: 0.007,
      inside: COLOR.steelInside,
      edge: COLOR.steelDark,
      gloss: LAME_GLOSS,
      paint: (_t, y) => (y < top - 0.052 ? COLOR.steelLight : COLOR.steel),
    });
  }
}

const BRACER: Section[] = [
  { y: 0.84, rx: 0.049, zf: 0.051 },
  { y: 0.85, rx: 0.05, zf: 0.052 },
  { y: 0.862, rx: 0.049, zf: 0.051 },
  { y: 0.94, rx: 0.052, zf: 0.054 },
  { y: 1.008, rx: 0.056, zf: 0.058 },
  { y: 1.02, rx: 0.057, zf: 0.059 },
  { y: 1.032, rx: 0.056, zf: 0.058 },
];

function bracerAt(y: number, x: number): Section {
  let i = 0;
  while (i < BRACER.length - 2 && BRACER[i + 1].y < y) i++;
  const a = BRACER[i],
    c = BRACER[i + 1];
  const k = Math.max(0, Math.min(1, (y - a.y) / (c.y - a.y)));
  return { y, rx: a.rx + (c.rx - a.rx) * k, zf: a.zf + (c.zf - a.zf) * k, x };
}

// Blackened steel bracer from the elbow to the wrist, closed at both ends so no gap ever shows
// through it, and a couter on the elbow with a painted crescent glint along its top.
function vambrace(b: GeometryBuilder, s: Side, x: number) {
  const n = sideName(s);
  b.bone(bone(`foreArm${n}`));
  tube(
    b,
    BRACER.map((r): Section => ({ y: r.y, rx: r.rx, zf: r.zf, x })),
    {
      segments: 18,
      capTop: 0.012,
      capBottom: 0.01,
      capSteps: 2,
      gloss: GLOSS.steel,
      // The rolled top and its cap are a small dome: matte, or its glint is a white dot.
      paint: (_t, y) => (y > 1.008 ? ([COLOR.steelLight, GLOSS.dome] as const) : COLOR.steel),
    },
  );
  b.bone(bone(`upperArm${n}`));
  ellipsoid(b, [x, JOINT[`foreArm${n}`][1] + 0.004, -0.03], [0.05, 0.05, 0.038], {
    segments: 14,
    rings: 8,
    paint: (th, ph) =>
      ph > 0.45 && ph < 0.95 && Math.cos(th) < -0.35 ? COLOR.steelGlint : COLOR.steel,
  });
}

// Leather gauntlet: a soft bell-shaped cuff over the bracer with a rolled rim, closed onto the
// bracer at the top and onto the wrist at the bottom, and an armoured mitten fist (palm toward the
// thigh, knuckles facing out) with a thumb wrapped over the front and a dark steel plate over the
// back of the hand. A dark ball at the wrist fills the cuff's mouth however the hand bends.
function glove(b: GeometryBuilder, s: Side, x: number) {
  const n = sideName(s);
  const wr = JOINT[`hand${n}`][1];
  b.bone(bone(`foreArm${n}`)).color(COLOR.leather, GLOSS.leather);
  const cuff: Section[] = [
    { y: wr - 0.012, rx: 0.044, zf: 0.046, x },
    { y: wr + 0.012, rx: 0.047, zf: 0.049, x },
    { y: wr + 0.034, rx: 0.052, zf: 0.054, x },
    { y: wr + 0.052, rx: 0.057, zf: 0.059, x },
  ].map((c): Section => Object.assign(c, { n: 2.2 }));
  shell(b, cuff, {
    thick: 0.006,
    inside: COLOR.leatherDark,
    edge: COLOR.leatherDark,
    rimBottom: true,
    segments: 20,
  });
  // Close the cuff's top onto the bracer it is pulled over.
  const top = cuff[cuff.length - 1];
  const under = bracerAt(top.y, x);
  b.color(COLOR.leatherDark);
  surface(b, range(0, 1, 20), [0, 1], (t, k) =>
    mix(sectionPoint(top, t), sectionPoint({ ...under, y: top.y + 0.004 }, t), k),
  );
  const lip = { ...top };
  lip.rx -= 0.003;
  lip.zf -= 0.003;
  b.color(COLOR.leatherLight, GLOSS.leather);
  sweep(
    b,
    range(0, 1, 24)
      .slice(0, -1)
      .map((t) => sectionPoint(lip, t)),
    () => 0.0045,
    { closed: true, segments: 8 },
  );

  b.bone(bone(`hand${n}`)).color(COLOR.leatherDark);
  ellipsoid(b, [x, wr - 0.004, 0.002], [0.036, 0.03, 0.038], { segments: 14, rings: 8 });
  b.color(COLOR.leather, GLOSS.leather);
  const fx = x + s * 0.003;
  tube(
    b,
    [
      { y: wr - 0.012, rx: 0.034, zf: 0.04, zb: 0.038, x: fx, z: 0.002 },
      { y: wr - 0.036, rx: 0.039, zf: 0.05, zb: 0.044, x: fx, z: 0.004 },
      { y: wr - 0.064, rx: 0.042, zf: 0.055, zb: 0.047, x: fx, z: 0.006 },
      { y: wr - 0.084, rx: 0.04, zf: 0.05, zb: 0.044, x: fx, z: 0.006 },
    ].map((c): Section => Object.assign(c, { n: 2.5 })),
    { segments: 18, capTop: 0.01, capBottom: 0.022, capSteps: 3 },
  );
  // Thumb: from the heel of the palm round over the front of the curled fingers.
  b.color(COLOR.leatherLight, GLOSS.leather);
  capsule(
    b,
    [x - s * 0.03, wr - 0.024, 0.024],
    [x - s * 0.032, wr - 0.05, 0.048],
    0.016,
    0.015,
    10,
  );
  capsule(
    b,
    [x - s * 0.032, wr - 0.05, 0.048],
    [x - s * 0.016, wr - 0.064, 0.058],
    0.015,
    0.013,
    10,
  );
  // Knuckle plate over the back of the hand.
  b.color(COLOR.steelDark);
  b.push()
    .translate(fx + s * 0.03, wr - 0.052, 0.008)
    .rotateZ(s * 0.12);
  ellipsoid(b, [0, 0, 0], [0.018, 0.034, 0.046], { segments: 16, rings: 8 });
  b.pop();
}

export function buildArms(b: GeometryBuilder) {
  for (const s of SIDES) {
    const x = JOINT[`upperArm${sideName(s)}`][0];
    sleeve(b, s, x);
    vambrace(b, s, x);
    glove(b, s, x);
    pauldron(b, s, x);
  }
}
