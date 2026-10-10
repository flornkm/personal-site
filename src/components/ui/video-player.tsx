import { cn } from "@/lib/utils";
import { IconExpand45 } from "central-icons-filled/IconExpand45";
import { IconMinimize45 } from "central-icons-filled/IconMinimize45";
import { IconMute } from "central-icons-filled/IconMute";
import { IconPause } from "central-icons-filled/IconPause";
import { IconPictureInPicture } from "central-icons-filled/IconPictureInPicture";
import { IconPlay } from "central-icons-filled/IconPlay";
import { IconVolumeFull } from "central-icons-filled/IconVolumeFull";
import {
  MediaControlBar,
  MediaController,
  MediaDurationDisplay,
  MediaFullscreenButton,
  MediaMuteButton,
  MediaPipButton,
  MediaPlayButton,
  MediaPreviewTimeDisplay,
  MediaTimeDisplay,
  MediaTimeRange,
} from "media-chrome/react";

type VideoPlayerProps = {
  src: string;
  poster?: string;
  className?: string;
};

const iconButtonClass =
  "inline-flex size-8 items-center justify-center rounded-sm bg-transparent p-0 text-white transition-colors duration-150 hover:bg-white/10 active:bg-white/15";

const swapIconClass =
  "transition-[opacity,scale,filter] duration-200 ease-out motion-reduce:transition-none";

// Tailwind needs every variant spelled out statically, so each toggle's hidden state is listed.
const hiddenUnlessPaused =
  "group-not-[[mediapaused]]/play:scale-50 group-not-[[mediapaused]]/play:opacity-0 group-not-[[mediapaused]]/play:blur-[2px]";
const hiddenWhenPaused =
  "group-[[mediapaused]]/play:scale-50 group-[[mediapaused]]/play:opacity-0 group-[[mediapaused]]/play:blur-[2px]";
const hiddenUnlessMuted =
  "group-not-[[mediavolumelevel=off]]/mute:scale-50 group-not-[[mediavolumelevel=off]]/mute:opacity-0 group-not-[[mediavolumelevel=off]]/mute:blur-[2px]";
const hiddenWhenMuted =
  "group-[[mediavolumelevel=off]]/mute:scale-50 group-[[mediavolumelevel=off]]/mute:opacity-0 group-[[mediavolumelevel=off]]/mute:blur-[2px]";
const hiddenUnlessFullscreen =
  "group-not-[[mediaisfullscreen]]/fullscreen:scale-50 group-not-[[mediaisfullscreen]]/fullscreen:opacity-0 group-not-[[mediaisfullscreen]]/fullscreen:blur-[2px]";
const hiddenWhenFullscreen =
  "group-[[mediaisfullscreen]]/fullscreen:scale-50 group-[[mediaisfullscreen]]/fullscreen:opacity-0 group-[[mediaisfullscreen]]/fullscreen:blur-[2px]";

// Both icons go in the single "icon" slot, stacked, so they crossfade; media-chrome's per-state
// slots display:none the inactive one and would cut instead.
function SwapIcons({ children }: { children: React.ReactNode }) {
  return (
    <span slot="icon" className="grid size-3.5 *:col-start-1 *:row-start-1">
      {children}
    </span>
  );
}

export function VideoPlayer({ src, poster, className }: VideoPlayerProps) {
  return (
    <MediaController
      className={cn("relative block aspect-video w-full overflow-hidden bg-black", className)}
      style={
        {
          "--media-primary-color": "#ffffff",
          "--media-secondary-color": "transparent",
          "--media-control-background": "transparent",
          "--media-control-hover-background": "transparent",
          "--media-range-track-background": "rgba(255,255,255,0.2)",
          "--media-range-bar-color": "#ffffff",
          "--media-range-track-height": "4px",
          "--media-range-segment-hover-height": "4px",
          "--media-range-track-border-radius": "9999px",
          "--media-range-thumb-background": "transparent",
          "--media-range-thumb-width": "0px",
          "--media-range-thumb-height": "0px",
          "--media-tooltip-distance": "6px",
          "--media-text-color": "#ffffff",
          "--media-font-family": "var(--font-sans, system-ui, sans-serif)",
          "--media-font-weight": "500",
          "--media-font-size": "13px",
          "--media-button-icon-width": "14px",
          "--media-button-icon-height": "14px",
        } as React.CSSProperties
      }
    >
      <video
        slot="media"
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        tabIndex={-1}
        className="h-full w-full object-cover"
      />

      <MediaControlBar className="absolute right-0 bottom-0 left-0 flex items-center gap-0.5 bg-[linear-gradient(to_top,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0.55)_45%,rgba(0,0,0,0.15)_80%,transparent_100%)] px-2 pt-28 pb-2">
        {/* Every icon is raw, not masked: media-chrome shows one slot and display:nones the
            rest, and the masked build shares a single <mask> id across every copy of an icon
            (also across players on one page). WebKit resolves the visible copy's mask to the
            first, hidden one and paints a solid square instead. */}
        <MediaPlayButton className={cn(iconButtonClass, "group/play")}>
          <SwapIcons>
            <IconPlay
              size={14}
              mode="raw"
              ariaHidden
              className={cn(swapIconClass, hiddenUnlessPaused)}
            />
            <IconPause
              size={14}
              mode="raw"
              ariaHidden
              className={cn(swapIconClass, hiddenWhenPaused)}
            />
          </SwapIcons>
        </MediaPlayButton>

        <MediaMuteButton className={cn(iconButtonClass, "group/mute")}>
          <SwapIcons>
            <IconMute
              size={14}
              mode="raw"
              ariaHidden
              className={cn(swapIconClass, hiddenUnlessMuted)}
            />
            <IconVolumeFull
              size={14}
              mode="raw"
              ariaHidden
              className={cn(swapIconClass, hiddenWhenMuted)}
            />
          </SwapIcons>
        </MediaMuteButton>

        <MediaTimeDisplay
          className="ml-3 bg-transparent px-0 text-xs tabular-nums"
          style={{ fontWeight: 500 }}
        />

        <MediaTimeRange className="mx-1 h-6 min-w-0 flex-1 bg-transparent [&::part(progress)]:rounded-full [&::part(buffered)]:rounded-full">
          <span slot="preview" className="pointer-events-none flex flex-col items-center">
            <span className="flex items-baseline gap-1 text-xs leading-none tabular-nums text-white">
              <MediaPreviewTimeDisplay className="bg-transparent p-0" />
              <span className="text-white/40">/</span>
              <MediaDurationDisplay className="bg-transparent p-0 text-white/40" />
            </span>
            <span aria-hidden className="h-3 w-px translate-y-1.5 bg-white/40" />
          </span>
        </MediaTimeRange>

        <MediaDurationDisplay
          className="mr-3 bg-transparent px-0 text-xs tabular-nums"
          style={{ fontWeight: 500 }}
        />

        <MediaPipButton className={iconButtonClass}>
          <IconPictureInPicture slot="enter" mode="raw" ariaHidden />
          <IconPictureInPicture slot="exit" mode="raw" ariaHidden />
        </MediaPipButton>

        <MediaFullscreenButton className={cn(iconButtonClass, "group/fullscreen")}>
          <SwapIcons>
            <IconExpand45
              size={14}
              mode="raw"
              ariaHidden
              className={cn(swapIconClass, hiddenWhenFullscreen)}
            />
            <IconMinimize45
              size={14}
              mode="raw"
              ariaHidden
              className={cn(swapIconClass, hiddenUnlessFullscreen)}
            />
          </SwapIcons>
        </MediaFullscreenButton>
      </MediaControlBar>
    </MediaController>
  );
}
