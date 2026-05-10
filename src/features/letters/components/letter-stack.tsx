import { Body1 } from "@/components/design-system/body";
import { usePreventScroll } from "@/hooks/use-prevent-scroll";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { LetterData } from "../types";
import { Letter } from "./letter";

interface ApiResponse {
  letters: Record<string, LetterData>;
}

const MOCK_LETTERS: Record<string, LetterData> = {
  mock_1: {
    handle: "johndoe",
    message: "Love the site! Clean design and great attention to detail. Keep it up!",
    signature: null,
    createdAt: "2025-01-15T10:30:00.000Z",
  },
  mock_2: {
    handle: "johndoe",
    message: "Found this through a friend. The experiments page is really cool, nice work.",
    signature: null,
    createdAt: "2025-02-20T14:15:00.000Z",
  },
  mock_3: {
    handle: "designfan",
    message: "Your portfolio is inspiring. Would love to collaborate sometime!",
    signature: null,
    createdAt: "2025-03-10T09:45:00.000Z",
  },
};

const IS_DEV = import.meta.env.DEV;
const DRAG_DISMISS_THRESHOLD = 120;
const VISIBLE_COUNT = 3;
const STACK_OFFSET_Y = 14;
const STACK_SCALE_STEP = 0.05;

function DraggableLetter({
  children,
  stackIndex,
  totalVisible,
  onDismiss,
}: {
  children: React.ReactNode;
  stackIndex: number;
  totalVisible: number;
  onDismiss: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  const justDismissed = useRef(false);

  usePreventScroll(isDragging);

  const isTopCard = stackIndex === 0;
  const offsetY = stackIndex * -STACK_OFFSET_Y;
  const scale = 1 - stackIndex * STACK_SCALE_STEP;
  const zIndex = totalVisible - stackIndex;

  const rotate = useTransform(x, [-300, 0, 300], [-12, 0, 12]);
  const opacity = useTransform([x, y], ([latestX, latestY]: number[]) => {
    const distance = Math.sqrt(latestX * latestX + latestY * latestY);
    return Math.max(0, 1 - distance / 600);
  });

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);

    const currentX = x.get();
    const currentY = y.get();
    const distance = Math.sqrt(currentX * currentX + currentY * currentY);

    if (distance > DRAG_DISMISS_THRESHOLD) {
      justDismissed.current = true;
      onDismiss();

      animate(x, 0, {
        type: "spring",
        stiffness: 200,
        damping: 25,
        mass: 1,
      });
      animate(y, 0, {
        type: "spring",
        stiffness: 200,
        damping: 25,
        mass: 1,
        onComplete: () => {
          justDismissed.current = false;
        },
      });
    } else {
      animate(x, 0, {
        type: "spring",
        stiffness: 500,
        damping: 30,
        mass: 0.6,
      });
      animate(y, 0, {
        type: "spring",
        stiffness: 500,
        damping: 30,
        mass: 0.6,
      });
    }
  }, [x, y, onDismiss]);

  const springTransition = {
    type: "spring" as const,
    stiffness: 400,
    damping: 35,
    mass: 0.8,
  };

  const instantTransition = {
    duration: 0,
  };

  const isAnimatingBack = justDismissed.current;

  return (
    <motion.div
      style={{
        x,
        y,
        rotate: isTopCard ? rotate : 0,
        opacity: isTopCard ? opacity : 1,
        zIndex,
        position: "absolute",
        top: "50%",
        left: "50%",
      }}
      initial={false}
      animate={{
        translateX: "-50%",
        translateY: `calc(-50% + ${offsetY}px)`,
        scale,
      }}
      transition={{
        translateY: isAnimatingBack ? instantTransition : springTransition,
        scale: isAnimatingBack ? instantTransition : springTransition,
      }}
      drag={isTopCard}
      dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
      dragElastic={1}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={cn(
        "rounded-xl touch-manipulation md:max-w-[450px] aspect-a4 w-full",
        isTopCard ? "cursor-grab active:cursor-grabbing" : "pointer-events-none",
      )}
    >
      {children}
    </motion.div>
  );
}

export function LetterStack() {
  const { data, isLoading } = useQuery({
    queryKey: ["letters"],
    queryFn: ({ signal }) =>
      axios.get<ApiResponse>("/api/letters", {
        signal,
      }),
    enabled: !IS_DEV,
  });

  const [dismissCount, setDismissCount] = useState(0);

  const letters: Record<string, LetterData> | undefined = IS_DEV
    ? MOCK_LETTERS
    : data?.data?.letters;

  const letterOrder = useMemo(() => {
    if (!letters) return [];
    const keys = Object.keys(letters).reverse();
    if (keys.length === 0) return [];
    const offset = dismissCount % keys.length;
    return [...keys.slice(offset), ...keys.slice(0, offset)];
  }, [letters, dismissCount]);

  const handleDismiss = useCallback(() => {
    setDismissCount((c) => c + 1);
  }, []);

  if (!IS_DEV && (!letters || isLoading))
    return (
      <div className="relative h-72 md:h-96 md:w-[512px] w-full flex flex-col justify-center items-center">
        {[0, 1, 2].map((index) => {
          const offsetY = index * -STACK_OFFSET_Y;
          const scale = 1 - index * STACK_SCALE_STEP;

          return (
            <div
              key={index}
              style={{
                zIndex: 3 - index,
                top: "50%",
                left: "50%",
                transform: `translate(-50%, calc(-50% + ${offsetY}px)) scale(${scale})`,
              }}
              className="absolute rounded-xl md:max-w-[450px] aspect-a4 w-full overflow-hidden border border-border-primary bg-surface-primary"
            >
              <div className="h-full w-full animate-pulse p-6 flex flex-col gap-4">
                <div className="h-4 w-28 rounded bg-border-primary" />
                <div className="h-3 w-full rounded bg-border-primary" />
                <div className="h-3 w-11/12 rounded bg-border-primary" />
                <div className="h-3 w-10/12 rounded bg-border-primary" />
                <div className="mt-auto h-3 w-24 rounded bg-border-primary" />
              </div>
            </div>
          );
        })}
      </div>
    );

  if (letterOrder.length === 0)
    return (
      <div className="aspect-a4 mx-auto my-8 max-w-[450px] w-full md:h-80 flex justify-center items-center border border-dashed rounded-lg border-primary">
        <Body1 className="text-tertiary">No letters available.</Body1>
      </div>
    );

  const visibleLetters = letterOrder.slice(0, VISIBLE_COUNT);

  return (
    <div className="relative h-72 md:h-96 md:w-[512px] w-full flex flex-col justify-center items-center">
      {visibleLetters.map((id, index) => {
        const letter = letters?.[id];
        if (!letter) return null;

        return (
          <DraggableLetter
            key={id}
            stackIndex={index}
            totalVisible={visibleLetters.length}
            onDismiss={handleDismiss}
          >
            <Letter
              handle={letter.handle}
              message={letter.message}
              signature={letter.signature}
              showStamp={index === 0}
              className="select-none"
            />
          </DraggableLetter>
        );
      })}
    </div>
  );
}
