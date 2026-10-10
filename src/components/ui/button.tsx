import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

const sizeVariants = {
  xs: "h-6 rounded-xs text-xs font-medium px-1.5",
  sm: "h-7 rounded-sm text-sm font-medium px-2",
  md: "h-7.5 rounded-sm text-sm font-medium px-2 gap-0.5",
  lg: "h-9 rounded-sm text-sm font-medium px-2.5 gap-0.5",
} as const;

export const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center whitespace-nowrap transition-all duration-150 active:duration-0 font-medium disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent-primary text-sm text-accent-foreground hover:bg-accent-primary-hover active:bg-accent-primary-active",
        secondary:
          "bg-interactive-secondary text-sm text-primary hover:bg-interactive-secondary-hover active:bg-interactive-secondary-active",
        tertiary:
          "text-tertiary text-sm hover:text-secondary hover:bg-interactive-hover active:bg-interactive-active",
      },
      size: sizeVariants,
      iconOnly: {
        true: "p-0",
        false: "",
      },
      rounded: {
        true: "rounded-full",
        false: "",
      },
    },
    compoundVariants: [
      { iconOnly: true, size: "xs", className: "size-6" },
      { iconOnly: true, size: "sm", className: "size-7" },
      { iconOnly: true, size: "md", className: "size-8" },
      { iconOnly: true, size: "lg", className: "size-9" },
      { rounded: true, iconOnly: false, size: "xs", className: "px-2" },
      { rounded: true, iconOnly: false, size: "sm", className: "px-2.5" },
      { rounded: true, iconOnly: false, size: "md", className: "px-2.5" },
      { rounded: true, iconOnly: false, size: "lg", className: "px-3" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
      iconOnly: false,
      rounded: false,
    },
  },
);

const contentPaddingVariants = cva("truncate flex items-center", {
  variants: {
    size: {
      xs: "px-1 gap-1",
      sm: "px-1 gap-1",
      md: "px-1 gap-1.5",
      lg: "px-1 gap-2",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const slotVariants = cva("", {
  variants: {
    size: {
      xs: "h-3.5 [&_svg]:size-3.5",
      sm: "h-4 [&_svg]:size-4",
      md: "h-4 [&_svg]:size-4",
      lg: "h-4 [&_svg]:size-4",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "prefix"> &
  VariantProps<typeof buttonVariants> & {
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
  };

export default function Button({
  className,
  variant,
  size,
  iconOnly,
  rounded,
  prefix,
  suffix,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant, size, iconOnly, rounded }), className)}
      {...props}
    >
      {!iconOnly && prefix && (
        <span
          className={cn(slotVariants({ size }), "inline-flex shrink-0 items-center justify-center")}
          aria-hidden
        >
          {prefix}
        </span>
      )}
      {!iconOnly && <span className={contentPaddingVariants({ size })}>{children}</span>}
      {!iconOnly && suffix && (
        <span
          className={cn(slotVariants({ size }), "inline-flex shrink-0 items-center justify-center")}
          aria-hidden
        >
          {suffix}
        </span>
      )}
      {iconOnly && (
        <span
          className={cn(slotVariants({ size }), "inline-flex shrink-0 items-center justify-center")}
          aria-hidden
        >
          {prefix ?? children ?? suffix}
        </span>
      )}
    </button>
  );
}
