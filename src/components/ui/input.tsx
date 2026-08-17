import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Layout & shape
          "flex h-10 w-full rounded-[6px]",
          // Colors
          "border border-input bg-background px-3 py-2",
          // Typography
          "text-sm text-foreground placeholder:text-muted-foreground",
          // File input reset
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          // Focus ring – 1px offset ring for premium look
          "ring-offset-background",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-1",
          // Transitions
          "transition-[border-color,box-shadow] duration-[180ms] ease-out",
          // States
          "disabled:cursor-not-allowed disabled:opacity-40",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
