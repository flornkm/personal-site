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
  "inline-flex h-8 items-center justify-center bg-transparent p-2 text-white transition-opacity hover:opacity-80";

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
          "--media-button-icon-width": "20px",
          "--media-button-icon-height": "20px",
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

      <MediaControlBar className="absolute right-0 bottom-0 left-0 flex items-center gap-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0.55)_45%,rgba(0,0,0,0.15)_80%,transparent_100%)] px-2 pt-28 pb-2">
        <MediaPlayButton className={iconButtonClass}>
          <IconPlay slot="play" ariaHidden />
          <IconPause slot="pause" ariaHidden />
        </MediaPlayButton>

        <MediaMuteButton className={iconButtonClass}>
          <IconMute slot="off" ariaHidden />
          {/* Raw, not masked: media-chrome shows one slot and display:nones the rest, and the
              masked build shares a single <mask> id across every copy of an icon. WebKit
              resolves the visible copy's mask to the first, hidden one and paints a solid
              square instead. */}
          <IconVolumeFull slot="low" mode="raw" ariaHidden />
          <IconVolumeFull slot="medium" mode="raw" ariaHidden />
          <IconVolumeFull slot="high" mode="raw" ariaHidden />
        </MediaMuteButton>

        <MediaTimeDisplay
          className="ml-3 bg-transparent px-0 text-xs tabular-nums"
          style={{ fontWeight: 500 }}
        />

        <MediaTimeRange className="mx-1 h-6 min-w-0 flex-1 bg-transparent [&::part(progress)]:rounded-full">
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

        <MediaFullscreenButton className={iconButtonClass}>
          <IconExpand45 slot="enter" ariaHidden />
          <IconMinimize45 slot="exit" ariaHidden />
        </MediaFullscreenButton>
      </MediaControlBar>
    </MediaController>
  );
}
