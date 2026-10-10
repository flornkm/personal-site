import { mat4, quat, type Mat4, type Quat, type Vec3 } from "./math";

export interface BoneDef {
  name: string;
  // Index of the parent bone, or -1 for the root. Parents must come before their children.
  parent: number;
  // Joint position relative to the parent joint in the bind pose (all bind rotations are identity,
  // so every bone's axes line up with the model's: +Y up, +Z forward, +X to the character's left).
  offset: [number, number, number];
}

// A flat, cache-friendly joint hierarchy. Animation writes local rotations (and positions for
// bones that translate, like the pelvis); update() turns them into the skinning palette.
export class Skeleton {
  readonly defs: BoneDef[];
  readonly count: number;
  readonly positions: Float32Array;
  readonly rotations: Float32Array;
  readonly scales: Float32Array;
  readonly world: Float32Array;
  readonly palette: Float32Array;
  // Placement of the whole skeleton in the world (position and facing).
  readonly rootMatrix = mat4.create();
  private invBind: Float32Array;
  private posViews: Vec3[];
  private rotViews: Quat[];
  private scaleViews: Vec3[];
  private worldViews: Mat4[];
  private paletteViews: Mat4[];
  private invBindViews: Mat4[];
  private local = mat4.create();
  private byName = new Map<string, number>();

  constructor(defs: BoneDef[]) {
    this.defs = defs;
    const n = defs.length;
    this.count = n;
    this.positions = new Float32Array(n * 3);
    this.rotations = new Float32Array(n * 4);
    this.scales = new Float32Array(n * 3).fill(1);
    this.world = new Float32Array(n * 16);
    this.palette = new Float32Array(n * 16);
    this.invBind = new Float32Array(n * 16);
    this.posViews = defs.map((_, i) => this.positions.subarray(i * 3, i * 3 + 3));
    this.rotViews = defs.map((_, i) => this.rotations.subarray(i * 4, i * 4 + 4));
    this.scaleViews = defs.map((_, i) => this.scales.subarray(i * 3, i * 3 + 3));
    this.worldViews = defs.map((_, i) => this.world.subarray(i * 16, i * 16 + 16));
    this.paletteViews = defs.map((_, i) => this.palette.subarray(i * 16, i * 16 + 16));
    this.invBindViews = defs.map((_, i) => this.invBind.subarray(i * 16, i * 16 + 16));
    defs.forEach((d, i) => {
      if (d.parent >= i) throw new Error(`Bone ${d.name} must come after its parent`);
      this.byName.set(d.name, i);
    });
    // Bind pose: translations only, so the inverse bind is a negative translation.
    const bindWorld: [number, number, number][] = [];
    defs.forEach((d, i) => {
      const p = d.parent >= 0 ? bindWorld[d.parent] : [0, 0, 0];
      bindWorld.push([p[0] + d.offset[0], p[1] + d.offset[1], p[2] + d.offset[2]]);
      const inv = this.invBindViews[i];
      mat4.identity(inv);
      inv[12] = -bindWorld[i][0];
      inv[13] = -bindWorld[i][1];
      inv[14] = -bindWorld[i][2];
    });
    this.reset();
  }

  index(name: string) {
    const i = this.byName.get(name);
    if (i === undefined) throw new Error(`No bone named ${name}`);
    return i;
  }

  // Live views into the pose arrays; writing them poses the bone.
  pos(i: number) {
    return this.posViews[i];
  }
  rot(i: number) {
    return this.rotViews[i];
  }
  scale(i: number) {
    return this.scaleViews[i];
  }
  worldMatrix(i: number) {
    return this.worldViews[i];
  }

  // World position of a joint after the last update().
  worldPosition(i: number, out: Vec3) {
    const m = this.worldViews[i];
    out[0] = m[12];
    out[1] = m[13];
    out[2] = m[14];
    return out;
  }

  reset() {
    this.defs.forEach((d, i) => {
      this.posViews[i].set(d.offset);
      quat.identity(this.rotViews[i]);
      this.scaleViews[i].fill(1);
    });
  }

  update() {
    for (let i = 0; i < this.count; i++) {
      const parent = this.defs[i].parent;
      mat4.fromRotationTranslationScale(
        this.local,
        this.rotViews[i],
        this.posViews[i],
        this.scaleViews[i],
      );
      const w = this.worldViews[i];
      mat4.multiply(w, parent >= 0 ? this.worldViews[parent] : this.rootMatrix, this.local);
      mat4.multiply(this.paletteViews[i], w, this.invBindViews[i]);
    }
  }
}
