// Every image Slop Ninja fetches at boot, kept apart from the game so the experiments grid can
// warm them on hover without pulling in three.js. The sounds load through Howler at boot.

export const ASSET_BASE = "/experiments/slop-ninja";

const IMAGES = [
  // Thumbnails on the TV screens and the phone posts.
  "yt-shrimp",
  "yt-kitten",
  "yt-carving",
  "yt-astro",
  // Stock photos in the gilt frames.
  "img-hologram",
  "img-castle",
  "img-portrait",
  "img-robot",
  // The hit poof's sprite sheets.
  "fx-poof",
  "fx-glints",
];

export const SLOP_NINJA_ASSETS = IMAGES.map((name) => `${ASSET_BASE}/${name}.webp`);
