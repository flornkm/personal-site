import { cn } from "@/lib/utils";
import { useCallback, useEffect, useId, useRef, useState } from "react";

/* A dialog that leaves a mark on the screen it keeps appearing on. Burn-in is differential: a
   pixel wears by how hard it has been driven, so what burns is only the difference between what
   the dialog lights up and what the page underneath was showing anyway. That makes the mark a
   negative of the dialog rather than a silhouette of it — the surface, the brightest thing on
   screen, burns hardest, and the dark text inside it barely burns at all, so the letters come
   back as the palest part of the stain. Blue subpixels wear out first, which is why the ghost of
   the blue button is the yellowest patch of the lot.

   Two things are happening at once, which is what a real panel does. Image persistence fills in
   within a second and drains within a couple, so closing the dialog leaves a ghost that visibly
   settles; underneath it, the permanent burn only ever goes one way. The mark is the dialog's own
   image, measured off the dialog in the DOM rather than drawn by hand, so the two cannot drift
   apart. Nothing here is stored — a reload is a new screen. */

const SCREEN_W = 288;
const SCREEN_H = 176;

// Roughly the seconds of display that take the panel 63% of the way to fully burned.
const BURN_TAU = 32;
const PERSIST_RISE = 2.6;
const PERSIST_TAU = 0.8;
// Ceilings on each layer, so a burned panel is stained rather than painted over, and the
// after-image reads as clearly stronger than what it settles down to.
const MAX_BURN = 0.85;
const MAX_PERSIST = 0.4;

type Role = "surface" | "ink" | "primary" | "secondary";
type Block = { x: number; y: number; w: number; h: number; r: number; role: Role };
type Theme = "light" | "dark";

/* How brightly each part of the dialog drives the pixels under it, which is all the burn depends
   on, normalised per theme so the hottest part of the dialog is the one that burns at full rate.
   The order flips between themes: dark text on a white surface is the coolest thing in a light
   dialog and comes back as the palest part of the mark, while light text on a dark surface is the
   hottest thing in a dark one and comes back as the darkest. Same rule, opposite picture. */
const LUM: Record<Theme, Record<Role, number>> = {
  light: { surface: 1, ink: 0.22, primary: 0.42, secondary: 0.92 },
  dark: { surface: 0.38, ink: 1, primary: 0.51, secondary: 0.47 },
};

// What a worn pixel settles to, kept close to the panel it sits on so a deep burn still reads as
// a stain in the glass and not as a shape drawn on top.
const BURN: Record<Theme, Record<"base" | "primary", string>> = {
  light: { base: "rgb(206,199,182)", primary: "rgb(212,198,152)" },
  dark: { base: "rgb(16,15,12)", primary: "rgb(21,19,9)" },
};

// Panels are not uniform, and a burn shows that up. Deterministic, so a repaint after a theme
// change lands the same grain in the same places.
const grainAt = (n: number) => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  return ((x >>> 0) % 1024) / 1024;
};

const radiusOf = (el: HTMLElement) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;

/* Layout geometry read off the live dialog. offset* rather than getBoundingClientRect, because
   the dialog sits under a scale transform while it is closed and offsets ignore transforms. That
   is also why the dialog is centred by a wrapper rather than by translating itself, and why it
   stays `relative`: it has to remain the offset parent its own contents are measured against. */
function measure(dialog: HTMLElement): Block[] {
  const blocks: Block[] = [
    {
      x: 0,
      y: 0,
      w: dialog.offsetWidth,
      h: dialog.offsetHeight,
      r: radiusOf(dialog),
      role: "surface",
    },
  ];
  for (const el of dialog.querySelectorAll<HTMLElement>("[data-burn]")) {
    const role = el.dataset.burn as Role;
    // A line box stands taller than the ink inside it; the middle of one is about what a row of
    // text actually lights up.
    const inset = role === "ink" ? el.offsetHeight * 0.2 : 0;
    const h = el.offsetHeight - inset * 2;
    blocks.push({
      x: el.offsetLeft,
      y: el.offsetTop + inset,
      w: el.offsetWidth,
      h,
      r: Math.min(radiusOf(el), h / 2),
      role,
    });
  }
  return blocks;
}

/* The burn map: the dialog painted once as the wear it causes, alpha standing in for how hard
   each part drives the panel. Every block below the surface is punched out of it first, so the
   alpha it ends up with is its own rather than its own on top of the surface's. */
