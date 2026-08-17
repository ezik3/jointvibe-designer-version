import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Base
  [
    "inline-flex items-center gap-1 rounded-lg border",
    "px-2.5 py-0.5",
    "text-xs font-semibold leading-none",
    "transition-colors duration-[120ms] ease-out",
    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
    "select-none",
  ].join(" "),
  {
    variants: {
      variant: {
        // Filled primary
        default:
          "border-transparent bg-primary/15 text-primary hover:bg-primary/25",

        // Subtle secondary
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",

        // Destructive / danger
        destructive:
          "border-transparent bg-destructive/15 text-destructive hover:bg-destructive/25",

        // Outlined ghost
        outline:
          "border-border text-foreground bg-transparent hover:bg-accent",

        // Success
        success:
          "border-transparent bg-success/15 text-success hover:bg-success/25",

        // Warning
        warning:
          "border-transparent bg-warning/15 text-warning hover:bg-warning/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
