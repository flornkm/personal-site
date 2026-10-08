---
name: writing-icons-creator
description: Create or update the small symbol icon shown for a writing/blog post on the /writing grid. Use whenever a new post is added to src/writing, when an existing post needs a better-fitting icon, or when the user asks to "make an icon", "pick a symbol", or "design the mark" for a writing. Produces a single 32×32 SVG saved as icon.svg in the post's folder.
---

# Writing icons creator

Each writing on the `/writing` grid shows one small **symbol icon**. This skill explains exactly how to author one so it matches the existing visual language. Stay inside the rules below — the look is deliberately tiny and uniform.

## The 1-minute summary

1. Pick **one shape** from the allowed set based on the post's meaning.
2. Pick **one color** from the palette.
3. Copy the matching template, drop in the color.
4. Save it as `src/writing/<slug>/icon.svg` (next to the post's `article.mdx`).

That's it. No build step — the icon is picked up automatically.

## Where icons live

Each post is a folder:

- Post content: `src/writing/<slug>/article.mdx`
- Its icon: `src/writing/<slug>/icon.svg`

Example: `src/writing/the-art-of-not-shipping-everything/{article.mdx, icon.svg}`.

If **no** `icon.svg` exists, a colored fallback icon is auto-generated from the slug (see `src/features/writing/lib/post-icon.ts`). Authoring an `icon.svg` always overrides the fallback. Prefer authoring one so the symbol actually relates to the post.

The same icon is reused automatically in the article's **social/OG image** (`api/og.ts` receives it pre-rendered from the route loader) — no extra step, but it's a good reason to make the mark meaningful.

## The rules (do not deviate)

- **Canvas:** always `viewBox="0 0 32 32"`. Center is `(16, 16)`.
- **Allowed shapes ONLY:** `triangle`, `square`, `hexagon` (each carrying a center **mark**, either a **×** or a **✓**), or `flower` (no mark). Nothing else — no icons-as-pictograms, no letters, no line art, no gradients, no extra detail.
- **Fill:** one solid color from the palette.
- **Outline:** clear black `#171717`, `stroke-width="1.4"`. **Sharp corners** — use `stroke-linejoin="miter"`; never `round`.
- **The center mark:** black `#171717`, `stroke-width="1.55"`, `fill="none"`. **Sharp ends** — no `stroke-linecap="round"` (leave it at the default butt cap). Present on triangle/square/hexagon, **absent** on the flower. Two marks exist and they share one bounding box (x 12.5–19.5, 7px tall around the center) so they carry the same optical weight:
  - **×** — "no / removed / not done". The default.
  - **✓** — "do this / the recommended way". Use for posts that advise rather than warn, and whenever a neighboring post already owns the × in a similar color.
- Put all styling on an **inner `<g>`** (keep the root `<svg>` to just `viewBox` + size). The loader inlines the SVG, so a clean inner group is the most predictable.
- Keep it flat. The whole point is a simple, recognizable silhouette at ~56px.

## Color palette

Use one of these exact hex values (they read on both light and dark backgrounds):

| Name       | Hex       |
| ---------- | --------- |
| yellow     | `#f2c94c` |
| orange     | `#e8643c` |
| olive      | `#8d9150` |
| sage       | `#6fae9f` |
| clay       | `#d98e5a` |
| rose       | `#b8607a` |
| dusty blue | `#7e9cc4` |
| gold       | `#caa84a` |

Pick a color that fits the mood; avoid reusing the same color as a neighboring post if you can.

## How to choose the shape (be intentional)

The mark should _mean something_ about the post. Lean on the symbolism the constrained set allows:

- **flower** — generative, organic, growth, creativity, something blooming/alive. (The "hero" mark — use sparingly.)
- **square + ×** — a box/package, a thing, a unit; the × reads as "no / removed / not done". Great for restraint, cutting scope, "not shipping".
- **triangle + ×** — warning, tension, a hard stop, caution.
- **hexagon + ×** — system, structure, a cell/module, engineering.

If nothing fits cleanly, default to **square + ×** in a calm color.

## Copy-paste templates

Replace `FILL` with a palette hex. Everything else stays byte-for-byte.

### Square + × (box / unit; × = "no / not done")

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <g fill="FILL" stroke="#171717" stroke-width="1.4" stroke-linejoin="miter">
    <path d="M7 7 H25 V25 H7 Z" />
    <path d="M12.5 12.5 L19.5 19.5 M19.5 12.5 L12.5 19.5" fill="none" stroke="#171717" stroke-width="1.55" />
  </g>
</svg>
```

### Triangle + × (warning / stop)

The × sits a touch lower because the triangle's visual center is below its midpoint.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <g fill="FILL" stroke="#171717" stroke-width="1.4" stroke-linejoin="miter">
    <path d="M16 4 L27.5 26 L4.5 26 Z" />
    <path d="M12.5 14.5 L19.5 21.5 M19.5 14.5 L12.5 21.5" fill="none" stroke="#171717" stroke-width="1.55" />
  </g>
</svg>
```

### Hexagon + × (system / structure)

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <g fill="FILL" stroke="#171717" stroke-width="1.4" stroke-linejoin="miter">
    <path d="M16 4 L26.4 10 V22 L16 28 L5.6 22 V10 Z" />
    <path d="M12.5 12.5 L19.5 19.5 M19.5 12.5 L12.5 19.5" fill="none" stroke="#171717" stroke-width="1.55" />
  </g>
</svg>
```

### Swapping the × for a ✓ (advice / do this)

Any of the three polygons takes the check instead of the cross. Replace only the mark path; the shape path and every other attribute stay identical. The check is written around the shape's `cy` — `16` for square and hexagon, `18` for the triangle (so the triangle's is `M12.5 18 L15 20.8 L19.5 14.8`).

```svg
<path d="M12.5 16 L15 18.8 L19.5 12.8" fill="none" stroke="#171717" stroke-width="1.55" />
```

Full example, hexagon + ✓:

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <g fill="FILL" stroke="#171717" stroke-width="1.4" stroke-linejoin="miter">
    <path d="M16 4 L26.4 10 V22 L16 28 L5.6 22 V10 Z" />
    <path d="M12.5 16 L15 18.8 L19.5 12.8" fill="none" stroke="#171717" stroke-width="1.55" />
  </g>
</svg>
```

### Flower (organic / generative — no ×)

A single scalloped path of 8 petals. Use the path exactly as-is.

```svg
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M 25.50 16.00 A 3.64 3.64 0 0 1 22.72 22.72 A 3.64 3.64 0 0 1 16.00 25.50 A 3.64 3.64 0 0 1 9.28 22.72 A 3.64 3.64 0 0 1 6.50 16.00 A 3.64 3.64 0 0 1 9.28 9.28 A 3.64 3.64 0 0 1 16.00 6.50 A 3.64 3.64 0 0 1 22.72 9.28 A 3.64 3.64 0 0 1 25.50 16.00 Z"
    fill="FILL"
    stroke="#171717"
    stroke-width="1.4"
  />
</svg>
```

## Step-by-step

1. Confirm the post slug: it's the `.mdx` filename without the extension.
2. Read the post (title + opening) to understand its theme.
3. Choose shape + color using the guidance above.
4. Copy the matching template and replace `FILL` with the chosen hex.
5. Save to `src/writing/<slug>/icon.svg`.
6. Sanity-check: open `/writing` (the icon renders at ~56px on a grey tile). It should be a single clean, filled, black-outlined symbol — no stray internal lines, no off-center ×.

## Common mistakes to avoid

- ❌ Putting `fill`/`stroke` only on the root `<svg>` and leaving shapes unstyled — inheritance can be lost when inlined. Style the inner `<g>` (or each path) explicitly, as the templates do.
- ❌ Using `currentColor` — always hardcode the palette hex so the color is intentional.
- ❌ Inventing new shapes, adding text, drawing literal objects, or using more than one color. Keep to the four marks.
- ❌ Forgetting the center mark on triangle/square/hexagon, or adding one to the flower.
- ❌ Reaching for the × out of habit when a neighboring post already uses it — read the other `icon.svg` files first and take the ✓ if the × is spoken for.
- ❌ Rounding the corners or × ends — joins are `miter` and caps are the default butt; never `round`.
- ❌ Using pure `#000` / pure white. The outline is `#171717`; fills come from the palette only.

## Adding a brand-new shape or color (rare)

The runtime set is mirrored in `src/features/writing/lib/post-icon.ts` (`PALETTE`, `SHAPE_PATHS`, `SHAPE_KEYS`, `flowerInner`, `cross`). If the user explicitly wants to expand the vocabulary, edit that file **and** this skill together so authored SVGs and the auto-fallback stay in sync. Otherwise, do not expand the set.
