import * as THREE from "three";
import { CAP, createItemDefs, disposeItemDefs, type ItemDef, type ItemKind } from "./items";
import { createCallouts } from "./callouts";
import { createPoofs, type Poofs } from "./effects";
import { createShards } from "./shards";
import { sliceGeometry } from "./slicer";
import { playSfx, preloadSfx, unloadSfx } from "./sounds";
import { loadTextureLibrary, type TextureLibrary } from "./textures";

// World units: the play field is VIEW_H tall at z = 0 and as wide as the aspect allows. Items
// fly in that plane; the perspective camera only lends them depth as they tumble.
const VIEW_H = 10;
const FOV = 30;
const CAMERA_Z = VIEW_H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
// Render lines along the short side. The frame is drawn without anti-aliasing at this size and
// scaled up by a whole number of device pixels with nearest-neighbour, so polygon edges step in
// crisp, even pixels — no blur, no dither.
const ROWS = 400;

const GRAVITY = 9.6;
const MIN_SLICE_SPEED = 3.2;
const SWOOSH_SPEED = 15;
const TRAIL_LIFE = 0.15;
const TRAIL_MAX = 48;
// Pointer samples closer than this merge into the blade's tip, so a 1000 Hz mouse still leaves a
// trail as long as a 60 Hz finger does.
const TRAIL_SPACING = 0.12;
const STREAK_WIDTH = 0.09;
const LIVES = 3;
// A combo closes this long after its last cut, finger down or not.
const COMBO_WINDOW = 0.3;
// Every cut freezes the world for a beat so it lands, and nudges the camera along the swipe.
const HIT_STOP = 0.05;
const HIT_KICK = 0.08;
const HIT_FLASH = 0.12;
// Halves can be cut again in the air, down to quarters of quarters.
const MAX_GENERATION = 3;
const MIN_PIECE_RADIUS = 0.3;
// Halfbrick drew bombs' hit areas smaller than they look and fruit's larger; same here.
const SLOP_HIT_BIAS = 1.08;
const GENUINE_HIT_BIAS = 0.72;
const RAY_COUNT = 10;
const MENU_Y = -0.3;
// After a bomb the gong waits for the whiteout to clear.
const WHITEOUT_FADE = 1.2;
const BOMB_GAME_OVER_DELAY = 0.9;
const REMATCH_AFTER = 1.2;
// Callouts keep clear of the corner buttons: a 28px button, its 12px inset and a 4px gap.
const CORNER_CLEARANCE = 44;
// The score card sits over the rematch prop.
const SCORE_Y = 2.75;
const BEST_KEY = "slop-ninja-best";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// How heavily each kind of slop turns up; the feeds are the "watermelons".
const SLOP_WEIGHTS: [ItemKind, number][] = [
  ["post", 0.26],
  ["video", 0.2],
  ["code", 0.18],
  ["image", 0.16],
  ["chat", 0.12],
  ["sparkle", 0.08],
];

type Mode = "loading" | "failed" | "menu" | "playing" | "exploding" | "gameover";
type GameOverReason = "genuine" | "misses";

interface Body {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
}

interface Whole extends Body {
  def: ItemDef;
  entered: boolean;
  slot: MenuSlot | null;
  live: boolean;
  // Out of play but still on screen: a menu occupant dropping out of its ring, or anything left
  // in the air when a run ends. It falls like slop but can't be cut and never costs a life.
  decor: boolean;
}

interface Piece extends Body {
  def: ItemDef;
  geometry: THREE.BufferGeometry;
  generation: number;
  age: number;
  flash: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

// A prop held in place to be sliced: the only "button" there is, on the start screen and after a
// run.
interface MenuSlot {
  x: number;
  y: number;
  // Radius the occupant is fitted into.
  r: number;
  alpha: number;
  fading: boolean;
  born: number;
}

interface Launch {
  at: number;
  def: ItemDef;
  x0: number;
  vx: number;
  vy: number;
  z: number;
}

interface Streak {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  age: number;
  life: number;
}

export interface SlopNinjaHandle {
  dispose(): void;
}

function readBest() {
  try {
    return Math.max(0, Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? "", 10) || 0);
  } catch {
    return 0;
  }
}

