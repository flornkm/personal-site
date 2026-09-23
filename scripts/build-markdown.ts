// Emits src/markdownMap.gen.ts: a markdown variant of every page, served to agents
// that ask for `Accept: text/markdown` (see server/middleware/markdown.ts). List-like
// pages are derived from the same data modules the routes render (projects, contacts,
// writing frontmatter), so they never drift; the few prose pages mirror the visible
// copy and need a manual sync when that copy changes. Runs as part of `bun run build`.
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { CONTACTS } from "../src/const/contacts";
import { PROJECTS } from "../src/features/work/projects";
import { SITE_URL } from "../src/lib/site";

const ROOT = path.resolve(import.meta.dirname!, "..");
const OUTPUT_PATH = path.join(ROOT, "src/markdownMap.gen.ts");

type Page = { title: string; markdown: string };
const pages: Record<string, Page> = {};

const page = (route: string, title: string, body: string) => {
  const markdown = `${body.trim()}\n\n---\n\nCanonical: ${SITE_URL}${route === "/" ? "" : route}\nMore for agents: ${SITE_URL}/llms.txt\n`;
  pages[route] = { title, markdown };
};

// ---- Home -------------------------------------------------------------------

const projectLine = (p: (typeof PROJECTS)[number]) => {
  const parts = [`### ${p.name} (${p.date})`];
  if (p.description) parts.push(`\n${p.description}`);
  if (p.url) parts.push(`\nWebsite: ${p.url}`);
  return parts.join("");
};

page(
  "/",
  "Work ‹ Florian Kiem",
  `# Florian Kiem — Designs and codes software products. Invests in a few.

I am Florian Kiem, a design engineer building software products in the intersection of design and code. This page shows selected work: interface design, design systems, motion, and front-end engineering. The visual version presents each project through screenshots and short clips.

## Selected work

${PROJECTS.map(projectLine).join("\n\n")}

## More

- [About](${SITE_URL}/about)
- [Writing](${SITE_URL}/writing)
- [Contact](${SITE_URL}/contact)
- [Experiments](${SITE_URL}/experiments)
- [Tools](${SITE_URL}/tools)
- [Colophon](${SITE_URL}/colophon)`,
);

// ---- About (mirrors the copy in src/routes/about.tsx) -----------------------

page(
  "/about",
  "About ‹ Florian Kiem",
  `# About Florian Kiem

Florian Kiem — Designer, Engineer.

Born in the south of Germany, I grew up with the Internet. In my childhood, I tried a bunch of different disciplines, ranging from 3D art to graphic design.

After studying product design, my day-to-day work evolved into something different. Pure Figma designs aren't enough, so I see my value in developing foundational design systems hands-on.

In the past, I've worked with companies like Rogo, Superpower, and Dash0. I also invest in some of the companies I work with.

Reach me on [X](https://x.com/flornkm) or via [email](mailto:hello@floriankiem.com).`,
);

// ---- Contact (mirrors src/routes/contact.tsx) -------------------------------

const contactLines = CONTACTS.map(
  (c) => `- ${c.name}${c.handle ? ` (${c.handle})` : ""}: ${c.href}`,
).join("\n");

page(
  "/contact",
  "Contact ‹ Florian Kiem",
  `# Contact Florian Kiem

The fastest way to reach me is email: hello@floriankiem.com. I read everything that lands there — questions about my work, advisory or embedded design-engineering collaborations, or just a hello.

If you are writing about a project, a short note on what you are building and where design or engineering help is needed makes it easy for me to respond quickly. I usually reply within a few days.

## Elsewhere

${contactLines}

I am Florian Kiem, a design engineer building software products — currently based in Dubai, working with teams worldwide. Postal details are on the [imprint](${SITE_URL}/imprint) page.`,
);

// ---- Experiments (titles parsed from the route's experiment() calls) --------

