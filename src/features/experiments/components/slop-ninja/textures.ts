import * as THREE from "three";
import {
  paintCutPaper,
  paintCutVinyl,
  paintDrawing,
  paintGenuineEdges,
  paintLetter,
  paintMagnetFace,
  paintVinyl,
  paintWax,
} from "./paint-genuine";
import {
  paintChatFaces,
  paintDecor,
  paintGemFaces,
  paintPictureFaces,
  wrapDecor,
  type DecorSources,
} from "./paint-decor";
import {
  paintElectronics,
  wrapElectronics,
  type ElectronicsSources,
  type ElectronicsTextures,
} from "./paint-electronics";
import { VIDEOS as TV_VIDEOS } from "./paint-screens";
import { ASSET_BASE } from "./assets";

export interface FaceSet {
  front: THREE.Texture;
  back: THREE.Texture;
  aspect: number;
}

export interface TextureLibrary {
  image: FaceSet[];
  chat: FaceSet[];
  sparkle: FaceSet;
  drawing: FaceSet;
  letter: FaceSet;
  vinyl: FaceSet;
  side: Record<"paper" | "vinyl", THREE.Texture>;
  // Cut-face skins, tileable, mapped onto the slicer's caps.
  cuts: {
    // Warm paper pulp with a few darker fibres.
    paper: THREE.Texture;
    // PVC lifted off black, with sparse light streaks.
    vinyl: THREE.Texture;
  };
  // Sub-parts of the genuine props (paint-genuine.ts).
  genuine: {
    // The drawing's letter magnet: face and chamfer projected over the letter, and its side band.
    magnetFace: THREE.Texture;
    magnetSide: THREE.Texture;
    // The letter's wax seal, projected from above.
    wax: THREE.Texture;
  };
  // Sub-parts and cut faces of the decor props: frame, chat bubble, sparkle gem (paint-decor.ts).
  decor: Record<keyof DecorSources, THREE.Texture>;
  // Screens, body skins, trim sheet and cut faces of the TV, laptop and phone
  // (paint-electronics.ts).
  electronics: ElectronicsTextures;
  dispose(): void;
}

interface FaceSource {
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  aspect: number;
}

interface Sources {
  image: FaceSource[];
  chat: FaceSource[];
  sparkle: FaceSource;
  drawing: FaceSource;
  letter: FaceSource;
  vinyl: FaceSource;
  side: Record<keyof TextureLibrary["side"], HTMLCanvasElement>;
  cuts: Record<keyof TextureLibrary["cuts"], HTMLCanvasElement>;
  decor: DecorSources;
  genuine: Record<keyof TextureLibrary["genuine"], HTMLCanvasElement>;
  electronics: ElectronicsSources;
}

