import * as THREE from "three";
import { createPs2Material } from "./ps2-material";

// Debris: a handful of tiny low-poly chunks thrown out of every cut, shaped and coloured by what
// the thing was made of — circuit chips, wood splinters, foam crumbs, crystal shards. They are lit
// like the props, tumble fast, fall under gravity and shrink away, so they never need a material
// per chunk.

export type ShardKind = "electronics" | "wood" | "foam" | "crystal" | "paper" | "vinyl";

const GEOMETRIES = {
  chip: new THREE.BoxGeometry(1, 0.62, 0.14),
  splinter: new THREE.BoxGeometry(1, 0.16, 0.16),
  crumb: new THREE.IcosahedronGeometry(0.55, 0),
  shard: new THREE.TetrahedronGeometry(0.62, 0),
  flake: new THREE.BoxGeometry(1, 0.72, 0.03),
};

const KINDS: Record<
  ShardKind,
  { shapes: (keyof typeof GEOMETRIES)[]; colors: string[]; specular: number }
> = {
  electronics: {
    shapes: ["chip", "chip", "splinter"],
    colors: ["#2f6d45", "#1d1e22", "#c7782e", "#b8bcc4"],
    specular: 0.5,
  },
  wood: {
    shapes: ["splinter", "splinter", "chip"],
    colors: ["#d9b27a", "#b88a52", "#e7b93b"],
    specular: 0.25,
  },
  foam: { shapes: ["crumb"], colors: ["#eef3ff", "#cddbff", "#9fbfff"], specular: 0.2 },
  crystal: { shapes: ["shard"], colors: ["#c7a8ff", "#8a6dff", "#e8ddff"], specular: 0.8 },
  paper: { shapes: ["flake"], colors: ["#f4efe2", "#e7dfca"], specular: 0 },
  vinyl: { shapes: ["shard", "chip"], colors: ["#1b1b1d", "#3a3a3d"], specular: 0.6 },
};

interface Shard {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  size: number;
  age: number;
  life: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

export function createShards(scene: THREE.Scene) {
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.colorSpace = THREE.SRGBColorSpace;
  white.needsUpdate = true;
  const materials = Object.fromEntries(
    (Object.keys(KINDS) as ShardKind[]).map((kind) => [
      kind,
      KINDS[kind].colors.map((color) =>
        createPs2Material({ map: white, color, specular: KINDS[kind].specular, shininess: 30 }),
      ),
    ]),
  ) as Record<ShardKind, THREE.ShaderMaterial[]>;

  const live: Shard[] = [];
  const spare: THREE.Mesh[] = [];

  // `normal` is the cut plane's normal: chunks spray out of both cut faces and along the swipe.
  function burst(
    at: THREE.Vector3,
    radius: number,
    kind: ShardKind,
    dir: THREE.Vector3,
    normal: THREE.Vector3,
  ) {
    const spec = KINDS[kind];
    const count = Math.round(rand(12, 18));
    for (let i = 0; i < count; i++) {
      const mesh = spare.pop() ?? new THREE.Mesh();
      mesh.geometry = GEOMETRIES[pick(spec.shapes)];
      mesh.material = pick(materials[kind]);
      mesh.position
        .copy(at)
        .add(new THREE.Vector3(rand(-0.2, 0.2), rand(-0.2, 0.2), rand(0.1, 0.5)));
      mesh.rotation.set(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3));
      const side = Math.random() < 0.5 ? -1 : 1;
      const vel = normal
        .clone()
        .multiplyScalar(side * rand(2, 5.5))
        .addScaledVector(dir, rand(0.5, 3))
        .add(new THREE.Vector3(0, rand(1, 3.5), rand(-1, 1.5)));
      const size = radius * rand(0.09, 0.19);
      mesh.scale.setScalar(size);
      scene.add(mesh);
      live.push({
        mesh,
        vel,
        spin: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
        size,
        age: 0,
        life: rand(0.8, 1.3),
      });
    }
  }

  function update(dt: number) {
    for (let i = live.length - 1; i >= 0; i--) {
      const s = live[i];
      s.age += dt;
      if (s.age >= s.life) {
        scene.remove(s.mesh);
        spare.push(s.mesh);
        live.splice(i, 1);
        continue;
      }
      s.vel.y -= 12 * dt;
      s.vel.multiplyScalar(Math.exp(-0.6 * dt));
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      const t = s.age / s.life;
      s.mesh.scale.setScalar(s.size * (t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25));
    }
  }

  function clear() {
    for (const s of live) {
      scene.remove(s.mesh);
      spare.push(s.mesh);
    }
    live.length = 0;
  }

  return {
    burst,
    update,
    clear,
    dispose() {
      clear();
      for (const list of Object.values(materials)) for (const m of list) m.dispose();
      white.dispose();
    },
  };
}
