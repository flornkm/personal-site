import { cn } from "@/lib/utils";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const Root = BaseDialog.Root;
const Trigger = BaseDialog.Trigger;
const Close = BaseDialog.Close;
const Portal = BaseDialog.Portal;
const Title = BaseDialog.Title;
const Description = BaseDialog.Description;

const backdropVariants = cva(
  cn(
    "fixed inset-0 z-[100]",
    // Opacity is the only thing that animates: at opacity 0 the backdrop-filter
    // contributes nothing, so the blur reads as fading in alongside the scrim.
    "transition-opacity duration-300 ease-out",
    "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
  ),
  {
    variants: {
      blur: {
        // Mirrors the experiments modal backdrop.
        default: "bg-black/20 backdrop-blur-[2px]",
        // The frosted "look through" wash — page reads as softly blurred behind the content.
        soft: "bg-white/40 backdrop-blur-lg dark:bg-black/50",
      },
    },
    defaultVariants: { blur: "default" },
  },
);

export type BackdropProps = ComponentProps<typeof BaseDialog.Backdrop> &
  VariantProps<typeof backdropVariants>;

function Backdrop({ className, blur, ...props }: BackdropProps) {
  return <BaseDialog.Backdrop className={cn(backdropVariants({ blur }), className)} {...props} />;
}

const popupVariants = cva(
  cn(
    // Centred via auto margins on a fixed, shrink-wrapped box.
    "fixed inset-0 z-[101] m-auto outline-none",
    "transition-all duration-300 ease-out",
    "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[starting-style]:blur-[2px]",
    "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:blur-[2px]",
  ),
  {
    variants: {
      variant: {
        // Matches the expanded experiments tile: a centred surface panel.
        default: cn(
          "h-[min(88vh,33rem)] w-[min(92vw,44rem)] overflow-hidden rounded-lg smooth-shadow-ring-lg",
          "bg-surface dark:bg-neutral-950",
        ),
        // No chrome — lays out whatever it's given (e.g. an image + caption).
        headless: "flex h-fit max-h-[92vh] w-fit max-w-[92vw] flex-col items-center",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type PopupProps = ComponentProps<typeof BaseDialog.Popup> &
  VariantProps<typeof popupVariants>;

function Popup({ className, variant, ...props }: PopupProps) {
  return <BaseDialog.Popup className={cn(popupVariants({ variant }), className)} {...props} />;
}

export const Dialog = {
  Root,
  Trigger,
  Close,
  Portal,
  Backdrop,
  Popup,
  Title,
  Description,
};
