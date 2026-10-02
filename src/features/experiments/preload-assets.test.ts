// The hover-preload lists must match what's on disk: a file added to an experiment's asset
// folder but missing from its list would load cold, and a stale entry would 404 on hover.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { CLAUDE_2010_ASSETS } from "./components/claude-2010-assets";
import { SLOP_NINJA_ASSETS } from "./components/slop-ninja/assets";

const PUBLIC = path.resolve(import.meta.dirname!, "../../../public");

const folder = (url: string) => url.slice(0, url.lastIndexOf("/"));
const filesIn = (dir: string) =>
  fs
    .readdirSync(path.join(PUBLIC, dir))
    .filter((name) => !name.startsWith("."))
    .map((name) => `${dir}/${name}`)
    .sort();

describe("experiment preload lists", () => {
  for (const [name, assets] of [
    ["claude-2010", CLAUDE_2010_ASSETS],
    ["slop-ninja", SLOP_NINJA_ASSETS],
  ] as const) {
    test(`${name} lists exactly the files in its asset folder`, () => {
      const dirs = new Set(assets.map(folder));
      expect(dirs.size).toBe(1);
      expect([...assets].sort()).toEqual(filesIn([...dirs][0]));
    });
  }
});
