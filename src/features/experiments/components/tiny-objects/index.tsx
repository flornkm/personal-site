import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { createTinyRenderer, type TinyShape } from "./tiny-gl";

/* Eight tiny objects, each a sphere-traced solid in its own material, rocking slowly under a
   studio light with a streak crossing them now and then. Nothing else on the page. */

const SHAPES: TinyShape[] = ["key", "clip", "drop", "bolt", "lock", "pin", "star", "cup"];
const SIZE = 88;

const FALLBACK: Record<TinyShape, string> = {
  key: "bg-[oklch(0.82_0.12_85)]",
  clip: "bg-[oklch(0.86_0.01_250)]",
  drop: "bg-[oklch(0.86_0.05_235)]",
  bolt: "bg-[oklch(0.86_0.15_95)]",
  lock: "bg-[oklch(0.86_0.01_250)]",
  pin: "bg-[oklch(0.7_0.16_28)]",
  star: "bg-[oklch(0.82_0.12_85)]",
  cup: "bg-[oklch(0.94_0.01_80)]",
};

function TinyObject({ shape }: { shape: TinyShape }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  // A GL context and its frame loop: external systems.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.height = Math.round(SIZE * (window.devicePixelRatio || 1));
    const renderer = createTinyRenderer(canvas, shape, Math.round(SIZE * 1.5));
    if (!renderer) {
      setFallback(true);
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    let frame = 0;
    let visible = true;
    const start = performance.now();
    const tick = (now: number) => {
      renderer.draw((now - start) / 1000, dark.matches);
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (reduced.matches) renderer.draw(1.2, dark.matches);
      else if (visible && document.visibilityState === "visible")
        frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    dark.addEventListener("change", sync);
    const onLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      setFallback(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    sync();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
      dark.removeEventListener("change", sync);
      canvas.removeEventListener("webglcontextlost", onLost);
      renderer.dispose();
    };
  }, [shape]);

  if (fallback) {
    return (
      <span
        aria-hidden
        style={{ width: SIZE, height: SIZE }}
        className={cn("block scale-[0.4] rounded-full", FALLBACK[shape])}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ width: SIZE, height: SIZE }}
      className="pointer-events-none select-none"
    />
  );
}

export function TinyObjects() {
  return (
    <div className="grid h-full w-full place-items-center p-6 select-none">
      <div className="grid grid-cols-4 gap-x-10 gap-y-8 max-sm:grid-cols-2 max-sm:gap-6">
        {SHAPES.map((shape) => (
          <TinyObject key={shape} shape={shape} />
        ))}
      </div>
    </div>
  );
}