// Returns null when the browser can't give us a WebGL2 context (three r178 has no WebGL1 path).
export function bootSlopNinja(host: HTMLElement, onFail: () => void): SlopNinjaHandle | null {
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.imageRendering = "pixelated";
  canvas.style.touchAction = "none";
  // On touch screens a held finger must stay a blade: no tap flash, callout menu or selection.
  canvas.style.setProperty("-webkit-tap-highlight-color", "transparent");
  canvas.style.setProperty("-webkit-touch-callout", "none");
  canvas.style.userSelect = "none";
  host.appendChild(canvas);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      // Transparent: the board is the dialog's own surface, so the game (and its poster) sit on
      // whatever the page puts behind it.
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    canvas.remove();
    return null;
  }
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 4 / 3, 0.5, 60);
  camera.position.set(0, 0, CAMERA_Z);
  // Mostly ambient, like a PS2 scene lit by a flat key: faces still darken as they tumble away,
  // which is what sells the low-poly volume.
  scene.add(new THREE.AmbientLight(0xffffff, 2.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.45);
  key.position.set(0.35, 0.7, 1);
  scene.add(key);

  const overlay = new THREE.Scene();
  const ortho = new THREE.OrthographicCamera(-1, 1, VIEW_H / 2, -VIEW_H / 2, -20, 20);
  const unitPlane = new THREE.PlaneGeometry(1, 1);

  const overlayMaterial = (color: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthTest: false });
  const dimMaterial = overlayMaterial(0x000000);
  const dim = new THREE.Mesh(unitPlane, dimMaterial);
  dim.renderOrder = 1;

  // The bomb's light: thin white wedges, each longer than the screen diagonal, shot out one
  // every 100 ms round a shuffled set of headings — Fruit Ninja's burst, ray by ray.
  const rayGeometry = new THREE.BufferGeometry();
  const spread = THREE.MathUtils.degToRad(2.6);
  rayGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, 0, Math.cos(-spread), Math.sin(-spread), 0, Math.cos(spread), Math.sin(spread), 0],
      3,
    ),
  );
  // Transparent so it sorts after the dim; an opaque material always draws first.
  const raysMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const rays = new THREE.Group();
  const rayMeshes = Array.from({ length: RAY_COUNT }, () => {
    const ray = new THREE.Mesh(rayGeometry, raysMaterial);
    ray.renderOrder = 2;
    ray.visible = false;
    rays.add(ray);
    return ray;
  });

  const whiteMaterial = overlayMaterial(0xffffff);
  const white = new THREE.Mesh(unitPlane, whiteMaterial);
  white.renderOrder = 6;

  // The blade: a ribbon through the last few pointer samples, a soft wide stroke under a hard
  // core, shaped like a crescent.
  const trailGeometry = new THREE.BufferGeometry();
  const trailVerts = TRAIL_MAX * 2 * 2;
  const trailPos = new Float32Array(trailVerts * 3);
  const trailCol = new Float32Array(trailVerts * 4);
  trailGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage),
  );
  trailGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(trailCol, 4).setUsage(THREE.DynamicDrawUsage),
  );
  const trailIndex: number[] = [];
  for (let strip = 0; strip < 2; strip++) {
    const base = strip * TRAIL_MAX * 2;
    for (let i = 0; i < TRAIL_MAX - 1; i++) {
      const a = base + i * 2;
      trailIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  trailGeometry.setIndex(trailIndex);
  const trailMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const trail = new THREE.Mesh(trailGeometry, trailMaterial);
  trail.renderOrder = 3;
  trail.frustumCulled = false;

  overlay.add(dim, rays, trail, white);
  // Under the dim and the blade, so a bomb still darkens them and the swipe draws over them.
  const callouts = createCallouts(overlay, 0);

  // Slice streaks and hit flashes come and go constantly. Disposing their materials would let
  // three destroy and relink the shader program each time the last one fades, so they're pooled.
  type Pooled = "streak" | "flash";
  const effectMaterials = new Set<THREE.MeshBasicMaterial>();
  const spareMaterials: Record<Pooled, THREE.MeshBasicMaterial[]> = { streak: [], flash: [] };
  const takeMaterial = (kind: Pooled, values: THREE.MeshBasicMaterialParameters) => {
    const material = spareMaterials[kind].pop() ?? new THREE.MeshBasicMaterial();
    effectMaterials.add(material);
    material.setValues(values);
    return material;
  };

  const shards = createShards(scene);

  const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let dark = darkScheme.matches;

  let lib: TextureLibrary | null = null;
  let poofs: Poofs | null = null;
  let defs: ItemDef[] = [];
  let mode: Mode = "loading";
  let disposed = false;
  let contextLost = false;
  let raf = 0;
  let lastFrame = 0;
  // Seconds of hit-stop left, and the camera's kick along the last swipe.
  let hitStop = 0;
  const kick = new THREE.Vector2();
  let time = 0;

  let width = 1;
  let height = 1;
  let viewW = VIEW_H * (4 / 3);
  let itemScale = 1;

  const wholes: Whole[] = [];
  const pieces: Piece[] = [];
  const streaks: Streak[] = [];
  const slots: MenuSlot[] = [];
  let queue: Launch[] = [];

  // Cuts this run push the difficulty up; the score adds combo bonuses and only shows at the end.
  let cuts = 0;
  let score = 0;
  let best = readBest();
  let newBest = false;
  let scoreShown = false;
  let misses = 0;
  let wave = 0;
  let waveStart = 0;
  let clearedAt = 0;
  let waveGap = 1;
  let playStart = 0;
  let gameOverAge = 0;
  let startAt: number | null = null;
  let explosion: {
    at: number;
    whole: Whole;
    origin: THREE.Vector3;
    headings: number[];
    shakeAt: number;
  } | null = null;
  let lastThrowSound = 0;

  const blade = {
    down: false,
    id: -1,
    x: 0,
    y: 0,
    t: 0,
    points: [] as { x: number; y: number; t: number }[],
    hits: [] as THREE.Vector3[],
    lastHit: 0,
    lastSwoosh: 0,
    lastMove: 0,
  };

  const halfW = () => viewW / 2;
  const spawnY = () => -VIEW_H / 2 - 1.9 * itemScale;
  // Where a point at depth z appears on the z = 0 plane, which is where the blade lives.
  const onPlane = (x: number, z: number) => (x * CAMERA_Z) / (CAMERA_Z - z);

  const defsOf = (kind: ItemKind) => defs.filter((d) => d.kind === kind);
  const pickSlop = () => {
    let r = Math.random();
    for (const [kind, w] of SLOP_WEIGHTS) {
      r -= w;
      if (r <= 0) return pick(defsOf(kind));
    }
    return pick(defsOf("video"));
  };
  const pickGenuine = () => pick(defs.filter((d) => d.genuine));

  function addWhole(def: ItemDef, x: number, y: number, z: number, vx: number, vy: number) {
    const mesh = new THREE.Mesh(def.geometry, def.materials);
    mesh.scale.setScalar(itemScale);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-Math.PI, Math.PI));
    scene.add(mesh);
    const sign = Math.random() < 0.5 ? -1 : 1;
    const whole: Whole = {
      mesh,
      def,
      vel: new THREE.Vector3(vx, vy, 0),
      spin: new THREE.Vector3(rand(-0.4, 0.4), rand(-0.4, 0.4), sign * rand(1.2, 3)),
      entered: false,
      slot: null,
      live: true,
      decor: false,
    };
    wholes.push(whole);
    return whole;
  }

  function removeWhole(w: Whole) {
    w.live = false;
    scene.remove(w.mesh);
    const i = wholes.indexOf(w);
    if (i >= 0) wholes.splice(i, 1);
  }

  function removePiece(p: Piece) {
    scene.remove(p.mesh);
    spareMaterials.flash.push(p.flash.material);
    p.geometry.dispose();
    const i = pieces.indexOf(p);
    if (i >= 0) pieces.splice(i, 1);
  }

  function removeStreak(index: number) {
    const [streak] = streaks.splice(index, 1);
    scene.remove(streak.mesh);
    spareMaterials.streak.push(streak.mesh.material);
  }

  function clearBoard() {
    while (wholes.length) removeWhole(wholes[wholes.length - 1]);
    while (pieces.length) removePiece(pieces[pieces.length - 1]);
    while (streaks.length) removeStreak(streaks.length - 1);
    poofs?.clear();
    shards.clear();
    callouts.clear();
    queue = [];
  }

  function throwSound(genuine: boolean) {
    if (genuine) {
      playSfx("throwGenuine");
      return;
    }
    if (time - lastThrowSound < 0.12) return;
    lastThrowSound = time;
    playSfx("throw", { volume: 0.7 });
  }

  // Picks an arc that peaks inside the top of the frame and drifts back across the centre, the
  // way Fruit Ninja lobs fruit from below the bottom edge.
  function arc(x0: number, apexFrac = rand(0.25, 0.86)) {
    const apex = apexFrac * (VIEW_H / 2 - 1.3);
    const vy = Math.sqrt(2 * GRAVITY * (apex - spawnY()));
    const flight = (2 * vy) / GRAVITY;
    const hw = halfW() - 1.5 * itemScale;
    const xEnd = clamp(-x0 * rand(0.1, 0.6) + rand(-0.3, 0.3) * hw, -hw, hw);
    return { x0, vx: (xEnd - x0) / flight, vy };
  }

  function schedule(at: number, def: ItemDef, x0: number, z = rand(-0.4, 0.4), apexFrac?: number) {
    const a = arc(x0, apexFrac);
    const launch = { at, def, x0: a.x0, vx: a.vx, vy: a.vy, z };
    queue.push(launch);
    return launch;
  }

  function difficulty() {
    return clamp01(Math.max(cuts / 230, (time - playStart) / 160));
  }

  function nextWave() {
    wave++;
    const d = difficulty();
    const hw = halfW() - 1.6 * itemScale;
    const t0 = time;
    const opening = wave <= 2;

    const maxCount = opening ? wave : Math.round(lerp(2, 6, d) + rand(-0.5, 0.8));
    const count = clamp(Math.round(rand(1, maxCount + 0.49)), 1, 7);
    const roll = Math.random();
    const launches: Launch[] = [];

    if (!opening && count >= 3 && roll < lerp(0.15, 0.4, d)) {
      // A chain thrown one after another, sweeping across from one side.
      const dir = Math.random() < 0.5 ? -1 : 1;
      const step = lerp(0.3, 0.16, d);
      for (let i = 0; i < count; i++) {
        const x = dir * lerp(-hw * 0.8, hw * 0.8, i / (count - 1));
        launches.push(schedule(t0 + i * step, pickSlop(), x));
      }
    } else if (!opening && count === 2 && roll < 0.35) {
      // A crossing pair from opposite sides.
      launches.push(schedule(t0, pickSlop(), -hw * 0.85, rand(-0.3, 0.3), rand(0.5, 0.85)));
      launches.push(
        schedule(t0 + rand(0, 0.1), pickSlop(), hw * 0.85, rand(-0.3, 0.3), rand(0.5, 0.85)),
      );
    } else {
      // A volley: everything at once, spread along the bottom.
      for (let i = 0; i < count; i++) {
        const lane =
          count === 1 ? rand(-0.5, 0.5) : lerp(-0.8, 0.8, i / (count - 1)) + rand(-0.12, 0.12);
        launches.push(schedule(t0 + rand(0, opening ? 0 : 0.18), pickSlop(), lane * hw));
      }
    }

    // Human-made things join from the third wave on. Half the time one rides directly under a
    // piece of slop on the same arc, a beat behind it — slice the slop too late and the blade
    // carries on into the thing beneath.
    if (wave >= 3 && Math.random() < lerp(0.18, 0.5, d)) {
      const extra = d > 0.55 && Math.random() < 0.35 ? 2 : 1;
      for (let i = 0; i < extra; i++) {
        const host = pick(launches);
        if (Math.random() < 0.5) {
          queue.push({
            ...host,
            at: host.at + rand(0.14, 0.26),
            def: pickGenuine(),
            z: host.z - 0.9,
          });
        } else {
          schedule(t0 + rand(0, 0.25), pickGenuine(), rand(-0.7, 0.7) * hw);
        }
      }
    }

    queue.sort((a, b) => a.at - b.at);
    waveStart = t0;
    waveGap = lerp(1.0, 0.35, d);
  }

  function runDirector() {
    while (queue.length && queue[0].at <= time) {
      const l = queue.shift();
      if (!l) break;
      addWhole(l.def, l.x0, spawnY(), l.z, l.vx, l.vy);
      throwSound(l.def.genuine);
    }
    if (queue.length) return;
    const flying = wholes.some((w) => !w.slot && !w.decor && !w.def.genuine);
    if (flying) {
      clearedAt = time;
      // Late in a run the next wave can arrive before the last one has cleared.
      if (time - waveStart >= lerp(5, 3, difficulty())) nextWave();
      return;
    }
    if (time - clearedAt >= waveGap) nextWave();
  }

  function addSlot(x: number, y: number, def: ItemDef) {
    const r = Math.min(1.7 * itemScale, halfW() - 0.4);
    slots.push({ x, y, r, alpha: 0, fading: false, born: time });
    const w = addWhole(def, x, y, 0, 0, 0);
    w.slot = slots[slots.length - 1];
    w.mesh.scale.setScalar(0.001);
  }

  function enterMenu() {
    mode = "menu";
    addSlot(0, MENU_Y, pick(defsOf("video")));
  }

  function startGame() {
    // Anything retired at the last game over is near the bottom edge by now; clear it.
    for (let i = wholes.length - 1; i >= 0; i--) if (wholes[i].decor) removeWhole(wholes[i]);
    mode = "playing";
    cuts = 0;
    score = 0;
    newBest = false;
    scoreShown = false;
    misses = 0;
    wave = 0;
    playStart = time;
    clearedAt = time;
    waveStart = time;
    waveGap = 0.6;
    gameOverAge = 0;
  }

  function saveBest() {
    if (score <= best) return;
    best = score;
    newBest = true;
    try {
      window.localStorage.setItem(BEST_KEY, String(best));
    } catch {
      // Private mode: the record lasts as long as the page.
    }
  }

  function endGame(why: GameOverReason) {
    mode = "gameover";
    saveBest();
    queue = [];
    for (const w of wholes) {
      if (w.slot) continue;
      w.decor = true;
    }
    // After a bomb the gong waits until the whiteout has cleared.
    gameOverAge = why === "genuine" ? -BOMB_GAME_OVER_DELAY : 0;
    if (why === "misses") playSfx("gameOver");
  }

  const tmpSeg = new THREE.Vector3();
  const inverse = new THREE.Matrix4();

  function spawnStreak(origin: THREE.Vector3, dir: THREE.Vector3, length: number, color?: number) {
    const material = takeMaterial("streak", {
      color: color ?? (dark ? 0xffffff : 0x15151a),
      transparent: true,
      depthTest: false,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(unitPlane, material);
    mesh.position.set(origin.x, origin.y, origin.z + 0.8);
    mesh.rotation.z = Math.atan2(dir.y, dir.x);
    mesh.scale.set(length, STREAK_WIDTH, 1);
    mesh.renderOrder = 4;
    scene.add(mesh);
    streaks.push({ mesh, age: 0, life: 0.22 });
  }

  // Cuts a whole or a piece along the swipe. Shared by both so halves can be cut again in the air;
  // `generation` counts how many cuts deep a piece is.
  function cutMesh(
    mesh: THREE.Mesh,
    geometry: THREE.BufferGeometry,
    def: ItemDef,
    vel: THREE.Vector3,
    spinIn: THREE.Vector3,
    generation: number,
    p0: THREE.Vector2,
    p1: THREE.Vector2,
    held: boolean,
  ) {
    const dir = new THREE.Vector3(p1.x - p0.x, p1.y - p0.y, 0).normalize();
    const normal = new THREE.Vector3(-dir.y, dir.x, 0);
    const center = mesh.position.clone();
    const cx = onPlane(center.x, center.z);
    const cy = onPlane(center.y, center.z);

    // Cut where the blade actually crossed, but never so far off-centre that one half is a sliver.
    const seg = tmpSeg.set(p1.x - p0.x, p1.y - p0.y, 0);
    const lenSq = Math.max(1e-6, seg.lengthSq());
    const t = clamp(((cx - p0.x) * seg.x + (cy - p0.y) * seg.y) / lenSq, 0, 1);
    const qx = p0.x + seg.x * t;
    const qy = p0.y + seg.y * t;
    const r = def.radius * mesh.scale.x * 0.72 ** (generation - 1);
    const offset = clamp((qx - cx) * normal.x + (qy - cy) * normal.y, -0.28 * r, 0.28 * r);

    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      normal,
      center.clone().addScaledVector(normal, offset),
    );
    mesh.updateMatrixWorld();
    inverse.copy(mesh.matrixWorld).invert();
    const halves = sliceGeometry(geometry, plane.applyMatrix4(inverse), CAP, def.capUvScale);

    const parts: [THREE.BufferGeometry | null, number][] = [
      [halves.front, 1],
      [halves.back, -1],
    ];
    for (const [half, sign] of parts) {
      if (!half) continue;
      const piece = new THREE.Mesh(half, def.materials);
      piece.position.copy(mesh.position);
      piece.quaternion.copy(mesh.quaternion);
      piece.scale.copy(mesh.scale);
      // A white flash over the fresh halves for a few frames: the hit reads before the poof does.
      const flash = new THREE.Mesh(
        half,
        takeMaterial("flash", {
          color: 0xffffff,
          transparent: true,
          depthWrite: false,
          opacity: 0.9,
        }),
      );
      flash.renderOrder = 1;
      piece.add(flash);
      scene.add(piece);
      pieces.push({
        mesh: piece,
        def,
        geometry: half,
        generation,
        age: 0,
        flash,
        vel: vel
          .clone()
          .multiplyScalar(held ? 0 : 0.85)
          .addScaledVector(normal, sign * rand(2.2, 3.2))
          .addScaledVector(dir, 1.4)
          .add(new THREE.Vector3(0, held ? 1.8 : 0.6, sign * rand(0.3, 1))),
        spin: spinIn
          .clone()
          .multiplyScalar(0.5)
          .add(new THREE.Vector3(rand(-2, 2), rand(-2, 2), sign * rand(3.5, 6.5))),
      });
    }

    poofs?.burst(center, r, def.poof.style, def.poof.tint, dir);
    shards.burst(center, r, def.shards, dir, normal);
    spawnStreak(center, dir, r * 2.4);
    // A wet splat with the material's own crack, zap, pop or tink on top, lower for smaller bits.
    const rate = 1 + (generation - 1) * 0.12;
    playSfx("splat", { volume: 0.85, rate });
    if (def.impact) playSfx(def.impact, { volume: 0.8, rate });
    hitStop = Math.max(hitStop, HIT_STOP);
    if (!reducedMotion.matches) kick.addScaledVector(new THREE.Vector2(dir.x, dir.y), HIT_KICK);
    return center;
  }

  function slice(w: Whole, p0: THREE.Vector2, p1: THREE.Vector2) {
    removeWhole(w);
    return cutMesh(w.mesh, w.def.geometry, w.def, w.vel, w.spin, 1, p0, p1, w.slot !== null);
  }

  function slicePiece(p: Piece, p0: THREE.Vector2, p1: THREE.Vector2) {
    const at = cutMesh(p.mesh, p.geometry, p.def, p.vel, p.spin, p.generation + 1, p0, p1, false);
    removePiece(p);
    return at;
  }

  function explode(w: Whole) {
    mode = "exploding";
    const order = Array.from({ length: RAY_COUNT }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const headings = order.map((k) =>
      THREE.MathUtils.degToRad((k * 360) / RAY_COUNT + rand(-10, 10)),
    );
    explosion = { at: time, whole: w, origin: w.mesh.position.clone(), headings, shakeAt: 0 };
    blade.down = false;
    blade.id = -1;
    blade.points.length = 0;
    playSfx("explode");
  }

  function hitTest(p0: THREE.Vector2, p1: THREE.Vector2) {
    const sx = p1.x - p0.x;
    const sy = p1.y - p0.y;
    const lenSq = sx * sx + sy * sy;
    if (lenSq < 1e-8) return;
    for (let i = wholes.length - 1; i >= 0; i--) {
      const w = wholes[i];
      if (!w.live || w.decor) continue;
      if (w.slot && (w.slot.alpha < 0.85 || w.slot.fading)) continue;
      if (mode === "gameover" && !w.slot) continue;
      const cx = onPlane(w.mesh.position.x, w.mesh.position.z);
      const cy = onPlane(w.mesh.position.y, w.mesh.position.z);
      const t = clamp(((cx - p0.x) * sx + (cy - p0.y) * sy) / lenSq, 0, 1);
      const dx = p0.x + sx * t - cx;
      const dy = p0.y + sy * t - cy;
      const bias = w.def.genuine ? GENUINE_HIT_BIAS : SLOP_HIT_BIAS;
      const r = onPlane(w.def.radius * bias * w.mesh.scale.x, w.mesh.position.z);
      if (dx * dx + dy * dy > r * r) continue;

      if (w.def.genuine) {
        if (mode === "playing") {
          explode(w);
          return;
        }
        continue;
      }

      const slot = w.slot;
      const at = slice(w, p0, p1);
      if (slot) {
        chooseMenu();
        return;
      }
      if (mode !== "playing") continue;
      cuts++;
      score++;
      blade.hits.push(at);
      blade.lastHit = time;
    }

    // Pieces still in the air can be cut again, down to a few generations.
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      const size = p.def.radius * p.mesh.scale.x * 0.72 ** p.generation;
      if (p.generation >= MAX_GENERATION || size < MIN_PIECE_RADIUS || p.age < 0.12) continue;
      const r = onPlane(size, p.mesh.position.z);
      const cx = onPlane(p.mesh.position.x, p.mesh.position.z);
      const cy = onPlane(p.mesh.position.y, p.mesh.position.z);
      const t = clamp(((cx - p0.x) * sx + (cy - p0.y) * sy) / lenSq, 0, 1);
      const dx = p0.x + sx * t - cx;
      const dy = p0.y + sy * t - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const at = slicePiece(p, p0, p1);
      if (mode !== "playing") continue;
      blade.hits.push(at);
      blade.lastHit = time;
    }
  }

  function chooseMenu() {
    playSfx("start");
    callouts.dismiss("score");
    for (const s of slots) s.fading = true;
    startAt = time + 0.55;
  }

  function finishStroke() {
    const n = blade.hits.length;
    // Three or more cuts in one swipe ring a chime, a semitone higher for each extra piece, and
    // call it out where they were cut.
    if (n >= 3 && mode === "playing") {
      playSfx("combo", { rate: 2 ** ((Math.min(n, 10) - 3) / 12) });
      // Fruit Ninja's bonus: a combo of n is worth n more.
      score += n;
      const at = blade.hits
        .reduce((sum, v) => sum.add(v), new THREE.Vector3())
        .multiplyScalar(1 / n);
      callouts.setReducedMotion(reducedMotion.matches);
      callouts.combo(onPlane(at.x, at.z), onPlane(at.y, at.z) + 0.6, n);
    }
    blade.hits.length = 0;
  }

  // Clamped to the frame: with the pointer captured, a flick that overshoots the edge must not
  // cut things still hidden below it.
  const toWorld = (clientX: number, clientY: number, out: THREE.Vector2) => {
    const rect = canvas.getBoundingClientRect();
    const hw = halfW();
    out.set(
      clamp(((clientX - rect.left) / rect.width - 0.5) * viewW, -hw, hw),
      clamp((0.5 - (clientY - rect.top) / rect.height) * VIEW_H, -VIEW_H / 2, VIEW_H / 2),
    );
    return out;
  };

  const p0 = new THREE.Vector2();
  const p1 = new THREE.Vector2();

  function pushTrailPoint(x: number, y: number) {
    const pts = blade.points;
    const tip = pts[pts.length - 1];
    const anchor = pts[pts.length - 2];
    if (tip && anchor && Math.hypot(x - anchor.x, y - anchor.y) < TRAIL_SPACING) {
      tip.x = x;
      tip.y = y;
      tip.t = time;
      return;
    }
    pts.push({ x, y, t: time });
    if (pts.length > TRAIL_MAX) pts.shift();
  }

  function bladeTo(clientX: number, clientY: number, stamp: number) {
    toWorld(clientX, clientY, p1);
    p0.set(blade.x, blade.y);
    const dt = Math.max(0.001, (stamp - blade.t) / 1000);
    const speed = p0.distanceTo(p1) / dt;
    blade.x = p1.x;
    blade.y = p1.y;
    blade.t = stamp;
    if (p0.distanceToSquared(p1) < 1e-6) return;
    blade.lastMove = time;
    pushTrailPoint(p1.x, p1.y);

    if (speed < MIN_SLICE_SPEED) return;
    if (speed > SWOOSH_SPEED && time - blade.lastSwoosh > 0.24) {
      blade.lastSwoosh = time;
      playSfx("swoosh");
    }
    if (mode !== "exploding" && mode !== "loading") hitTest(p0, p1);
  }

  const inputBlocked = () => mode === "loading" || mode === "failed" || mode === "exploding";

  // One blade, owned by whichever finger is actually moving: a resting thumb or a stray tap must
  // neither lock out a swipe nor cut one short.
  const down = new Set<number>();

  const takeBlade = (e: PointerEvent) => {
    if (blade.down) finishStroke();
    blade.down = true;
    blade.id = e.pointerId;
    toWorld(e.clientX, e.clientY, p1);
    blade.x = p1.x;
    blade.y = p1.y;
    blade.t = e.timeStamp;
    blade.lastMove = time;
    blade.points.length = 0;
    blade.points.push({ x: p1.x, y: p1.y, t: time });
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Before the blocked check: a press must never pull focus out of the dialog, or Escape stops
    // closing it.
    e.preventDefault();
    if (inputBlocked()) return;
    down.add(e.pointerId);
    canvas.setPointerCapture(e.pointerId);
    if (!blade.down || time - blade.lastMove > 0.1) takeBlade(e);
  };

  const onMove = (e: PointerEvent) => {
    if (!down.has(e.pointerId) || inputBlocked()) return;
    if (e.pointerId !== blade.id) {
      if (blade.down && time - blade.lastMove <= 0.1) return;
      takeBlade(e);
    }
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    if (events.length) for (const ce of events) bladeTo(ce.clientX, ce.clientY, ce.timeStamp);
    else bladeTo(e.clientX, e.clientY, e.timeStamp);
  };

  const onUp = (e: PointerEvent) => {
    down.delete(e.pointerId);
    if (e.pointerId !== blade.id) return;
    blade.down = false;
    blade.id = -1;
    finishStroke();
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("lostpointercapture", onUp);

  const dq = new THREE.Quaternion();
  const axis = new THREE.Vector3();

  function integrate(b: Body, dt: number) {
    b.vel.y -= GRAVITY * dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    const w = b.spin.length();
    if (w > 1e-5) {
      axis.copy(b.spin).multiplyScalar(1 / w);
      dq.setFromAxisAngle(axis, w * dt);
      b.mesh.quaternion.premultiply(dq);
    }
  }

  function updateSlotted(w: Whole, s: MenuSlot) {
    const grow = clamp01((time - s.born) / 0.45);
    const k = 1 - (1 - grow) ** 3;
    const shrink = s.fading ? Math.max(0, s.alpha) : 1;
    const fit = Math.min(itemScale, s.r / w.def.radius);
    w.mesh.scale.setScalar(Math.max(0.001, fit * k * shrink));
    w.mesh.position.set(s.x, s.y + Math.sin(time * 1.8 + s.x) * 0.08, 0);
    // Sways in place but stays upright, face to the player, so the menu reads what it offers.
    w.mesh.rotation.set(
      Math.sin(time * 1.1 + s.x) * 0.18,
      Math.sin(time * 0.7 + s.x) * 0.5,
      Math.sin(time * 0.9 + s.x) * 0.06,
    );
    if (s.fading && s.alpha <= 0) removeWhole(w);
  }

  function updateBodies(dt: number) {
    const bottom = -VIEW_H / 2;
    for (let i = wholes.length - 1; i >= 0; i--) {
      const w = wholes[i];
      if (w.slot) {
        updateSlotted(w, w.slot);
        continue;
      }
      integrate(w, dt);
      const r = w.def.radius * itemScale;
      if (!w.entered && w.mesh.position.y > bottom + r * 0.3) w.entered = true;
      if (w.vel.y >= 0 || w.mesh.position.y >= bottom - r * 1.2) continue;
      const missed = mode === "playing" && w.entered && !w.def.genuine && !w.decor;
      removeWhole(w);
      if (!missed) continue;
      misses++;
      playSfx("miss");
      callouts.setReducedMotion(reducedMotion.matches);
      callouts.miss(onPlane(w.mesh.position.x, w.mesh.position.z));
      if (misses >= LIVES) endGame("misses");
    }
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      p.age += dt;
      integrate(p, dt);
      p.flash.visible = p.age < HIT_FLASH;
      p.flash.material.opacity = 0.9 * (1 - p.age / HIT_FLASH);
      if (p.mesh.position.y < bottom - 3) removePiece(p);
    }
  }

  function updateEffects(dt: number) {
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i];
      s.age += dt;
      const t = s.age / s.life;
      s.mesh.material.opacity = 1 - t;
      s.mesh.scale.y = STREAK_WIDTH * (1 - t * 0.6);
      if (t >= 1) removeStreak(i);
    }

    for (let i = slots.length - 1; i >= 0; i--) {
      const s = slots[i];
      const target = s.fading ? 0 : 1;
      s.alpha = clamp01(s.alpha + Math.sign(target - s.alpha) * dt * (s.fading ? 3.2 : 2.4));
      if (s.fading && s.alpha <= 0) slots.splice(i, 1);
    }
  }

  // On the start screen, with nobody swiping, a faint ghost blade cuts across the prop every few
  // seconds: the only instruction the game gives.
  const ghost: { x: number; y: number; t: number }[] = [];
  function ghostPoints() {
    ghost.length = 0;
    const slot = slots[0];
    if (mode !== "menu" || blade.down || !slot || slot.alpha < 1) return ghost;
    const cycle = 2.8;
    const phase = (time % cycle) / 0.32;
    if (phase > 1 + TRAIL_LIFE / 0.32) return ghost;
    const from = new THREE.Vector2(slot.x - slot.r * 1.5, slot.y + slot.r * 0.9);
    const to = new THREE.Vector2(slot.x + slot.r * 1.5, slot.y - slot.r * 0.7);
    for (let i = 0; i <= 14; i++) {
      const f = i / 14;
      if (f > phase) break;
      const t = time - (phase - f) * 0.32;
      ghost.push({
        x: lerp(from.x, to.x, f),
        y: lerp(from.y, to.y, f) + Math.sin(f * Math.PI) * 0.3,
        t,
      });
    }
    return ghost;
  }

  function updateTrail() {
    while (blade.points.length && time - blade.points[0].t > TRAIL_LIFE) blade.points.shift();
    const hint = blade.points.length ? null : ghostPoints().filter((p) => time - p.t <= TRAIL_LIFE);
    const pts = hint?.length ? hint : blade.points;
    const n = pts.length;
    const strength = hint?.length ? 0.28 : 1;
    // Vertex colours are linear: the light-mode core is true black, its halo a deep slate.
    const core = dark ? [1, 1, 1] : [0, 0, 0];
    const glow = dark ? [0.55, 0.7, 1] : [0.02, 0.04, 0.25];
    const base = 0.12;
    for (let strip = 0; strip < 2; strip++) {
      const width = strip === 0 ? base * 2.3 : base;
      const color = strip === 0 ? glow : core;
      const alpha = strip === 0 ? (dark ? 0.32 : 0.45) : 1;
      const offset = strip * TRAIL_MAX * 2;
      for (let i = 0; i < TRAIL_MAX; i++) {
        const v = offset + i * 2;
        if (i >= n) {
          // Collapse unused slots onto the tip so they draw nothing.
          const last = pts[n - 1] ?? { x: 0, y: 0 };
          trailPos.set([last.x, last.y, 0, last.x, last.y, 0], v * 3);
          trailCol.fill(0, v * 4, v * 4 + 8);
          continue;
        }
        const p = pts[i];
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(n - 1, i + 1)];
        let dx = next.x - prev.x;
        let dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const along = n === 1 ? 1 : i / (n - 1);
        const fresh = 1 - clamp01((time - p.t) / TRAIL_LIFE);
        // A crescent: pinched at the tail, swelling, then drawn back to a point at the tip.
        const w = width * Math.sin(Math.PI * Math.min(0.97, along ** 1.35)) * (0.4 + 0.6 * fresh);
        trailPos.set([p.x - dy * w, p.y + dx * w, 0, p.x + dy * w, p.y - dx * w, 0], v * 3);
        const a = alpha * strength * Math.min(1, along * 1.6);
        trailCol.set([color[0], color[1], color[2], a, color[0], color[1], color[2], a], v * 4);
      }
    }
    trailGeometry.attributes.position.needsUpdate = true;
    trailGeometry.attributes.color.needsUpdate = true;
    trail.visible = n >= 2;
  }

  function resetExplosionVisuals() {
    dimMaterial.opacity = 0;
    rays.visible = false;
    camera.position.set(kick.x, kick.y, CAMERA_Z);
  }

  function updateExplosion() {
    if (!explosion) {
      resetExplosionVisuals();
      return;
    }
    const { at, whole, origin, headings } = explosion;
    const t = time - at;
    if (whole.live) whole.mesh.scale.setScalar(itemScale * (1 + clamp01(t / 1.1) * 0.2));
    // The whole board shakes, re-rolled every 50 ms, while the light builds.
    if (time - explosion.shakeAt > 0.05) {
      explosion.shakeAt = time;
      const amp = reducedMotion.matches ? 0 : VIEW_H * 0.012;
      camera.position.set(rand(-amp, amp), rand(-amp, amp), CAMERA_Z);
    }
    dimMaterial.opacity = clamp01(t / 0.3) * (dark ? 0.3 : 0.55);
    rays.visible = true;
    rays.position.set(onPlane(origin.x, origin.z), onPlane(origin.y, origin.z), 0);
    const reach = Math.hypot(viewW, VIEW_H) * 1.3;
    rayMeshes.forEach((ray, i) => {
      const born = t - 0.06 - i * 0.1;
      ray.visible = born > 0;
      ray.rotation.z = headings[i];
      ray.scale.setScalar(reach * clamp01(born / 0.07));
    });
    // Reduced motion keeps the burst but softens the full-screen flash.
    const flash = reducedMotion.matches ? 0.4 : 1;
    whiteMaterial.opacity = clamp01((t - 1.05) / 0.2) * flash;

    if (t >= 1.3) {
      explosion = null;
      clearBoard();
      resetExplosionVisuals();
      whiteMaterial.opacity = flash;
      endGame("genuine");
    }
  }

  function step(dt: number) {
    time += dt;

    if (mode === "playing") runDirector();

    if (mode !== "exploding") {
      updateBodies(dt);
      if (!explosion)
        whiteMaterial.opacity = Math.max(0, whiteMaterial.opacity - dt / WHITEOUT_FADE);
    }
    updateExplosion();
    updateEffects(mode === "exploding" ? 0 : dt);
    poofs?.update(mode === "exploding" ? 0 : dt);
    shards.update(mode === "exploding" ? 0 : dt);

    if (blade.down && blade.hits.length && time - blade.lastHit > COMBO_WINDOW) finishStroke();

    if (mode === "gameover") {
      const before = gameOverAge;
      gameOverAge += dt;
      if (before < 0 && gameOverAge >= 0) playSfx("gameOver");
      // With the gong (after a bomb, once the whiteout has cleared), the run's score and the best.
      if (!scoreShown && gameOverAge >= 0) {
        scoreShown = true;
        callouts.setReducedMotion(reducedMotion.matches);
        callouts.score(0, SCORE_Y, score, best, newBest);
      }
      // One prop comes back to be sliced for a rematch.
      if (before < REMATCH_AFTER && gameOverAge >= REMATCH_AFTER) addSlot(0, MENU_Y, pickSlop());
    }

    if (startAt !== null && time >= startAt) {
      startAt = null;
      startGame();
    }
  }

  // In the mobile sheet the canvas starts below the drawer's handle strip; the strip follows the
  // bomb's dim and whiteout so the flash doesn't stop at a hard line.
  let stripTint = "";
  function tintStrip() {
    const wrapper = host.parentElement;
    const top = host.offsetTop;
    if (!wrapper || top === 0) return;
    const dimmed = dimMaterial.opacity;
    const flash = whiteMaterial.opacity;
    let tint = "";
    // The same dim-then-flash the canvas composites over the surface, laid over just the strip
    // (the canvas is see-through, so a tint behind it would dim the board twice).
    if (dimmed > 0 || flash > 0) {
      const layer = (rgba: string) =>
        `linear-gradient(${rgba}, ${rgba}) top / 100% ${top}px no-repeat`;
      tint = `${layer(`rgba(255,255,255,${flash.toFixed(3)})`)}, ${layer(`rgba(0,0,0,${dimmed.toFixed(3)})`)}`;
    }
    if (tint === stripTint) return;
    stripTint = tint;
    wrapper.style.background = tint;
  }

  function render() {
    updateTrail();
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(overlay, ortho);
    tintStrip();
  }

  function resize() {
    // Layout size, not getBoundingClientRect: the dialog opens with a scale transform and the
    // game mounts mid-morph, when the transformed rect is a fraction of the final box.
    const cssW = Math.max(1, host.clientWidth);
    const cssH = Math.max(1, host.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.round((Math.min(cssW, cssH) * dpr) / ROWS));
    const w = Math.max(16, Math.ceil((cssW * dpr) / k));
    const h = Math.max(16, Math.ceil((cssH * dpr) / k));
    const scale = dpr / k;
    canvas.style.width = `${w / scale}px`;
    canvas.style.height = `${h / scale}px`;
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    viewW = VIEW_H * aspect;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    ortho.left = -viewW / 2;
    ortho.right = viewW / 2;
    ortho.updateProjectionMatrix();
    for (const m of [dim, white]) m.scale.set(viewW, VIEW_H, 1);
    callouts.layout(viewW, VIEW_H, h, (CORNER_CLEARANCE * h) / cssH);
    itemScale = clamp(aspect / (4 / 3), 0.62, 1);
    // Resizing clears the drawing buffer after this frame's draw; repaint before it composites.
    if (raf && !disposed && !contextLost) render();
  }

  const frame = (now: number) => {
    if (disposed || contextLost) return;
    raf = requestAnimationFrame(frame);
    const real = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    // Hit-stop: the world all but freezes for a beat after a cut; the kick springs back on real time.
    const dt = hitStop > 0 ? real * 0.06 : real;
    hitStop = Math.max(0, hitStop - real);
    kick.multiplyScalar(Math.exp(-real / 0.07));
    step(dt);
    callouts.update(real);
    render();
  };

  const sync = () => {
    if (disposed || contextLost) return;
    if (document.visibilityState !== "visible") {
      cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    if (raf) return;
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const onScheme = () => {
    dark = darkScheme.matches;
    poofs?.setDark(dark);
  };

  // three rebuilds its GL state on restore and re-uploads lazily; only the loop needs pausing.
  const onLost = () => {
    contextLost = true;
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const onRestored = () => {
    contextLost = false;
    sync();
  };

  // A monitor switch or zoom changes the device pixel ratio without resizing the dialog; the
  // resolution query is re-armed at each new ratio.
  let dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  const onDpr = () => {
    dprQuery.removeEventListener("change", onDpr);
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprQuery.addEventListener("change", onDpr);
    resize();
  };

  const observer = new ResizeObserver(() => resize());
  observer.observe(host);
  document.addEventListener("visibilitychange", sync);
  darkScheme.addEventListener("change", onScheme);
  dprQuery.addEventListener("change", onDpr);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  resize();
  sync();

  // Combo callouts draw with the site's sans. Warm it up, but never hold the game for it: a
  // fallback face is fine if it hasn't arrived by the first combo.
  void document.fonts.load(`800 24px "Haas Recast"`).catch(() => []);
  Promise.all([loadTextureLibrary(), createPoofs(scene)])
    .then(([loaded, effects]) => {
      if (disposed) {
        loaded.dispose();
        effects.dispose();
        return;
      }
      lib = loaded;
      poofs = effects;
      poofs.setDark(dark);
      defs = createItemDefs(lib);
      preloadSfx();
      enterMenu();
    })
    .catch((error: unknown) => {
      if (disposed) return;
      console.error(error);
      mode = "failed";
      onFail();
    });

  return {
    dispose() {
      disposed = true;
      // Leaving mid-run still banks a record the score was already past.
      if (mode === "playing" || mode === "exploding") saveBest();
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      darkScheme.removeEventListener("change", onScheme);
      dprQuery.removeEventListener("change", onDpr);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("lostpointercapture", onUp);
      clearBoard();
      disposeItemDefs(defs);
      lib?.dispose();
      poofs?.dispose();
      shards.dispose();
      callouts.dispose();
      for (const m of effectMaterials) m.dispose();
      unitPlane.dispose();
      rayGeometry.dispose();
      for (const m of [dimMaterial, raysMaterial, whiteMaterial, trailMaterial]) {
        m.dispose();
      }
      trailGeometry.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      unloadSfx();
    },
  };
}
