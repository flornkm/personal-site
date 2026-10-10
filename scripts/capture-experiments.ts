/**
 * Captures a poster for each experiment by opening its dialog in a headless Chrome
 * and screenshotting the open box on a TRANSPARENT background. We capture twice —
 * once in each color scheme — so the components (which theme themselves via
 * prefers-color-scheme CSS variables) render their light and dark chrome. The grid
 * then swaps the two via a <picture> media source, so dark mode costs no JS.
 * Components that paint their own background (3D scenes, video, the CRT) stay opaque.
 * Run with the dev server up:
 *
 *   bun run dev            # in one shell
 *   bun scripts/capture-experiments.ts
 *
 * Output: public/experiments/<slug>.webp       (light, transparent where allowed)
 *         public/experiments/<slug>-dark.webp   (dark)
 */
import { chromium } from "playwright-core";
import type { Locator, Page } from "playwright-core";
import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";

const BASE = process.env.CAPTURE_BASE ?? "http://localhost:3000";
const OUT = "public/experiments";

// Posters render at ~200px in the grid (and briefly mid-morph), so downscale the
// retina screenshot and encode to webp (alpha-aware) with cwebp.
const MAX_WIDTH = Number(process.env.CAPTURE_WIDTH ?? 1000);
const WEBP_QUALITY = 80;

function toWebp(png: string, webp: string) {
  spawnSync(
    "cwebp",
    ["-q", String(WEBP_QUALITY), "-resize", String(MAX_WIDTH), "0", png, "-o", webp],
    { stdio: "ignore" },
  );
}

// Components whose root still paints an opaque fill that must be cleared for a
// transparent capture. (slop-detector / frosted-camera / depth-input now inherit the
// dialog background instead, so they no longer need stripping.)
const STRIP_ROOT_BG = new Set<string>([]);

// Settle time applied to every capture on top of the per-slug time below, so
// animations finish and any transient dev overlay has come and gone.
const BASE_SETTLE = 2500;

// slug → extra settle time (ms) for things that animate or boot slowly.
const SLUGS: Record<string, number> = {
  "overlap-type": 1000, // letters drop-stagger into their rotated pile, then settle
  "world-cup": 1200, // continuous zoom loop; a beat so the bands populate + fonts settle
  "dot-clock": 3000, // dots pack into the time and settle under collision
  "node-map": 1200, // path draw-in settles
  "digital-garden": 2000, // grow + sway animations settle
  "machine-plate": 3500, // WebGL boot + material texture rasterizes
  "chrome-horse": 2500, // silhouette rasterizes + chrome settles
  "sticker-file": 1800, // sticker texture rasterizes + uploads async
  "slop-detector": 3500, // WebGL boot + first render
  "frosted-camera": 2500, // fake camera stream
  "crt-terminal": 2500, // typing animation
  "windows-xp": 1500, // pop-in + logo rasterizes on mount
  "transit-ticket": 1200, // static vector art; just needs a paint
  flo: 1000, // rough.js frames build on mount; a beat to draw + settle the boil
  "video-tapes": 2500, // WebGL boot + label textures rasterize
  "prism-orb": 2500, // WebGL boot + the page-behind raster waits on document.fonts.ready
  "claude-mark": 2500, // WebGL boot + the spokes settle out of their mount burst
  "magnet-mark": 2000, // WebGL boot + the tiles assemble into the wordmark
  "claude-2010": 2500, // room webp assets load + first pixelated render
  "icon-lens": 2500, // WebGL boot + the engraving texture rasterizes
  "liquid-glass": 2500, // WebGL boot + the type raster waits on document.fonts.ready
  "slop-ninja": 2500, // WebGL boot + textures load + the menu prop pops in
  "tiny-objects": 2000, // eight WebGL contexts boot and draw their first frame
};

// Optionally restrict to a subset, e.g. CAPTURE_ONLY=copy,paste-editor
const ONLY = process.env.CAPTURE_ONLY?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Optional click (selector inside the open dialog) to put a slug into a more telling
// state before the shot.
const CLICKS: Record<string, string> = {};