const experimentsSource = fs.readFileSync(path.join(ROOT, "src/routes/experiments.tsx"), "utf8");
const experiments = [
  ...experimentsSource.matchAll(/experiment\(\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/g),
].map(([, slug, title, tag]) => ({ slug, title, tag }));

page(
  "/experiments",
  "Experiments ‹ Florian Kiem",
  `# Experiments

A page collecting different design and code experiments. Each one is an interactive demo on the web page; a shared deep link (/experiments?demo=<slug>) opens it directly.

${experiments.map((e) => `- ${e.title} (${e.tag}) — ${SITE_URL}/experiments?demo=${e.slug}`).join("\n")}`,
);

// ---- Tools (mirrors src/routes/tools.tsx) -----------------------------------

page(
  "/tools",
  "Tools ‹ Florian Kiem",
  `# Tools

Small web tools built by Florian Kiem:

- Dither — https://dither.floriankiem.com
- Gradient Border — https://gradient-border.floriankiem.com
- Shadow — https://shadow.floriankiem.com`,
);

// ---- Colophon (mirrors src/routes/colophon.tsx highlights) ------------------

page(
  "/colophon",
  "Colophon ‹ Florian Kiem",
  `# Colophon

How this site is built.

- Tech stack: React, Vite, and TanStack Start.
- Typography: Haas Recast (sans), Wagram (serif).
- The site is open source: https://github.com/flornkm/florians-site

The full colophon on the web page also covers inspirations and credits.`,
);

// ---- Kruemel ----------------------------------------------------------------

page(
  "/kruemel",
  "Krümel ‹ Florian Kiem",
  `# Krümel

Krümel, 2013–2026. The best dog one could wish for. A photo collection remembering her.`,
);

// ---- Legal (mirrors src/routes/imprint.tsx and privacy-policy.tsx) ----------

page(
  "/imprint",
  "Imprint ‹ Florian Kiem",
  `# Imprint

Florian Kiem
IFZA Business Park, DDP
63615 - 001, Dubai
UAE

## Rights

All writing, images, code, and the design of this site are copyright Florian Kiem. Reproduction, text and data mining, and the use of any part of this site for training AI models are not permitted without written permission. Reach out via hello@floriankiem.com.`,
);

page(
  "/privacy-policy",
  "Privacy Policy ‹ Florian Kiem",
  `# Privacy Policy

This is a personal site and contains links to other websites (just as any other website). It doesn't specifically track any personal data.

Privacy requests won't be answered as this site doesn't earn revenue.`,
);

// ---- Writing (frontmatter + cleaned MDX bodies) -----------------------------

type WritingPost = {
  slug: string;
  title: string;
  description: string;
  date: string;
  body: string;
};

// Components that are page furniture rather than content — a copy button is meaningless
// to a reader who already has the markdown in hand, so it leaves no trace in the twin.
// These sit inline in a sentence, so they are cut out of the line rather than dropping it.
const CHROME_COMPONENTS = ["CopyAsMarkdown"];
// The separator in front is taken with it, so the sentence does not end on a dangling space.
const CHROME_PATTERN = new RegExp(
  `(?:&nbsp;|&#160;|\\s)*<(?:${CHROME_COMPONENTS.join("|")})\\b[^>]*/>`,
  "g",
);

// A span is layout, never content — the article uses one to hold a word and the copy button on
// the same line. Only its tags go; whatever it wraps is prose that belongs in the twin.
const LAYOUT_SPAN_PATTERN = /<\/?span\b[^>]*>/g;

const INTERACTIVE_NOTE = "*(Interactive content on the web page.)*";

// Footnotes are the one component whose content is plain data, so the twin gets real markdown
// footnotes instead of the note: the reference stays in its sentence, the list becomes the
// definitions. Numbering follows the items' order, which is what <Footnotes> renders too.
const FOOTNOTE_REF_PATTERN = /\s*<FootnoteRefs\b[^>]*\bsources="([^"]*)"[^>]*\/>/g;
const FOOTNOTE_ITEM_PATTERN =
  /\{\s*text:\s*"([^"]*)"\s*(?:,\s*href:\s*"([^"]*)"\s*)?(?:,\s*label:\s*"([^"]*)"\s*)?,?\s*\}/g;

function footnoteRefs(line: string): string {
  return line.replace(FOOTNOTE_REF_PATTERN, (_, sources: string) =>
    sources
      .split(",")
      .map((number) => number.trim())
      .filter(Boolean)
      .map((number) => `[^${number}]`)
      .join(""),
  );
}

function footnoteDefinitions(block: string): string {
  const lines: string[] = [];
  for (const [, text, href, label] of block.matchAll(FOOTNOTE_ITEM_PATTERN)) {
    const source = href ? ` ${label ? `[${label}](${href})` : href}` : "";
    lines.push(`[^${lines.length + 1}]: ${text}${source}`);
  }
  return lines.join("\n");
}

/**
 * Component name -> the module the article imports it from, so a demo can be traced back to
 * its own source directory without a naming convention to keep in sync.
 */
function importedFrom(body: string): Map<string, string> {
  const sources = new Map<string, string>();
  for (const [, names, source] of body.matchAll(/^import\s+\{([^}]+)\}\s+from\s+"([^"]+)"/gm)) {
    for (const entry of names!.split(",")) {
      const name = entry
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) sources.set(name, source!);
    }
  }
  return sources;
}

/**
 * A demo's agent-facing twin: `demos/switch-stretch.md` beside `demos/switch-stretch.tsx`.
 * What the page shows as something to play with, the markdown shows as the code that does it.
 */
function demoMarkdown(component: string, sources: Map<string, string>, postDir: string): string {
  const source = sources.get(component);
  if (!source?.startsWith(".")) return "";
  const sidecar = `${path.resolve(postDir, source)}.md`;
  return fs.existsSync(sidecar) ? fs.readFileSync(sidecar, "utf8").trim() : "";
}

/** Index of the last line of the JSX block opening at `start`, self-closing or not. */
function componentBlockEnd(lines: string[], start: number, name: string): number {
  if (/\/>\s*$/.test(lines[start]!)) return start;
  const closingTag = new RegExp(`^\\s*</${name}>\\s*$`);
  for (let i = start + 1; i < lines.length; i++) {
    if (/\/>\s*$/.test(lines[i]!) || /^\s*\/?>\s*$/.test(lines[i]!)) return i;
    if (closingTag.test(lines[i]!)) return i;
  }
  return start;
}

