import { useEffect } from "react";

/**
 * Hides the browser scrollbar (while keeping scroll) for pages where the
 * visible scrollbar is considered part of the UI.
 */
export function useHideBodyScrollbar(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const els = [document.documentElement, document.body];
    els.forEach((el) => el.classList.add("no-scrollbar"));

    return () => {
      els.forEach((el) => el.classList.remove("no-scrollbar"));
    };
  }, [enabled]);
}
