import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base — shared across all variants
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-[6px] font-medium text-sm",
    "ring-offset-background",
    "transition-all duration-[180ms] ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    "active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "select-none",
  ].join(" "),
  {
    variants: {
      variant: {
        // ── Primary action – neon cyan glow
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",

        // ── Danger
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",

        // ── Outlined / secondary
        outline:
          "border border-input bg-transparent hover:border-primary/40 hover:bg-muted hover:text-foreground",

        // ── Subtle filled secondary
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",

        // ── Transparent – for icon buttons or nav actions
        ghost:
          "hover:bg-muted hover:text-foreground",

        // ── Text link
        link:
          "text-primary underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm:      "h-8  px-3 py-1.5 text-xs rounded-[6px] gap-1.5",
        lg:      "h-12 px-6 py-3 text-base rounded-[6px]",
        xl:      "h-14 px-8 py-3.5 text-base rounded-[8px]",
        icon:    "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-[6px]",
        "icon-lg": "h-12 w-12 rounded-[6px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