// MDX -> markdown. The page and the twin carry the same prose; where they differ is the
// components, which are the whole point of the conversion:
//
// - A demo becomes the code it runs, read from the sidecar beside its source. The page can
//   show you a switch that stretches under your finger; markdown cannot, and an agent handed
//   "*(Interactive content on the web page.)*" is left to invent the CSS. It falls back to
//   that note only where no sidecar exists.
// - A figure becomes the note plus its `alt`, which is the only description of it anywhere in
//   the markdown.
// - Page furniture (the copy button) becomes nothing. It sits inline in a sentence, so it is
//   cut out of the line rather than taking the line with it.
//
// Props usually run over several lines (`<Comparison\n  before=…\n/>`), so the whole block is
// consumed, not just its opening line — otherwise they land in the twin as raw JSX. Fenced
// code blocks pass through untouched: every rule above would otherwise eat lines inside them.
function cleanMdxBody(body: string, postDir: string): string {
  const lines = body.split("\n");
  const sources = importedFrom(body);
  const out: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (/^\s*(import|export)\s/.test(line)) continue;
    // Spacing between sections on the page; in markdown the blank lines already say it.
    if (/^\s*<br\s*\/?>\s*$/.test(line)) continue;

    let stripped = footnoteRefs(line.replace(CHROME_PATTERN, ""));
    if (stripped.includes("<span")) {
      // Unwrapping the span leaves the emphasis it splits showing as two runs (`_a_ _b_`).
      // Rejoining them keeps the sentence one italic phrase, the way the page renders it.
      stripped = stripped.replace(LAYOUT_SPAN_PATTERN, "").replace(/_ _/g, " ");
    }
    const component = stripped.match(/^\s*<([A-Z]\w*)/)?.[1];
    if (!component) {
      // A line that was nothing but furniture disappears; one that merely ended with some
      // keeps its sentence.
      if (stripped.trim() || !line.trim()) out.push(stripped);
      continue;
    }

    const end = componentBlockEnd(lines, i, component);
    const block = lines.slice(i, end + 1).join("\n");
    i = end;

    const demo = demoMarkdown(component, sources, postDir);
    if (demo) {
      out.push(demo);
      continue;
    }
    if (component === "Footnotes") {
      out.push(footnoteDefinitions(block));
      continue;
    }

    out.push(INTERACTIVE_NOTE);
    const alt = block.match(/\balt="([^"]+)"/)?.[1];
    if (alt) out.push("", `_${alt}_`);
  }

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const writingDir = path.join(ROOT, "src/writing");
const posts: WritingPost[] = fs
  .readdirSync(writingDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(writingDir, e.name, "article.mdx")))
  .map((e) => {
    const raw = fs.readFileSync(path.join(writingDir, e.name, "article.mdx"), "utf8");
    const { data, content } = matter(raw);
    return {
      slug: e.name,
      title: String(data.title ?? e.name),
      description: String(data.description ?? ""),
      date: String(data.date ?? ""),
      body: cleanMdxBody(content, path.join(writingDir, e.name)),
    };
  })
  .sort((a, b) => (a.date < b.date ? 1 : -1));

page(
  "/writing",
  "Writing ‹ Florian Kiem",
  `# Writing

Notes, essays, and live experiments by Florian Kiem.

${posts
  .map(
    (p) =>
      // The markdown link is spelled out rather than left as a rule to apply, so an agent that
      // lands here can follow a post straight to its twin without being told the convention.
      `- [${p.title}](${SITE_URL}/writing/${p.slug})${p.date ? ` (${p.date})` : ""}${p.description ? ` — ${p.description}` : ""}\n  Markdown: ${SITE_URL}/writing/${p.slug}.md`,
  )
  .join("\n")}`,
);

for (const post of posts) {
  page(`/writing/${post.slug}`, `${post.title} ‹ Florian Kiem`, post.body);
}

// ---- Sitemap ----------------------------------------------------------------

const routeList = [...Object.keys(pages), "/sitemap"].sort();
page(
  "/sitemap",
  "Sitemap ‹ Florian Kiem",
  `# Sitemap

Every page on this site:

${routeList.map((p) => `- ${SITE_URL}${p === "/" ? "" : p}`).join("\n")}

Machine-readable version: ${SITE_URL}/sitemap.xml`,
);

// ---- Emit -------------------------------------------------------------------

const header = `// Generated by scripts/build-markdown.ts — do not edit by hand.
// Markdown variants of every page, served via \`Accept: text/markdown\`.
export interface MarkdownPage {
  title: string;
  markdown: string;
}

export const markdownPages: Record<string, MarkdownPage> = `;

fs.writeFileSync(OUTPUT_PATH, header + JSON.stringify(pages, null, 2) + ";\n");
console.log(`markdownMap.gen.ts: ${Object.keys(pages).length} pages`);
