import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ImageResponse } from "@vercel/og";
import { createElement as h } from "react";

// Keep this a .ts file without JSX: on Vercel's Node 24 runtime a .tsx entrypoint is
// loaded as CommonJS and crashes on its first `import` (FUNCTION_INVOCATION_FAILED).

// The licensed font binaries live on the private CDN (flornkm/cdn), not in this repo.
// Satori can't parse the variable TTF or WOFF2, so these are the static weight-550
// Haas Recast instance and the Wagram .woff. Fetched once per cold start; server-side
// requests carry no Origin header, which the CDN middleware lets through.
const CDN_FONTS = "https://cdn.floriankiem.com/fonts";

async function fetchFont(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

let fontsPromise: Promise<[Buffer, Buffer]> | null = null;
function loadFonts(): Promise<[Buffer, Buffer]> {
  fontsPromise ??= Promise.all([
    fetchFont(`${CDN_FONTS}/haas-recast/v1/HaasRecast-OG.ttf`),
    fetchFont(`${CDN_FONTS}/wagram/v1/Wagram-MediumItalic.woff`),
  ]).catch((e) => {
    fontsPromise = null; // retry on the next invocation
    throw e;
  });
  return fontsPromise;
}

const WIDTH = 1200;
const HEIGHT = 630;

// The collapsed "Fk" wordmark from the navigation (F + small k), same paths as the Logo component.
const FK_LOGO =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14.5 11" fill="#111111">` +
  `<path d="M1.498 1.62414V4.25614H4.802V5.74014H1.498V9.94014H0V0.140137H5.782V1.62414H1.498Z"/>` +
  `<path d="M9.548 0V5.516L12.25 2.576H14.028L11.424 5.404L14.42 9.8H12.712L10.444 6.468L9.548 7.448V9.8H8.078V0H9.548Z"/>` +
  `</svg>`;
const FK_HEIGHT = 44;
const FK_WIDTH = Math.round((FK_HEIGHT * 14.5) / 11);
const fkLogoDataUri = `data:image/svg+xml;base64,${Buffer.from(FK_LOGO).toString("base64")}`;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const rawTitle = firstParam(req.query.title);
    const title = (rawTitle || "Design, Code").slice(0, 120);
    const isWriting = firstParam(req.query.writing) === "1";
    const icon = firstParam(req.query.icon); // base64-encoded standalone SVG

    const element = isWriting ? writingCard(title, icon) : defaultCard(title);
    const [ogFont, serifFont] = await loadFonts();

    const image = new ImageResponse(element, {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        // Satori's Weight type only admits the standard hundreds, but it accepts
        // arbitrary numeric weights at runtime — this file is a static 550 instance.
        { name: "Haas Recast", data: ogFont, weight: 550 as unknown as 500, style: "normal" },
        { name: "Wagram", data: serifFont, weight: 500, style: "italic" },
      ],
    });

    const buffer = Buffer.from(await image.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.status(200).send(buffer);
  } catch (e) {
    console.error(e);
    res.status(500).send("Failed to generate the image");
  }
}

function defaultCard(title: string) {
  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        background: "#ffffff",
        display: "flex",
        padding: "64px 72px",
        position: "relative",
      },
    },
    h("img", { alt: "Florian Kiem", width: FK_WIDTH, height: FK_HEIGHT, src: fkLogoDataUri }),
    h(
      "div",
      {
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 96px",
        },
      },
      h(
        "div",
        {
          style: {
            fontFamily: "Wagram",
            fontWeight: 500,
            fontStyle: "italic",
            fontSize: 120,
            letterSpacing: "-0.04em",
            color: "#111111",
            lineHeight: 1,
            textAlign: "center",
          },
        },
        title,
      ),
    ),
  );
}

function writingCard(_title: string, iconBase64?: string) {
  const icon = iconBase64
    ? h("img", {
        alt: "",
        width: 360,
        height: 360,
        src: `data:image/svg+xml;base64,${iconBase64}`,
        style: { width: 360, height: 360 },
      })
    : null;
  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        background: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      },
    },
    icon,
  );
}
