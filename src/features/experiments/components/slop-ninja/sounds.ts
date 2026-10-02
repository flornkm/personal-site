// SFX for Slop Ninja. Every file is synthesized with ffmpeg (no samples).
import { Howl } from "howler";

const AUDIO = "/audio/slop-ninja";
const MUTE_KEY = "slop-ninja-muted";
const RATE_JITTER = 0.06;

const SPECS = {
  swoosh: { variants: 3, volume: 0.45 },
  splat: { variants: 3, volume: 0.8 },
  // Material hits play layered on splat, so they sit a couple of dB under it.
  zap: { variants: 2, volume: 0.65 },
  crack: { variants: 2, volume: 0.7 },
  pop: { variants: 2, volume: 0.62 },
  tink: { variants: 2, volume: 0.58 },
  throw: { variants: 1, volume: 0.25 },
  throwGenuine: { variants: 1, volume: 0.5 },
  combo: { variants: 1, volume: 0.6 },
  miss: { variants: 1, volume: 0.7 },
  explode: { variants: 1, volume: 0.95 },
  gameOver: { variants: 1, volume: 0.7 },
  start: { variants: 1, volume: 0.7 },
} as const;

export type SfxName = keyof typeof SPECS;

let sfx: Record<SfxName, Howl[]> | null = null;
const lastVariant: Partial<Record<SfxName, number>> = {};
let muted: boolean | null = null;
const muteListeners = new Set<() => void>();

export function isMuted() {
  if (muted !== null) return muted;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
  return muted;
}

function ensure() {
  if (sfx) return sfx;
  const loaded = {} as Record<SfxName, Howl[]>;
  for (const [name, spec] of Object.entries(SPECS) as [SfxName, (typeof SPECS)[SfxName]][]) {
    loaded[name] = Array.from({ length: spec.variants }, (_, i) => {
      const file = spec.variants > 1 ? `${name}-${i + 1}` : name;
      return new Howl({ src: [`${AUDIO}/${file}.mp3`], volume: spec.volume, preload: true });
    });
  }
  sfx = loaded;
  return loaded;
}

// Never the same variant twice in a row, so rapid swipes don't sound like a loop.
function pickVariant(name: SfxName, count: number) {
  if (count === 1) return 0;
  const previous = lastVariant[name];
  let next = Math.floor(Math.random() * (previous === undefined ? count : count - 1));
  if (previous !== undefined && next >= previous) next += 1;
  lastVariant[name] = next;
  return next;
}

// Fetch every file up front so the first slice isn't silent while its mp3 downloads.
export function preloadSfx() {
  ensure();
}

export function playSfx(name: SfxName, opts?: { volume?: number; rate?: number }) {
  if (isMuted()) return;
  const variants = ensure()[name];
  const howl = variants[pickVariant(name, variants.length)];
  const volume = Math.min(1, Math.max(0, SPECS[name].volume * (opts?.volume ?? 1)));
  // An explicit rate is a pitch the caller asked for (the combo ladder), so it plays exactly.
  const jitter = opts?.rate === undefined ? 1 + (Math.random() * 2 - 1) * RATE_JITTER : 1;
  const rate = Math.min(4, Math.max(0.5, (opts?.rate ?? 1) * jitter));
  const id = howl.play();
  howl.volume(volume, id);
  howl.rate(rate, id);
}

export function setMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    // storage blocked (private mode, sandboxed iframe): keep the in-memory state
  }
  for (const listener of muteListeners) listener();
  if (!sfx) return;
  for (const variants of Object.values(sfx)) {
    for (const howl of variants) howl.mute(next);
  }
}

export function subscribeMuted(listener: () => void) {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

export function unloadSfx() {
  if (!sfx) return;
  for (const variants of Object.values(sfx)) {
    for (const howl of variants) howl.unload();
  }
  sfx = null;
}
