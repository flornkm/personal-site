import * as THREE from "three";
import { ASSET_BASE } from "./assets";

// The hit effect: a PS2-style "poof". One animated smoke burst plays its sprite sheet where the
// blade crossed, a handful of loose puffs billow outward and fade, and glints pop at the edges —
// all camera-facing billboards, pooled so a frantic swipe never allocates.

// Sheet layouts as generated: the burst is 8 frames in a row, the glints 4 in a row. Loose puffs
// reuse the burst's fuller middle frames, so every cloud shares the same crisp drawn edge.
const SHEETS = {
  poof: { file: "fx-poof.webp", cols: 8, rows: 1 },
  glints: { file: "fx-glints.webp", cols: 4, rows: 1 },
} as const;
const PUFF_TILES = [1, 2, 3, 4];

type SheetName = keyof typeof SHEETS;

export type PoofStyle = "dust" | "sparks";

interface Particle {
  sprite: THREE.Sprite;
  sheet: SheetName;
  // A fixed tile, or -1 to play the sheet through over the particle's life.
  tile: number;
  age: number;
  life: number;
  vel: THREE.Vector3;
  drag: number;
  gravity: number;
  spin: number;
  from: number;
  to: number;
  opacity: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (t: number) => 1 - (1 - t) ** 2;

export async function createPoofs(scene: THREE.Scene) {
  const loader = new THREE.TextureLoader();
  const entries = await Promise.all(
    (Object.keys(SHEETS) as SheetName[]).map(async (name) => {
      const texture = await loader.loadAsync(`${ASSET_BASE}/${SHEETS[name].file}`);
      texture.colorSpace = THREE.SRGBColorSpace;
      return [name, texture] as const;
    }),
  );
  const textures = Object.fromEntries(entries) as Record<SheetName, THREE.Texture>;

  const live: Particle[] = [];
  let dark = false;
  // Glints: orange for electrical sparks; for dust, warm white on dark and gold on white, where a
  // white core would vanish.
  const SPARK = new THREE.Color("#ffab3d");
  const GLINT = { light: new THREE.Color("#f2b632"), dark: new THREE.Color("#fff6dc") };
  const spare: THREE.Sprite[] = [];

  // Each sprite owns a clone of its sheet's texture (sharing the uploaded image) so it can show
  // its own tile through offset/repeat.
  function emit(sheet: SheetName, at: THREE.Vector3, p: Partial<Particle> & { life: number }) {
    const sprite =
      spare.pop() ??
      new THREE.Sprite(
        new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }),
      );
    const { cols, rows } = SHEETS[sheet];
    const material = sprite.material;
    if (material.map?.source !== textures[sheet].source) {
      material.map?.dispose();
      material.map = textures[sheet].clone();
      material.map.repeat.set(1 / cols, 1 / rows);
      material.needsUpdate = true;
    }
    material.color.set(0xffffff);
    material.rotation = rand(0, Math.PI * 2);
    sprite.position.copy(at);
    sprite.renderOrder = 3;
    scene.add(sprite);
    const particle: Particle = {
      sprite,
      sheet,
      tile: -1,
      age: 0,
      vel: new THREE.Vector3(),
      drag: 2.5,
      gravity: 0,
      spin: 0,
      from: 1,
      to: 1,
      opacity: 1,
      ...p,
    };
    live.push(particle);
    showTile(particle, particle.tile < 0 ? 0 : particle.tile);
    return particle;
  }

  function showTile(p: Particle, tile: number) {
    const { cols, rows } = SHEETS[p.sheet];
    const map = p.sprite.material.map;
    if (!map) return;
    const col = tile % cols;
    const row = Math.floor(tile / cols);
    // Rows count down from the top of the image; texture v counts up from the bottom.
    map.offset.set(col / cols, 1 - (row + 1) / rows);
  }

  // `radius` is the item's on-screen size; `dir` the swipe direction, which the puffs lean along.
  function burst(
    at: THREE.Vector3,
    radius: number,
    style: PoofStyle,
    tint: THREE.Color,
    dir: THREE.Vector3,
  ) {
    // Kept small and quick so it marks the hit without hiding the next piece of slop.
    const front = at.clone().setZ(at.z + 0.9);
    const main = emit("poof", front, {
      life: 0.34,
      from: radius * 0.7,
      to: radius * 1.25,
      drag: 0,
      opacity: 0.7,
    });
    main.sprite.material.color.copy(tint);

    const puffs = style === "sparks" ? 2 : 3;
    for (let i = 0; i < puffs; i++) {
      const angle = rand(0, Math.PI * 2);
      const out = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0)
        .addScaledVector(dir, rand(-0.6, 0.6))
        .multiplyScalar(rand(1.2, 2.2));
      const puff = emit("poof", front.clone().addScaledVector(out, 0.15), {
        tile: PUFF_TILES[Math.floor(rand(0, PUFF_TILES.length))],
        life: rand(0.32, 0.45),
        vel: out,
        drag: 3,
        gravity: -0.3,
        spin: rand(-1.5, 1.5),
        from: radius * rand(0.18, 0.28),
        to: radius * rand(0.35, 0.5),
        opacity: 0.65,
      });
      puff.sprite.material.color.copy(tint);
    }

    const glints = style === "sparks" ? 4 : 2;
    const glintColor = style === "sparks" ? SPARK : dark ? GLINT.dark : GLINT.light;
    for (let i = 0; i < glints; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = style === "sparks" ? rand(3.5, 6) : rand(1, 2);
      const glint = emit("glints", front.clone().setZ(front.z + 0.05), {
        tile: Math.floor(rand(0, 4)),
        life: style === "sparks" ? rand(0.2, 0.32) : rand(0.16, 0.24),
        vel: new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(speed),
        drag: style === "sparks" ? 1.2 : 4,
        gravity: style === "sparks" ? 9 : 0,
        spin: rand(-4, 4),
        from: radius * rand(0.14, 0.24),
        to: radius * 0.04,
      });
      glint.sprite.material.color.copy(glintColor);
    }
  }

  function update(dt: number) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        scene.remove(p.sprite);
        spare.push(p.sprite);
        live.splice(i, 1);
        continue;
      }
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.material.rotation += p.spin * dt;
      p.sprite.scale.setScalar(p.from + (p.to - p.from) * ease(t));
      p.sprite.material.opacity = p.opacity * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
      if (p.tile < 0) {
        const frames = SHEETS[p.sheet].cols * SHEETS[p.sheet].rows;
        showTile(p, Math.min(frames - 1, Math.floor(t * frames)));
      }
    }
  }

  function clear() {
    for (const p of live) {
      scene.remove(p.sprite);
      spare.push(p.sprite);
    }
    live.length = 0;
  }

  return {
    burst,
    update,
    clear,
    setDark(next: boolean) {
      dark = next;
    },
    dispose() {
      clear();
      for (const sprite of spare) {
        sprite.material.map?.dispose();
        sprite.material.dispose();
      }
      for (const texture of Object.values(textures)) texture.dispose();
    },
  };
}

export type Poofs = Awaited<ReturnType<typeof createPoofs>>;
