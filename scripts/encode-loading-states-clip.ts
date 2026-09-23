// Cuts the source clip for the "Don't use spinners" figure and encodes three renditions of it.
// Run once, locally: `bun scripts/encode-loading-states-clip.ts [path/to/source.mov]`. The
// outputs are committed; Vercel's build has no ffmpeg (see vercel-build-no-ffmpeg in memory).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname!, "..");
const OUT_DIR = path.join(ROOT, "public/videos/writing/loading-states");
const SOURCE = process.argv[2] ?? path.join(os.homedir(), "Downloads/IMG_2605.mov");

const START_S = 0;
const LENGTH_S = 6;

// Height of the shorter side, and the quality it is encoded at. The lowest rung is deliberately
// soft: it is the one the figure shows first, and it has to look like a placeholder.
const RENDITIONS = [
  { name: "240", size: 240, crf: 36, maxrate: "250k" },
  { name: "480", size: 480, crf: 34, maxrate: "500k" },
  { name: "720", size: 720, crf: 28, maxrate: "1500k" },
  { name: "1080", size: 1080, crf: 26, maxrate: "3500k" },
];

if (!fs.existsSync(SOURCE)) {
  console.error(`Source clip not found: ${SOURCE}`);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const { name, size, crf, maxrate } of RENDITIONS) {
  const out = path.join(OUT_DIR, `clip-${name}.mp4`);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-ss",
      String(START_S),
      "-t",
      String(LENGTH_S),
      "-i",
      SOURCE,
      "-an",
      // Scale the shorter side to the rung's size whichever way the clip is oriented, keeping
      // both dimensions even for yuv420p.
      "-vf",
      `scale='if(gt(iw,ih),-2,${size})':'if(gt(iw,ih),${size},-2)'`,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      String(crf),
      // A ceiling on top of the quality target: a phone clip at 1080 is otherwise far heavier
      // than a blog figure should be.
      "-maxrate",
      maxrate,
      "-bufsize",
      maxrate,
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      out,
    ],
    { stdio: "inherit" },
  );
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`${path.relative(ROOT, out)}  ${kb} kB`);
}

console.log("Now regenerate the manifest: bun scripts/build-video-manifest.ts");
