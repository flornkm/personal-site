import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { createDollarRenderer } from "./dollar-gl";

const SIZE = 36;

export function DollarMark({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.height = Math.round(SIZE * dpr);

    const renderer = createDollarRenderer(canvas);
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
  }, []);

  if (fallback) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid size-9 place-items-center bg-linear-to-b from-[#f3d48c] to-[#a8711f] bg-clip-text text-[26px] font-bold text-transparent",
          className,
        )}
      >
        $
      </span>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ width: SIZE, height: SIZE }}
      className={cn("pointer-events-none shrink-0 select-none", className)}
    />
  );
}
