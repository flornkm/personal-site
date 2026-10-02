import { IconVolumeFull } from "central-icons/IconVolumeFull";
import { IconVolumeOff } from "central-icons/IconVolumeOff";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { bootSlopNinja } from "./game";
import { isMuted, setMuted, subscribeMuted } from "./sounds";

export function SlopNinja() {
  const hostRef = useRef<HTMLDivElement>(null);
  // Shown in place of the game when WebGL 2 is missing or the assets fail to load.
  const [problem, setProblem] = useState<string | null>(null);
  // The stored preference lives in localStorage, so the server renders it unmuted and the
  // client corrects it during hydration.
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const game = bootSlopNinja(host, () =>
      setProblem("Couldn’t load. Close and reopen to try again."),
    );
    if (!game) {
      setProblem("Slop Ninja needs WebGL 2.");
      return;
    }
    return () => game.dispose();
  }, []);

  const Icon = muted ? IconVolumeOff : IconVolumeFull;
  // Nothing to mute once the game couldn't start.
  const showMute = !problem;

  return (
    <div className="relative size-full overflow-hidden select-none">
      {/* In the mobile sheet the top 80px is the drawer's swipe-to-dismiss strip; a downward
          slash started there would close the game, so the play field starts below it, behind a
          hairline that marks the boundary. */}
      <div
        ref={hostRef}
        className="absolute inset-0 overflow-hidden in-[.experiment-drawer\_\_content]:top-20 in-[.experiment-drawer\_\_content]:border-t in-[.experiment-drawer\_\_content]:border-black/5 dark:in-[.experiment-drawer\_\_content]:border-white/10"
      />
      {problem && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {problem}
        </p>
      )}
      {showMute && (
        <button
          type="button"
          onClick={() => setMuted(!muted)}
          aria-label="Mute sound"
          aria-pressed={muted}
          // A finger needs more than the 28px glyph box; the hit area grows without the button
          // moving, so the board's corner clearance holds.
          className="absolute bottom-3 right-3 flex size-7 cursor-pointer items-center justify-center rounded-sm text-neutral-500 transition-colors outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-default pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-[''] dark:text-neutral-400 dark:hover:bg-white/5"
        >
          <Icon className="size-4" />
        </button>
      )}
    </div>
  );
}
