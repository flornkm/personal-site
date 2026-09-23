import { useCallback, useEffect, useRef, useState } from "react";
import { CRTShaderRenderer } from "./crt-shader";
import { CRTTextRenderer, type CRTMessage, type CRTTextState } from "./crt-text-renderer";

export interface CRTDisplayProps {
  messages: CRTMessage[];
  streamedText: string;
  isStreaming: boolean;
  inputText: string;
  onInputChange: (text: string) => void;
  onSubmit: (text: string) => void;
  onBack?: () => void;
  disabled?: boolean;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  fullscreen?: boolean;
  scale?: number;
  autoFocus?: boolean;
}

const TURN_ON_DURATION = 800;

export function CRTDisplay({
  messages,
  streamedText,
  isStreaming,
  inputText,
  onInputChange,
  onSubmit,
  onBack,
  disabled = false,
  suggestions,
  onSuggestionClick,
  fullscreen = true,
  scale = 1,
  autoFocus = true,
}: CRTDisplayProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const shaderRef = useRef<CRTShaderRenderer | null>(null);
  const textRendererRef = useRef<CRTTextRenderer | null>(null);
  const rafRef = useRef(0);
  const isDarkRef = useRef(false);

  const [inputFocused, setInputFocused] = useState(false);

  const visibleTargetRef = useRef<number | undefined>(undefined);
  const visibleCurrentRef = useRef<number | undefined>(undefined);

  // Ref for latest state so the render loop isn't re-created on every prop change.
  const stateRef = useRef<CRTTextState>({
    messages: [],
    streamedText: "",
    isStreaming: false,
    inputText: "",
    inputFocused: false,
  });
  stateRef.current = {
    messages,
    streamedText,
    isStreaming,
    inputText,
    inputFocused,
    suggestions,
    showBack: !!onBack,
  };

  // Keep callbacks in refs so the click handler doesn't need them as deps.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const onSuggestionClickRef = useRef(onSuggestionClick);
  onSuggestionClickRef.current = onSuggestionClick;

  useEffect(() => {
    const glCanvas = glCanvasRef.current!;
    const textCanvas = textCanvasRef.current!;
    const container = containerRef.current;
    const outer = outerRef.current;
    if (!glCanvas || !textCanvas || !container || !outer) return;

    const shader = new CRTShaderRenderer(glCanvas);
    const textRenderer = new CRTTextRenderer(textCanvas, scale);
    shaderRef.current = shader;
    textRendererRef.current = textRenderer;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Use clientWidth/Height, not getBoundingClientRect, so a CSS transform mid-morph can't skew the cursor→canvas mapping.
    function resize() {
      const w = Math.floor(container!.clientWidth * dpr);
      const h = Math.floor(container!.clientHeight * dpr);
      shader.resize(w, h);
      textRenderer.resize(w, h);
      updateVisibleHeight();
    }

    function updateVisibleHeight() {
      const vv = window.visualViewport;
      if (vv && Math.abs(vv.height - window.innerHeight) > 50) {
        visibleTargetRef.current = Math.floor(vv.height * dpr);
      } else {
        visibleTargetRef.current = undefined;
      }
    }

    resize();
    window.addEventListener("resize", resize);
    // Container resizes without a window resize during the tile→dialog morph; observe it directly.
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    window.visualViewport?.addEventListener("resize", updateVisibleHeight);
    window.visualViewport?.addEventListener("scroll", updateVisibleHeight);

    // Capture scroll only when fullscreen; otherwise let the page scroll.
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      textRenderer.scroll(e.deltaY);
    }
    let touchStartY = 0;
    let lastTouchY = 0;
    function onTouchStart(e: TouchEvent) {
      touchStartY = e.touches[0].clientY;
      lastTouchY = touchStartY;
    }
    function onTouchMove(e: TouchEvent) {
      const y = e.touches[0].clientY;
      const delta = lastTouchY - y;
      lastTouchY = y;
      textRenderer.scroll(delta);
    }
    if (fullscreen) {
      outer.addEventListener("wheel", onWheel, { passive: false });
      outer.addEventListener("touchstart", onTouchStart, { passive: true });
      outer.addEventListener("touchmove", onTouchMove, { passive: true });
    }

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    isDarkRef.current = mql.matches;
    const onSchemeChange = (e: MediaQueryListEvent) => {
      isDarkRef.current = e.matches;
    };
    mql.addEventListener("change", onSchemeChange);

    const startTime = performance.now();
    let running = true;

    function loop() {
      if (!running) return;

      const elapsed = performance.now() - startTime;
      shader.turnOnProgress = Math.min(1, elapsed / TURN_ON_DURATION);

      const target = visibleTargetRef.current;
      const canvasH = textCanvas.height;
      const targetH = target ?? canvasH;
      const currentH = visibleCurrentRef.current ?? canvasH;
      const LERP_SPEED = 0.15;
      const diff = targetH - currentH;
      const nextH = Math.abs(diff) < 1 ? targetH : currentH + diff * LERP_SPEED;
      visibleCurrentRef.current = nextH === canvasH ? undefined : nextH;

      textRenderer.render({
        ...stateRef.current,
        visibleHeight: visibleCurrentRef.current,
      });

      shader.render(textCanvas);
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      resizeObserver.disconnect();
      window.visualViewport?.removeEventListener("resize", updateVisibleHeight);
      window.visualViewport?.removeEventListener("scroll", updateVisibleHeight);
      if (fullscreen) {
        outer!.removeEventListener("wheel", onWheel);
        outer!.removeEventListener("touchstart", onTouchStart);
        outer!.removeEventListener("touchmove", onTouchMove);
      }
      mql.removeEventListener("change", onSchemeChange);
      shader.dispose();
      shaderRef.current = null;
      textRendererRef.current = null;
    };
  }, []);

  const toCanvasCoords = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr,
    };
  }, []);

  const hitTest = useCallback((x: number, y: number) => {
    const renderer = textRendererRef.current;
    if (!renderer) return null;
    for (const area of renderer.hitAreas) {
      if (x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height) {
        return area.id;
      }
    }
    return null;
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const coords = toCanvasCoords(e);
      if (coords) {
        const hit = hitTest(coords.x, coords.y);
        if (hit === "back" && onBackRef.current) {
          onBackRef.current();
          return;
        }
        if (hit?.startsWith("suggestion-")) {
          const index = Number(hit.split("-")[1]);
          const suggestion = stateRef.current.suggestions?.[index];
          if (suggestion) onSuggestionClickRef.current?.(suggestion);
          return;
        }
        if (hit?.startsWith("link-")) {
          const area = textRendererRef.current?.hitAreas.find((a) => a.id === hit);
          if (area?.url) window.open(area.url, "_blank", "noopener,noreferrer");
          return;
        }
      }
      hiddenInputRef.current?.focus();
    },
    [toCanvasCoords, hitTest, disabled],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const coords = toCanvasCoords(e);
      const renderer = textRendererRef.current;
      if (!coords || !renderer) return;
      const hit = hitTest(coords.x, coords.y);
      renderer.hoveredId = hit;
      const container = containerRef.current;
      if (container) container.style.cursor = hit ? "pointer" : "text";
    },
    [toCanvasCoords, hitTest],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const value = inputText.trim();
        if (value && !disabled) onSubmit(value);
      }
    },
    [inputText, onSubmit, disabled],
  );

  return (
    <div
      ref={outerRef}
      className={
        fullscreen
          ? "fixed inset-0 bg-black overflow-hidden overscroll-contain touch-none select-none"
          : // A small "TV" that floats on the dialog surface instead of filling it: a
            // rounded near-black bezel (thicker at the bottom, like a real set) sized to a
            // 4:3 tube and centred by the parent, with the dialog's surface showing around
            // it. Sized against the parent query container so the 4:3 box stays fully
            // contained whether the dialog is landscape (height-limited) or portrait
            // (width-limited).
            "relative aspect-[4/3] h-[min(74cqh,58cqw)] rounded-[1.5rem] bg-neutral-900 px-4 pt-4 pb-6 sm:px-5 sm:pt-5 sm:pb-7 smooth-shadow-ring-xl overflow-hidden select-none"
      }
      onClick={handleClick}
      onMouseMove={handleMouseMove}
    >
      <div
        ref={containerRef}
        className={
          fullscreen
            ? "relative max-w-5xl mx-auto h-full cursor-text rounded-3xl overflow-hidden"
            : "relative w-full h-full cursor-text overflow-hidden rounded-lg"
        }
      >
        <canvas ref={textCanvasRef} className="hidden" />
        <canvas ref={glCanvasRef} className="absolute inset-0 w-full h-full" />
      </div>

      <input
        ref={hiddenInputRef}
        type="text"
        className="fixed pointer-events-none"
        style={{
          fontSize: "16px",
          left: "-9999px",
          top: "-9999px",
          opacity: 0,
          caretColor: "transparent",
        }}
        value={inputText}
        onChange={(e) => !disabled && onInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        autoFocus={autoFocus}
        autoComplete="off"
        aria-label="Chat input"
      />
    </div>
  );
}