// Optional interaction to stage a slug right before the shot (after the settle
// wait) — the live demo is untouched.
const PREPARE: Record<string, (dialog: Locator, page: Page) => Promise<void>> = {
  // A ghost blade sweeps the start screen's prop every few seconds. Hold a still press in an
  // empty corner (it suppresses the ghost and cuts nothing) so the poster is just the prop, and
  // leave the mute button out of the thumbnail.
  "slop-ninja": async (dialog, page) => {
    await dialog.locator('[aria-label="Mute sound"]').evaluate((el: HTMLElement) => {
      el.style.display = "none";
    });
    const box = await dialog.boundingBox();
    if (!box) return;
    await page.mouse.move(box.x + box.width * 0.06, box.y + box.height * 0.1);
    await page.mouse.down();
    await page.waitForTimeout(600);
  },
  // Opens as a plain wordmark. Click inside it and shoot a fifth of a second later, so
  // the poster catches the shockwave's ring while it is still crossing the mark.
  "magnet-mark": async (dialog, page) => {
    const box = await dialog.boundingBox();
    if (!box) return;
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
    await page.waitForTimeout(400);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(220);
  },
  // Stage a pasted attachment so the poster shows the chip and the active send button.
  "paste-editor": async (dialog, page) => {
    const sample = [
      "# Drawer component spec",
      "",
      "The drawer should feel like a natural extension of the page.",
      "",
      "- Opens from the bottom on mobile",
      "- Swipe down to dismiss",
      "- Background scales to 0.97 while open",
    ].join("\n");
    await dialog
      .locator("textarea")
      .first()
      .evaluate((el, text) => {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        el.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
        );
      }, sample);
    await page.waitForTimeout(700);
  },
};

// Capture every slug in one color scheme. `suffix` is appended to the output name
// ("" for light, "-dark" for dark) so the grid can pick the file by media query. The
// dark pass relies on each component theming itself via prefers-color-scheme, which
// Playwright drives through the context's `colorScheme`.
async function captureScheme(scheme: "light" | "dark", suffix: string) {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--ignore-gpu-blocklist",
      "--enable-gpu",
      "--use-gl=angle",
      "--use-angle=swiftshader",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // retina-crisp posters
    permissions: ["camera"],
    colorScheme: scheme,
  });

  // react-scan is injected in dev (import.meta.env.DEV) and paints render badges
  // over the UI. Block it outright so captures are clean against any server.
  await context.route(
    (url) => url.href.includes("react-scan"),
    (route) => route.abort(),
  );

  for (const [slug, settle] of Object.entries(SLUGS)) {
    if (ONLY && !ONLY.includes(slug)) continue;
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/experiments?demo=${slug}`, { waitUntil: "networkidle" });
      const dialog = page.locator('[data-experiment-tile="open"]');
      await dialog.waitFor({ state: "visible", timeout: 15000 });

      const click = CLICKS[slug];
      if (click)
        await dialog
          .locator(click)
          .click()
          .catch(() => {});

      // Isolate the dialog so the screenshot's only opaque pixels are the ones the
      // component itself paints. omitBackground removes the browser default, but the
      // app's own body bg + the z-[100] backdrop sit *behind* the (transparent) dialog
      // and would show through — so hide everything via visibility and clear page bgs,
      // then re-show just the dialog subtree (visibility:visible cascades to children).
      await page.evaluate((stripRootBg) => {
        document.documentElement.style.background = "transparent";
        document.body.style.background = "transparent";
        document.body.style.visibility = "hidden";
        const el = document.querySelector('[data-experiment-tile="open"]') as HTMLElement | null;
        if (el) {
          el.style.visibility = "visible";
          el.style.background = "transparent";
          el.style.borderRadius = "0";
        }
        if (stripRootBg) {
          // First .bg-primary is the component's root fill; clear only that.
          const root = el?.querySelector(".bg-primary") as HTMLElement | null;
          if (root) root.style.background = "transparent";
        }
        // Every Close, not the first one on the page: the contact dialog and the mobile
        // drawer carry the same label, so a querySelector could match one of those and
        // leave the tile's own close button sitting in the poster.
        for (const c of document.querySelectorAll<HTMLElement>('[aria-label="Close"]'))
          c.style.display = "none";
        // Credit footnotes belong in the live demo, not the poster thumbnail.
        for (const c of document.querySelectorAll<HTMLElement>("[data-node-credit]"))
          c.style.display = "none";
      }, STRIP_ROOT_BG.has(slug));

      await page.waitForTimeout(BASE_SETTLE + settle);

      await PREPARE[slug]?.(dialog, page);

      const png = `${OUT}/${slug}${suffix}.png`;
      const webp = `${OUT}/${slug}${suffix}.webp`;
      await dialog.screenshot({ path: png, type: "png", omitBackground: true });
      toWebp(png, webp);
      await rm(png, { force: true });
      console.log(`✓ ${slug}${suffix}.webp`);
    } catch (err) {
      console.error(`✗ ${slug}${suffix}:`, err instanceof Error ? err.message : err);
    } finally {
      await page.close();
    }
  }

  await context.close();
  await browser.close();
}

// IMPORTANT: run this file directly (`bun scripts/capture-experiments.ts`), NOT via
// `bun run capture:experiments`. bunfig's `[run] bun = true` routes package scripts
// through Bun's node shim, which breaks Playwright's screenshot pipeline and yields
// blank, fully-transparent posters.
async function main() {
  await mkdir(OUT, { recursive: true });

  await captureScheme("light", "");
  await captureScheme("dark", "-dark");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
