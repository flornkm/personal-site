import * as THREE from "three";
import { frame, gem, pillow } from "./models-decor";
import { crtTv, laptop, phone } from "./models-electronics";
import { curledSheet, foldedSheet, record } from "./models-genuine";
import { CHAT_BASES, chatFoamTint } from "./paint-decor";
import type { PoofStyle } from "./effects";
import type { ShardKind } from "./shards";
import type { SfxName } from "./sounds";
import { createPs2Material } from "./ps2-material";
import type { TextureLibrary } from "./textures";

export type ItemKind =
  | "video"
  | "post"
  | "code"
  | "image"
  | "chat"
  | "sparkle"
  | "drawing"
  | "letter"
  | "vinyl";

export interface ItemDef {
  kind: ItemKind;
  // Genuine things are the bombs: made by a person, and slicing one ends the run.
  genuine: boolean;
  geometry: THREE.BufferGeometry;
  // Indexed by the geometry's groups; the slicer adds cut faces as group CAP.
  materials: THREE.Material[];
  // Nominal size in world units (most of the front silhouette's half-diagonal): scales the
  // effects, and hitTest biases it per kind.
  radius: number;
  // The puff of smoke a cut leaves, by what the thing is made of.
  poof: { style: PoofStyle; tint: THREE.Color };
  // The chunks and the sound a cut throws out, by what it's made of.
  shards: ShardKind;
  impact: SfxName | null;
  capUvScale: number;
}

export const CAP = 6;

// Every prop's geometry, by the aspect of the face it carries; exported so the slicer tests run
// against the real models.
export const propGeometry = {
  tv: crtTv,
  phone,
  laptop,
  frame,
  pillow: (aspect: number) => pillow(2.6, 2.6 / aspect),
  gem,
  record,
  curledSheet,
  foldedSheet,
};

// What a cut throws out, by what the thing is made of: the poof, the debris and the sound.
const MATTER = {
  electronics: { poof: { style: "sparks", tint: "#a6abb3" }, shards: "electronics", impact: "zap" },
  wood: { poof: { style: "dust", tint: "#e8d3ad" }, shards: "wood", impact: "crack" },
  foam: { poof: { style: "dust", tint: "#f1f5ff" }, shards: "foam", impact: "pop" },
  crystal: { poof: { style: "dust", tint: "#e4d8ff" }, shards: "crystal", impact: "tink" },
  paper: { poof: { style: "dust", tint: "#ffffff" }, shards: "paper", impact: null },
  vinyl: { poof: { style: "dust", tint: "#6b6e74" }, shards: "vinyl", impact: null },
} satisfies Record<
  string,
  { poof: { style: PoofStyle; tint: string }; shards: ShardKind; impact: SfxName | null }
>;

interface Inside {
  // The cut face's skin and how it catches the light.
  cut: THREE.Texture;
  tint?: THREE.ColorRepresentation;
  specular?: number;
  matter: (typeof MATTER)[keyof typeof MATTER];
}