function finish<T extends THREE.Texture>(texture: T, repeat = false): T {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 1;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

const toTexture = (canvas: HTMLCanvasElement) => finish(new THREE.CanvasTexture(canvas));

function faceSource(
  front: HTMLCanvasElement,
  back: HTMLCanvasElement,
  aspect = front.width / front.height,
): FaceSource {
  return { front, back, aspect };
}

async function loadImage(name: string) {
  const src = `${ASSET_BASE}/${name}.webp`;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  try {
    await img.decode();
  } catch {
    // WebKit rejects decode() spuriously, so only a broken or never-loading image is a failure.
    // A broken image is already `complete`, and its error event has already fired.
    if (img.complete) {
      if (!img.naturalWidth) throw new Error(`Failed to load ${src}`);
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Failed to load ${src}`));
      });
    }
  }
  return img;
}

async function loadFonts() {
  const faces = [
    '400 16px "Commit Mono"',
    '900 32px "Pretendard Variable"',
    '600 16px "Pretendard Variable"',
    '32px "Cedarville Cursive"',
  ];
  await Promise.all(faces.map((face) => document.fonts.load(face).catch(() => [])));
}

const STOCK = [
  { img: "img-hologram", id: 48213 },
  { img: "img-castle", id: 51907 },
  { img: "img-portrait", id: 48764 },
  { img: "img-robot", id: 50122 },
];

// Between groups, so the first build is a run of short tasks instead of one long one.
const yieldToMain = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

async function buildSources(): Promise<Sources> {
  const names = [...TV_VIDEOS.map((v) => v.img), ...STOCK.map((s) => s.img)];
  const [images] = await Promise.all([Promise.all(names.map(loadImage)), loadFonts()]);
  const image = (name: string) => images[names.indexOf(name)];

  const stock = STOCK.map(({ img, id }, i) => paintPictureFaces(image(img), id, 300 + i));
  await yieldToMain();

  const chat = paintChatFaces();
  await yieldToMain();

  const sparkle = paintGemFaces();
  const decor = paintDecor(1300);
  await yieldToMain();
  const kids = paintDrawing();
  const drawing = faceSource(kids.front, kids.back);
  await yieldToMain();

  const grandma = paintLetter();
  const letter = faceSource(grandma.front, grandma.back);
  await yieldToMain();

  const lp = paintVinyl();
  const vinyl = faceSource(lp.front, lp.back);
  const genuineEdges = paintGenuineEdges();
  const genuine = {
    magnetFace: paintMagnetFace(),
    magnetSide: genuineEdges.magnet,
    wax: paintWax(),
  };
  await yieldToMain();

  const devices = await paintElectronics(image, yieldToMain);

  const cuts = {
    paper: paintCutPaper(1205),
    vinyl: paintCutVinyl(1206),
  };
  await yieldToMain();

  return {
    image: stock,
    decor,
    electronics: devices,
    chat,
    sparkle,
    drawing,
    letter,
    vinyl,
    side: {
      paper: genuineEdges.paper,
      vinyl: genuineEdges.vinyl,
    },
    cuts,
    genuine,
  };
}

function wrapSources(src: Sources): TextureLibrary {
  // Keyed by canvas so faces that share a canvas share one texture.
  const canvasTextures = new Map<HTMLCanvasElement, THREE.Texture>();
  const canvasTexture = (canvas: HTMLCanvasElement) => {
    let texture = canvasTextures.get(canvas);
    if (!texture) {
      texture = toTexture(canvas);
      canvasTextures.set(canvas, texture);
    }
    return texture;
  };
  const face = ({ front, back, aspect }: FaceSource): FaceSet => ({
    front: canvasTexture(front),
    back: canvasTexture(back),
    aspect,
  });
  const tiled: THREE.Texture[] = [];
  const tiledTexture = (canvas: HTMLCanvasElement) => {
    const texture = finish(new THREE.CanvasTexture(canvas), true);
    tiled.push(texture);
    return texture;
  };

  const lib: Omit<TextureLibrary, "dispose"> = {
    image: src.image.map(face),
    decor: wrapDecor(src.decor, canvasTexture, tiledTexture),
    electronics: wrapElectronics(src.electronics, canvasTexture, tiledTexture),
    chat: src.chat.map(face),
    sparkle: face(src.sparkle),
    drawing: face(src.drawing),
    letter: face(src.letter),
    vinyl: face(src.vinyl),
    side: {
      paper: canvasTexture(src.side.paper),
      vinyl: canvasTexture(src.side.vinyl),
    },
    cuts: {
      paper: tiledTexture(src.cuts.paper),
      vinyl: tiledTexture(src.cuts.vinyl),
    },
    genuine: {
      magnetFace: canvasTexture(src.genuine.magnetFace),
      magnetSide: canvasTexture(src.genuine.magnetSide),
      wax: canvasTexture(src.genuine.wax),
    },
  };

  const textures = [...canvasTextures.values(), ...tiled];
  return {
    ...lib,
    dispose() {
      for (const texture of textures) texture.dispose();
    },
  };
}

// Drawn once per page and shared: each library wraps the same canvases in its own textures, so
// reopening the experiment (or StrictMode's second mount) skips the per-pixel passes. Nothing may
// draw into them after the build.
let sources: Promise<Sources> | null = null;

export async function loadTextureLibrary(): Promise<TextureLibrary> {
  sources ??= buildSources().catch((error: unknown) => {
    sources = null;
    throw error;
  });
  return wrapSources(await sources);
}
