// Regression guards for the agent-facing surface: markdown page coverage,
// robots.txt allowing AI agents, and llms.txt only linking real pages.
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { normalizePathname } from "../src/lib/agent-content";
import { markdownPages } from "../src/markdownMap.gen";

const ROOT = path.resolve(import.meta.dirname!, "..");

// Mirrors scripts/build-sitemap.ts: every static route file plus writing posts.
function routePaths(dir: string, prefix = ""): string[] {
  const paths: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      paths.push(...routePaths(path.join(dir, entry.name), `${prefix}/${entry.name}`));
      continue;
    }
    if (!entry.name.endsWith(".tsx") || entry.name === "__root.tsx" || entry.name.includes("$")) {
      continue;
    }
    const base = entry.name.replace(/\.tsx$/, "");
    paths.push(base === "index" ? prefix || "/" : `${prefix}/${base}`);
  }
  return paths;
}

describe("markdown page coverage", () => {
  const routes = routePaths(path.join(ROOT, "src/routes"));
  const writing = fs
    .readdirSync(path.join(ROOT, "src/writing"), { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() && fs.existsSync(path.join(ROOT, "src/writing", e.name, "article.mdx")),
    )
    .map((e) => `/writing/${e.name}`);

  it.each([...routes, ...writing])("has a markdown variant for %s", (route: string) => {
    expect(markdownPages[route]).toBeDefined();
    expect(markdownPages[route]!.markdown.length).toBeGreaterThan(100);
  });

  it("gives the homepage an H1 and 500+ chars of text", () => {
    const home = markdownPages["/"]!.markdown;
    expect(home.startsWith("# ")).toBe(true);
    expect(home.length).toBeGreaterThan(500);
  });

  it("stamps every page with its canonical URL", () => {
    for (const [route, page] of Object.entries(markdownPages)) {
      expect(page.markdown).toContain(
        `Canonical: https://floriankiem.com${route === "/" ? "" : route}`,
      );
    }
  });
});

describe("robots.txt", () => {
  const robots = fs.readFileSync(path.join(ROOT, "public/robots.txt"), "utf8");

  it("does not disallow anything", () => {
    const disallows = robots
      .split("\n")
      .filter((line) => /^disallow:/i.test(line.trim()))
      .map((line) => line.split(":")[1]!.trim())
      .filter(Boolean);
    expect(disallows).toEqual([]);
  });

  it("explicitly welcomes the major AI agents", () => {
    for (const agent of [
      "GPTBot",
      "ChatGPT-User",
      "ClaudeBot",
      "Claude-User",
      "PerplexityBot",
      "Google-Extended",
      "Applebot-Extended",
      "DeepSeekBot",
    ]) {
      expect(robots).toContain(`User-agent: ${agent}`);
    }
    expect(robots).toContain("Allow: /");
  });

  it("points at the sitemap", () => {
    expect(robots).toContain("Sitemap: https://floriankiem.com/sitemap.xml");
  });
});

describe("llms.txt", () => {
  const llms = fs.readFileSync(path.join(ROOT, "public/llms.txt"), "utf8");

  it("only links to pages that exist", () => {
    const internal = [...llms.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]!);
    expect(internal.length).toBeGreaterThan(0);
    for (const link of internal) {
      const exists =
        // Resolved the way the middleware resolves a request, so a `.md` link is checked
        // against the page it actually names rather than being read as a missing file.
        normalizePathname(link) in markdownPages ||
        fs.existsSync(path.join(ROOT, "public", link)) ||
        link === "/sitemap.xml"; // generated into public/ at build time
      expect(exists, `llms.txt links to nonexistent page ${link}`).toBe(true);
    }
  });

  // The `.md` suffix is the only form an agent can reach without setting a header, so it is
  // the one that has to be written down somewhere findable.
  it("documents both ways to ask for markdown", () => {
    expect(llms).toContain("Accept: text/markdown");
    expect(llms).toMatch(/append `\.md`/i);
  });
});

describe("MDX to markdown", () => {
  const writingDir = path.join(ROOT, "src/writing");
  const posts = fs
    .readdirSync(writingDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(writingDir, e.name, "article.mdx")))
    .map((e) => e.name);

  /** Every `<Component />` in a post's article, paired with its sidecar path if one exists. */
  function componentsIn(slug: string) {
    const dir = path.join(writingDir, slug);
    const source = fs.readFileSync(path.join(dir, "article.mdx"), "utf8");
    const sources = new Map<string, string>();
    for (const [, names, from] of source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+"([^"]+)"/gm)) {
      for (const entry of names!.split(",")) sources.set(entry.trim(), from!);
    }
    return [...source.matchAll(/<([A-Z]\w*)/g)].map((m) => {
      const name = m[1]!;
      const from = sources.get(name);
      const sidecar = from?.startsWith(".") ? `${path.resolve(dir, from)}.md` : undefined;
      return { name, sidecar: sidecar && fs.existsSync(sidecar) ? sidecar : undefined };
    });
  }

  // The whole point of the conversion: a demo the page lets you play with becomes, in the twin,
  // the code that makes it work. An agent handed only the interactive-content note is left to
  // invent the CSS, which is what this post promising "give it your agent" was doing before.
  // Compared block by block, so a line lost from the middle of one still fails.
  it.each(posts)("inlines each demo's code into the twin of %s", (slug: string) => {
    const twin = markdownPages[`/writing/${slug}`]!.markdown;

    for (const { sidecar } of componentsIn(slug)) {
      if (!sidecar) continue;
      const code = fs.readFileSync(sidecar, "utf8");
      const blocks = [...code.matchAll(/^```[^\n]*\n[\s\S]*?^```/gm)].map((m) => m[0]);
      expect(blocks.length, `${path.basename(sidecar)} has no code to inline`).toBeGreaterThan(0);
      for (const block of blocks) expect(twin).toContain(block);
    }
  });

  // A demo with no sidecar still gets the note; page furniture becomes nothing at all. Either
  // way no JSX survives — a component left in the twin, whether it stood on its own line or sat
  // inline in a sentence, is markup an agent has to step over.
  it.each(posts)("leaves no JSX in the twin of %s", (slug: string) => {
    const twin = markdownPages[`/writing/${slug}`]!.markdown;
    const outsideFences = twin.replace(/^```[\s\S]*?^```/gm, "");
    // Footnotes turn into markdown footnotes and the copy button into nothing; neither is a
    // demo standing in for a note.
    const uncovered = componentsIn(slug).filter(
      ({ name, sidecar }) =>
        !sidecar && !["CopyAsMarkdown", "FootnoteRefs", "Footnotes"].includes(name),
    );

    expect((twin.match(/\*\(Interactive content on the web page\.\)\*/g) ?? []).length).toBe(
      uncovered.length,
    );
    expect(outsideFences).not.toMatch(/<[A-Za-z]\w*/);
  });

  // A reference in a sentence has to land on a definition at the end, or the number points
  // at nothing.
  it.each(posts)("resolves every footnote reference in the twin of %s", (slug: string) => {
    const twin = markdownPages[`/writing/${slug}`]!.markdown;
    const source = fs.readFileSync(path.join(writingDir, slug, "article.mdx"), "utf8");
    const references = [...source.matchAll(/<FootnoteRefs\b[^>]*sources="([^"]*)"/g)].flatMap(
      ([, sources]) => sources!.split(",").map((n) => n.trim()),
    );
    for (const number of references) {
      expect(twin).toContain(`[^${number}]`);
      expect(twin).toMatch(new RegExp(`^\\[\\^${number}\\]: .+`, "m"));
    }
    expect(twin).not.toContain("<Footnote");
  });
});