export function createItemDefs(lib: TextureLibrary) {
  const defs: ItemDef[] = [];
  const plastic = (map: THREE.Texture, specular = 0.3) =>
    createPs2Material({ map, specular, shininess: 18 });
  const matte = (map: THREE.Texture) => createPs2Material({ map });

  const caps = new Map<string, THREE.Material>();
  const capMaterial = ({ cut, tint = 0xffffff, specular = 0.2 }: Inside) => {
    const key = `${cut.uuid}|${new THREE.Color(tint).getHexString()}|${specular}`;
    let material = caps.get(key);
    if (!material) {
      material = createPs2Material({ map: cut, color: tint, specular, shininess: 22 });
      caps.set(key, material);
    }
    return material;
  };

  const add = (
    kind: ItemKind,
    geometry: THREE.BufferGeometry,
    slots: THREE.Material[],
    inside: Inside,
    genuine = false,
  ) => {
    const box = geometry.boundingBox ?? new THREE.Box3();
    const w = box.max.x - box.min.x;
    const h = box.max.y - box.min.y;
    const materials = Array.from({ length: CAP }, (_, i) => slots[i] ?? slots[slots.length - 1]);
    materials.push(capMaterial(inside));
    defs.push({
      kind,
      genuine,
      geometry,
      materials,
      radius: Math.hypot(w, h) * 0.41,
      poof: { style: inside.matter.poof.style, tint: new THREE.Color(inside.matter.poof.tint) },
      shards: inside.matter.shards,
      impact: inside.matter.impact,
      // One cut tile spans about 1.33x the prop: no visible repeat, features near 1.5 texels/px.
      capUvScale: 0.75 / Math.max(w, h),
    });
  };

  // Electronics: slot 0 the screen, 1-3 body skins, 4 and 5 the trim sheet matte and glossy.
  const e = lib.electronics;
  const screen = (map: THREE.Texture) => createPs2Material({ map, specular: 0.25, shininess: 40 });
  const trim = [plastic(e.trim, 0.15), plastic(e.trim, 0.5)];
  // Low specular: a flat cap catching the highlight would wash the dark cavity out to grey.
  const crt: Inside = { cut: e.cuts.crt, specular: 0.1, matter: MATTER.electronics };

  const tvGeometry = crtTv();
  const tvBody = [plastic(e.tv.bezel, 0.25), plastic(e.tv.casing, 0.18), plastic(e.tv.back, 0.12)];
  for (const map of e.tv.screens) add("video", tvGeometry, [screen(map), ...tvBody, ...trim], crt);

  const phoneGeometry = phone();
  const rail = plastic(e.phone.rail, 0.3);
  const caseBody = [rail, rail, plastic(e.phone.back, 0.3)];
  const battery: Inside = { ...crt, cut: e.cuts.battery };
  for (const map of e.phone.screens) {
    add("post", phoneGeometry, [screen(map), ...caseBody, ...trim], battery);
  }

  const laptopGeometry = laptop();
  const laptopBody = [
    plastic(e.laptop.deck, 0.2),
    plastic(e.laptop.body, 0.35),
    plastic(e.laptop.lid, 0.35),
  ];
  // Its caps are thin strips: a laptop's own guts, no CRT copper to read as wood grain.
  const laptopInside: Inside = { ...crt, cut: e.cuts.laptop };
  for (const map of e.laptop.screens) {
    add("code", laptopGeometry, [screen(map), ...laptopBody, ...trim], laptopInside);
  }

  // Frame: picture, gold moulding strip, raw back, rosettes and crest, brass hanger. Cheap frames
  // are polystyrene inside the gilt.
  // Gilt keeps its shine in the paint: a strong or broad white specular washes the gold tan.
  const gilt = (map: THREE.Texture) => createPs2Material({ map, specular: 0.18, shininess: 28 });
  const moulding = gilt(lib.decor.frameGold);
  const ornament = gilt(lib.decor.frameOrnament);
  const brass = plastic(lib.decor.trim, 0.5);
  // Nearly matte, or the lit bead tone washes out to white on a white page.
  const polystyrene: Inside = {
    cut: lib.decor.cutPolystyrene,
    specular: 0.05,
    matter: MATTER.foam,
  };
  for (const f of lib.image) {
    const faces = [matte(f.front), moulding, matte(f.back), ornament, brass];
    add("image", frame(f.aspect), faces, polystyrene);
  }

  // Chat: front, back (typing-dot buttons), seam piping tinted to the bubble, care tag.
  const tag = matte(lib.decor.trim);
  lib.chat.forEach((f, i) => {
    const seam = createPs2Material({
      map: lib.decor.chatSeam,
      color: CHAT_BASES[i % CHAT_BASES.length],
      specular: 0.35,
      shininess: 18,
    });
    const faces = [plastic(f.front, 0.4), plastic(f.back, 0.4), seam, tag];
    const foam: Inside = { cut: lib.decor.cutFoam, tint: chatFoamTint(i), matter: MATTER.foam };
    add("chat", propGeometry.pillow(f.aspect), faces, foam);
  });

  // A tight, modest highlight: a broad or strong one washes the facets' saturation out.
  const facets = [lib.sparkle.front, lib.sparkle.back, lib.decor.gemGirdle].map((map) =>
    createPs2Material({ map, specular: 0.3, shininess: 36 }),
  );
  const crystal: Inside = { cut: lib.decor.cutCrystal, specular: 0.6, matter: MATTER.crystal };
  add("sparkle", gem(), facets, crystal);

  // Paper is tinted warm so the curls turned away from the key go warm grey, not cold.
  const sheet = (map: THREE.Texture) => createPs2Material({ map, color: "#fffaf0" });
  const paper = sheet(lib.side.paper);
  const pulp: Inside = { cut: lib.cuts.paper, specular: 0, matter: MATTER.paper };
  const magnet = [
    createPs2Material({ map: lib.genuine.magnetFace, specular: 0.55, shininess: 30 }),
    plastic(lib.genuine.magnetSide, 0.4),
  ];
  const drawing = [sheet(lib.drawing.front), sheet(lib.drawing.back), paper, ...magnet];
  add("drawing", curledSheet(lib.drawing.aspect), drawing, pulp, true);
  const wax = createPs2Material({ map: lib.genuine.wax, specular: 0.35, shininess: 24 });
  const letter = [sheet(lib.letter.front), sheet(lib.letter.back), paper, wax];
  add("letter", foldedSheet(lib.letter.aspect), letter, pulp, true);
  // A record face is one big plane, so a per-vertex highlight lights it all at once and the disc
  // flashes flat grey: keep it to a dark glint and let the painted bow-tie sheen carry the gloss.
  // The thin rim stays glossy for silhouette pop.
  const vinylFace = (map: THREE.Texture) =>
    createPs2Material({ map, specular: 0.1, shininess: 60 });
  const vinyl = [
    vinylFace(lib.vinyl.front),
    vinylFace(lib.vinyl.back),
    plastic(lib.side.vinyl, 0.45),
  ];
  const pvc: Inside = { cut: lib.cuts.vinyl, specular: 0.25, matter: MATTER.vinyl };
  add("vinyl", record(), vinyl, pvc, true);

  return defs;
}

export function disposeItemDefs(defs: ItemDef[]) {
  const materials = new Set<THREE.Material>();
  for (const def of defs) {
    def.geometry.dispose();
    for (const m of def.materials) materials.add(m);
  }
  for (const m of materials) m.dispose();
}
