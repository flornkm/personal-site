// Static images an experiment fetches as soon as it mounts. Warming them on intent (hover, focus,
// press), next to the demo's code chunk, means the open dialog paints straight away instead of
// popping in piece by piece.
//
// Each image is kept referenced for the page's lifetime: public files are served with
// `max-age=0, must-revalidate`, so a fresh request would still revalidate, but a live image stays
// in the document's memory cache and the demo's own `new Image()` with the same URL reuses it.
const warmed = new Map<string, HTMLImageElement>();

export function preloadImages(urls: readonly string[]) {
  if (typeof window === "undefined") return;
  for (const url of urls) {
    if (warmed.has(url)) continue;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    warmed.set(url, img);
  }
}
