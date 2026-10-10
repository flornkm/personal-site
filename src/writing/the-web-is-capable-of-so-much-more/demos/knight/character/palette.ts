// A dark knight: cool blackened steel over a warm near-black gambeson and tunic, dark leather, and
// one oxblood accent echoing the plume. Steel and cloth sit on opposite sides of neutral so they
// read as two materials instead of one navy mass. Silver is kept for a few deliberate edges (helm
// rim, pauldron rims, greave tops, shield); everything else steps down to a lighter steel. Pure
// black would lose the toon bands and keylines, so everything sits a few steps above it.
export const COLOR = {
  cloth: 0x2b2726,
  clothFold: 0x37312f,
  clothInside: 0x151313,
  // Oxblood, the plume's colour on the tunic hem: the one warm accent.
  heraldic: 0x5a1f26,
  trousers: 0x221f1f,
  steel: 0x454c5a,
  // A painted toon reflection on plates, and the quiet edge colour where silver would be noise.
  steelLight: 0x5f6979,
  steelDark: 0x30353f,
  steelInside: 0x1b1d22,
  // A painted crescent glint on small round plates (knees, elbows), where a real highlight would
  // land as a blob in their middle.
  steelGlint: 0x7f8999,
  silver: 0xc4ccd6,
  leather: 0x3b2c24,
  leatherDark: 0x2a211c,
  leatherLight: 0x5b4335,
  sole: 0x19181a,
  // Antique pewter: buckles still read, but not as white dots.
  buckle: 0x939ca8,
};

// Gloss per material. The shader makes higher gloss a smaller, crisper, brighter glint. On a
// cylinder or a thin ridge that glint is a streak, which says "polished steel"; on a dome it is a
// round white dot, which on a helm reads as an eye. So domes (helm, pauldrons, knees, elbows) stay
// matte and get a painted sky sheen or crescent instead, and the gloss goes on bracers, lames,
// greaves, cuisses and on the helm's comb and keel.
export const GLOSS = { steel: 0.2, ridge: 0.5, dome: 0, silver: 0.3, leather: 0.03, cloth: 0 };

// A hex colour as 0-255 channels, for per-vertex gradients.
export const rgb = (c: number): [number, number, number] => [
  (c >> 16) & 255,
  (c >> 8) & 255,
  c & 255,
];
