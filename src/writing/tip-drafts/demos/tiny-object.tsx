import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { createTinyRenderer, type TinyShape } from "./tiny-gl";

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

export function TinyObject({
  shape,
  size = 36,
  className,
}: {
  shape: TinyShape;
  size?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.height = Math.round(size * (window.devicePixelRatio || 1));
    const renderer = createTinyRenderer(canvas, shape);
    if (!renderer) {
      setFallback(true);
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = true;
    const start = performance.now();
    const tick = (now: number) => {
      renderer.draw((now - start) / 1000);
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (reduced.matches) renderer.draw(1.2);
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
      canvas.removeEventListener("webglcontextlost", onLost);
      renderer.dispose();
    };
  }, [shape, size]);

  if (fallback) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className={cn("block shrink-0 scale-50 rounded-full", FALLBACK[shape], className)}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ width: size, height: size }}
      className={cn("pointer-events-none shrink-0 select-none", className)}
    />
  );
}
