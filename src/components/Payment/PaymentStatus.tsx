import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type PaymentStatusState = "processing" | "success" | "error";

interface PaymentStatusProps {
  state: PaymentStatusState;
  title: string;
  subtitle?: string;
  amount?: string; // pre-formatted, e.g. "$24.50"
  className?: string;
}

/**
 * Apple Pay / Square-style payment status block.
 * - Concentric glow ring with one-shot pulse on mount
 * - Stroke-drawn checkmark or X (signature tactile feedback)
 * - Subtle horizontal shake on error
 * - Staggered fade-up on the labels
 *
 * Pure presentational: drop in anywhere, no hooks, no side effects.
 */
export const PaymentStatus: React.FC<PaymentStatusProps> = ({
  state,
  title,
  subtitle,
  amount,
  className,
}) => {
  const isSuccess = state === "success";
  const isError = state === "error";
  const isProcessing = state === "processing";

  const ringTone = isSuccess
    ? "border-emerald-400/40 bg-emerald-400/[0.08] shadow-glow-cyan"
    : isError
    ? "border-red-400/40 bg-red-400/[0.08] shadow-[0_0_16px_hsl(0_84%_60%/0.35),0_0_32px_hsl(0_84%_60%/0.15)]"
    : "border-border/60 bg-white/[0.04]";

  const titleTone = isError ? "text-red-400" : "text-foreground";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        isError && "animate-shake-x",
        className,
      )}
    >
      {/* Concentric ring */}
      <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
        {/* Outer pulse — one-shot */}
        {(isSuccess || isError) && (
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 rounded-full",
              isSuccess ? "bg-emerald-400/30" : "bg-red-400/30",
              "animate-pulse-ring",
            )}
            style={{ animationIterationCount: 1 }}
          />
        )}

        {/* The ring itself */}
        <div
          className={cn(
            "relative flex h-20 w-20 items-center justify-center rounded-full border",
            "transition-all duration-base ease-out animate-scale-in",
            ringTone,
          )}
        >
          {isProcessing && (
            <Loader2 className="h-9 w-9 animate-spin text-foreground/80" />
          )}

          {isSuccess && (
            <svg
              viewBox="0 0 52 52"
              className="h-10 w-10"
              aria-hidden
            >
              <path
                d="M14 27 L23 36 L39 18"
                fill="none"
                stroke="hsl(160 84% 55%)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="48"
                className="animate-draw-check"
              />
            </svg>
          )}

          {isError && (
            <svg
              viewBox="0 0 52 52"
              className="h-10 w-10"
              aria-hidden
            >
              <path
                d="M18 18 L34 34"
                fill="none"
                stroke="hsl(0 84% 65%)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="24"
                className="animate-draw-check"
                style={{ strokeDashoffset: 0 }}
              />
              <path
                d="M34 18 L18 34"
                fill="none"
                stroke="hsl(0 84% 65%)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="24"
                className="animate-draw-check"
                style={{ animationDelay: "120ms", strokeDashoffset: 0 }}
              />
            </svg>
          )}
        </div>
      </div>

      <h3
        className={cn(
          "text-lg font-semibold tracking-tight",
          titleTone,
          "animate-fade-in-up",
        )}
        style={{ animationDelay: "80ms" }}
      >
        {title}
      </h3>

      {subtitle && (
        <p
          className="mt-1 max-w-xs text-sm text-muted-foreground animate-fade-in-up"
          style={{ animationDelay: "160ms" }}
        >
          {subtitle}
        </p>
      )}

      {amount && (
        <p
          className="mt-3 text-2xl font-bold tabular-nums text-foreground animate-fade-in-up"
          style={{ animationDelay: "200ms" }}
        >
          {amount}
        </p>
      )}
    </div>
  );
};

export default PaymentStatus;
