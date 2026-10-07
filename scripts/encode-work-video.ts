// Encodes a screen recording into the webm + mp4 pair the home page's work videos use: 1920px
// wide, 25fps, silent, H.264 (Safari) and VP9 (everyone else).
// Run locally: `bun scripts/encode-work-video.ts <source.mov> public/videos/<project>/<name> [--footage]`.
// The outputs are committed; Vercel's build has no ffmpeg (see vercel-build-no-ffmpeg in memory).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname!, "..");
const args = process.argv.slice(2);
const [source, outBase] = args.filter((a) => !a.startsWith("--"));

// The default CRFs keep UI text and fine patterns crisp. Real camera footage is soft to begin with
// and costs ~3x the bits at those settings for no visible gain, so --footage relaxes them.
const footage = args.includes("--footage");
const MP4_CRF = footage ? 26 : 18;
const WEBM_CRF = footage ? 32 : 22;

const speedArg = args.find((a) => a.startsWith("--speed="));
const SPEED = speedArg ? Number(speedArg.slice("--speed=".length)) : 1;

// End point in seconds of the source, before any speed-up.
const toArg = args.find((a) => a.startsWith("--to="));
const trim = toArg ? ["-t", toArg.slice("--to=".length)] : [];

if (!source || !outBase) {
  console.error("Usage: bun scripts/encode-work-video.ts <source> <public/videos/.../name>");
  process.exit(1);
}
if (!fs.existsSync(source)) {
  console.error(`Source clip not found: ${source}`);
  process.exit(1);
}

// 1920 rather than the older clips' 1536: the card is ~950 CSS px wide on a large screen, so
// at 2x DPR anything narrower gets upscaled and reads soft.
const WIDTH = 1920;
const FPS = 25;

// macOS window recordings (Cmd+Shift+5 on a window) carry the window's rounded bottom corners as
// black wedges and a 1px edge down each side. On a 2x display both are gone after trimming 2px
// from the sides and 32px from the bottom.
const CROP = "iw-4:ih-32:2:0";

const filter = `crop=${CROP},setpts=PTS/${SPEED},fps=${FPS},scale=${WIDTH}:-2:flags=lanczos,format=yuv420p`;

fs.mkdirSync(path.dirname(path.resolve(ROOT, outBase)), { recursive: true });

const encodes = [
  {
    ext: "mp4",
    args: [
      "-c:v",
      "libx264",
      "-preset",
      "slower",
      "-crf",
      String(MP4_CRF),
      "-profile:v",
      "high",
      "-movflags",
      "+faststart",
    ],
  },
  {
    ext: "webm",
    args: [
      "-c:v",
      "libvpx-vp9",
      "-crf",
      String(WEBM_CRF),
      "-b:v",
      "0",
      "-deadline",
      "good",
      "-cpu-used",
      "1",
      "-row-mt",
      "1",
    ],
  },
];

for (const { ext, args } of encodes) {
  const out = path.resolve(ROOT, `${outBase}.${ext}`);
  execFileSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", ...trim, "-i", source, "-an", "-vf", filter, ...args, out],
    { stdio: "inherit" },
  );
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`${path.relative(ROOT, out)}  ${kb} kB`);
}

console.log("Now regenerate the manifest: bun scripts/build-video-manifest.ts");
