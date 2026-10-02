// Chat bubble silhouette, as fractions of the body height (corner) and body width/height (tail).
// models-decor.ts builds the pillow from these and paint-decor.ts paints onto its rings; the gem's
// numbers live in models-decor.ts (GEM).
export const CHAT_CORNER = 0.42;
export const CHAT_CORNER_SEGMENTS = 4;
export const CHAT_TAIL = { x: 0.08, back: 0.1, forward: 0.2, drop: 0.32 };
