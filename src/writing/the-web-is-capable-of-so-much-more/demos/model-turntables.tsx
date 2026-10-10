import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import type { ModelName } from "./knight/models";

/* Figure for "The web is capable of so much more".

   Three of the game's models, built by the game's own code (copied into ./knight from
   flornkm/knight) and drawn the way the game draws them, each on its own little turntable. The
   model code and the renderer load only when the figure scrolls near, the meshes are built one per
   frame so no single task blocks scrolling, and the loop runs only while the figure is on screen. */

const MODELS: { name: ModelName; label: string }[] = [
  { name: "knight", label: "The knight" },
  { name: "goblin", label: "A goblin" },
  { name: "horse", label: "The horse" },
];

// Radians per second, the same for every tile so all three turn in lockstep.
const SPEED = 0.55;
// Radians per CSS pixel dragged: a drag across a tile is about a full turn.
const DRAG = 0.024;
// How fast a fling settles back to the idle spin, per second.
const SETTLE = 2.5;
// Three-quarter view for reduced motion.
const STILL_YAW = -0.55;

// Same sky as the renderer's post pass, so the tile doesn't change colour when the canvas fades in.
const SKY = "linear-gradient(to bottom, rgb(56 97 168), rgb(163 179 209) 85%)";

// Narrower than the row so the next tile peeks in and shows there is more to the side.
const SLIDE = "@max-lg:w-[min(16rem,70cqw)] @max-lg:shrink-0 @max-lg:snap-start";

export function ModelTurntables() {
  const figureRef = useRef<HTMLElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [ready, setReady] = useState<boolean[]>(() => MODELS.map(() => false));

  // WebGL, IntersectionObserver and the frame loop are all outside React.
  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tables: ({ render(yaw: number): void; dispose(): void } | null)[] = [];
    let visible = false;
    let started = false;
    let disposed = false;
    let frame = 0;
    let last = 0;
    // One angle for all three tiles, so dragging any of them turns them all and they stay in step.
    let yaw = still ? STILL_YAW : 0;
    let velocity = SPEED;
    // The idle spin keeps the direction of the last fling.
    let direction = 1;
    let drag: { id: number; x: number; t: number } | null = null;

    const draw = () => tables.forEach((t) => t?.render(yaw));

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!drag) {
        velocity += (direction * SPEED - velocity) * (1 - Math.exp(-SETTLE * dt));
        yaw += velocity * dt;
      }
      draw();
      frame = requestAnimationFrame(loop);
    };

    const play = () => {
      cancelAnimationFrame(frame);
      if (!visible || still || disposed) return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };

    const onDown = (e: PointerEvent) => {
      if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, t: e.timeStamp };
      velocity = 0;
    };
    const onMove = (e: PointerEvent) => {
      if (drag?.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      const dt = Math.max((e.timeStamp - drag.t) / 1000, 1e-3);
      yaw += dx * DRAG;
      // Smoothed, so the fling follows the last few moves rather than the very last one.
      velocity += ((dx * DRAG) / dt - velocity) * 0.4;
      drag = { id: e.pointerId, x: e.clientX, t: e.timeStamp };
      if (still) draw();
    };
    const onUp = (e: PointerEvent) => {
      if (drag?.id !== e.pointerId) return;
      // A pointer held still before letting go doesn't fling.
      if (e.timeStamp - drag.t > 80) velocity = 0;
      velocity = Math.max(-12, Math.min(12, velocity));
      if (Math.abs(velocity) > 0.05) direction = Math.sign(velocity);
      drag = null;
    };
    const canvases = canvasRefs.current.filter((c): c is HTMLCanvasElement => !!c);
    for (const c of canvases) {
      c.addEventListener("pointerdown", onDown);
      c.addEventListener("pointermove", onMove);
      c.addEventListener("pointerup", onUp);
      c.addEventListener("pointercancel", onUp);
    }

    async function start() {
      started = true;
      const [{ buildModel }, { createTurntable }] = await Promise.all([
        import("./knight/models"),
        import("./knight/turntable"),
      ]);
      for (let i = 0; i < MODELS.length; i++) {
        // One mesh per frame on purpose: each takes 10-35 ms to build.
        // oxlint-disable-next-line no-await-in-loop
        await new Promise((r) => requestAnimationFrame(r));
        const canvas = canvasRefs.current[i];
        if (disposed || !canvas) return;
        const table = createTurntable(canvas, buildModel(MODELS[i].name));
        tables[i] = table;
        table?.render(yaw);
        if (table) setReady((r) => r.map((v, j) => v || j === i));
      }
      play();
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !started) start();
        else play();
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(figure);

    // A still frame has to be redrawn when the tiles change size; a playing loop does that anyway.
    const ro = new ResizeObserver(() => {
      if (still) draw();
    });
    ro.observe(figure);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      for (const c of canvases) {
        c.removeEventListener("pointerdown", onDown);
        c.removeEventListener("pointermove", onMove);
        c.removeEventListener("pointerup", onUp);
        c.removeEventListener("pointercancel", onUp);
      }
      for (const t of tables) t?.dispose();
    };
  }, []);

  return (
    <figure
      ref={figureRef}
      className="not-prose max-lg:-mx-4 @container mx-auto my-10 font-pretendard"
    >
      {/* Wider than the article column from lg, centred on the text, like the browsers in "The
          perfect app has no loading states". */}
      <div className="lg:ml-[50%] lg:w-[840px] lg:-translate-x-1/2">
        <div
          className={cn(
            "grid gap-4 @lg:grid-cols-3",
            "@max-lg:flex @max-lg:snap-x @max-lg:snap-mandatory @max-lg:scroll-px-4 @max-lg:overflow-x-auto @max-lg:px-4 @max-lg:scroll-mask-x",
          )}
        >
          {MODELS.map((model, i) => (
            <div key={model.name} className={SLIDE}>
              <div
                className="relative aspect-square overflow-hidden rounded-sm outline -outline-offset-1 outline-black/5 dark:outline-white/15"
                style={{ background: SKY }}
              >
                <canvas
                  ref={(el) => {
                    canvasRefs.current[i] = el;
                  }}
                  aria-label={`${model.label}, turning. Drag to turn it.`}
                  role="img"
                  // pan-y: a sideways drag turns the model instead of scrolling the row on touch.
                  className={cn(
                    "absolute inset-0 h-full w-full cursor-grab touch-pan-y transition-opacity duration-300 ease-out active:cursor-grabbing",
                    ready[i] ? "opacity-100" : "opacity-0",
                  )}
                />
              </div>
              <p className="mt-2 text-xs text-tertiary">{model.label}</p>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-4 font-serif text-[11px] font-normal italic text-primary lg:mx-auto lg:max-w-[460px]">
        Fig 3: Three models straight from the game's code - built from primitives in TypeScript, no
        model files
      </figcaption>
    </figure>
  );
}