function buildStamp(blocks: Block[], theme: Theme, dpr: number) {
  const [surface] = blocks;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(surface.w * dpr);
  canvas.height = Math.ceil(surface.h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const fill = (b: Block) => {
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, b.r);
    ctx.fill();
  };
  for (const block of blocks) {
    if (block.role !== "surface") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
      fill(block);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = LUM[theme][block.role];
    ctx.fillStyle = block.role === "primary" ? BURN[theme].primary : BURN[theme].base;
    fill(block);
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  for (let i = 3, p = 0; i < data.length; i += 4, p++) {
    data[i] = data[i] * (0.9 + grainAt(p) * 0.2);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export const PatinaBurnIn = () => {
  const titleId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const installRef = useRef<HTMLButtonElement>(null);
  const openedOnce = useRef(false);
  const stampRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const burnRef = useRef(0);
  const persistRef = useRef(0);
  const [open, setOpen] = useState(false);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const stamp = stampRef.current;
    if (!canvas || !stamp) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const box = boxRef.current;
    ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    const layer = (alpha: number) => {
      if (alpha <= 0.002) return;
      ctx.globalAlpha = Math.min(alpha, 1);
      ctx.drawImage(stamp, box.x, box.y, box.w, box.h);
    };
    layer(burnRef.current * MAX_BURN);
    layer(persistRef.current * MAX_PERSIST);
    ctx.globalAlpha = 1;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const dialog = dialogRef.current;
    if (!canvas || !dialog) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = SCREEN_W * dpr;
    canvas.height = SCREEN_H * dpr;
    canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);

    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const rebuild = () => {
      // fonts.ready can land after the figure has gone; a detached dialog measures as nothing and
      // would leave drawImage with a zero-sized source.
      if (!dialog.isConnected || !dialog.offsetWidth) return;
      const blocks = measure(dialog);
      boxRef.current = {
        x: dialog.offsetLeft,
        y: dialog.offsetTop,
        w: blocks[0].w,
        h: blocks[0].h,
      };
      stampRef.current = buildStamp(blocks, darkQuery.matches ? "dark" : "light", dpr);
      paint();
    };
    rebuild();
    // The dialog is measured while it is still hidden, so a late webfont would otherwise leave
    // the mark sized for the fallback.
    document.fonts?.ready.then(rebuild);
    darkQuery.addEventListener("change", rebuild);
    return () => darkQuery.removeEventListener("change", rebuild);
  }, [paint]);

  useEffect(() => {
    // visibility: hidden drops the closed dialog out of the tab order, which would otherwise
    // leave focus on the body every time one of its buttons dismissed it.
    if (open) {
      openedOnce.current = true;
      installRef.current?.focus();
    } else if (openedOnce.current) {
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      persistRef.current = 0;
      paint();
      return;
    }
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (open) {
        burnRef.current += (1 - burnRef.current) * (dt / BURN_TAU);
        persistRef.current += (1 - persistRef.current) * PERSIST_RISE * dt;
      } else {
        persistRef.current *= Math.exp(-dt / PERSIST_TAU);
        if (persistRef.current < 0.002) persistRef.current = 0;
      }
      paint();
      if (open || persistRef.current > 0) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [open, paint]);

  return (
    <div
      className={cn(
        "relative grid select-none place-items-center overflow-hidden rounded-xl",
        "bg-[oklch(0.98_0_0)] smooth-shadow-ring-sm smooth-ring-black/8",
        "dark:bg-[oklch(0.3_0_0)] dark:smooth-ring-white/32",
      )}
      style={{ width: SCREEN_W, height: SCREEN_H }}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        // Demos of this sort get embedded in things that also close on Escape.
        e.stopPropagation();
        setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "rounded-full px-3 py-1.5 text-[12px] font-medium text-primary",
          "bg-white smooth-shadow-ring-xs dark:bg-[oklch(0.38_0_0)]",
          "cursor-pointer [-webkit-tap-highlight-color:transparent]",
          "outline-none focus-visible:ring-2 focus-visible:ring-default",
        )}
      >
        Check for updates
      </button>

      {/* Burn sits in the glass, so it dims whatever is under it, the button included. */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 size-full"
      />

      <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
        <div
          ref={dialogRef}
          role="dialog"
          aria-labelledby={titleId}
          aria-hidden={!open}
          style={{
            transform: `scale(${open ? 1 : 0.97})`,
            /* visibility keeps the closed dialog measurable and out of the tab order at once. It
               switches instantly and only waits on the way out, so that it does not cut the fade
               off — and so that the dialog is focusable in the same tick it opens, which it is
               not while a visibility transition is still at zero progress. */
            visibility: open ? "visible" : "hidden",
            transitionDuration: "140ms, 140ms, 0ms",
            transitionDelay: open ? "0ms" : "0ms, 0ms, 140ms",
          }}
          className={cn(
            "pointer-events-auto relative flex w-[208px] flex-col rounded-[10px] p-3.5",
            "bg-white smooth-shadow-ring-md dark:bg-[oklch(0.4_0_0)]",
            "transition-[opacity,transform,visibility] ease-out motion-reduce:transition-none",
            open ? "opacity-100" : "opacity-0",
          )}
        >
          <p id={titleId} data-burn="ink" className="w-fit text-[13px] font-medium text-primary">
            Update available
          </p>
          <p data-burn="ink" className="mt-0.5 w-fit text-[11.5px] text-secondary">
            Version 2.4.1 is ready.
          </p>
          <div className="mt-4 flex justify-end gap-1.5">
            <button
              type="button"
              data-burn="secondary"
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11.5px] font-medium text-primary",
                "bg-black/[0.055] dark:bg-white/10",
                "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-default",
              )}
            >
              Later
            </button>
            <button
              ref={installRef}
              type="button"
              data-burn="primary"
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-full bg-[#2f6ef0] px-2.5 py-1 text-[11.5px] font-medium text-white",
                "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-default",
              )}
            >
              Install
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
