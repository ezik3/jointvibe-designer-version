import { useState, useEffect, useRef } from "react";

/**
 * Tracks scroll direction with a tiny threshold (2px).
 * Returns `navsVisible` — true at the top or when scrolling up, false when scrolling down.
 * Mobile-only: pass `disabled = true` on desktop to skip all listeners.
 */
export function useScrollDirection(disabled = false) {
  const [navsVisible, setNavsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (disabled) return;

    const THRESHOLD = 2; // px before toggling
    const TOP_ZONE = 10; // always show navs when near top

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const currentY = window.scrollY;

        if (currentY <= TOP_ZONE) {
          setNavsVisible(true);
        } else {
          const delta = currentY - lastScrollY.current;
          if (delta > THRESHOLD) {
            // scrolling down
            setNavsVisible(false);
          } else if (delta < -THRESHOLD) {
            // scrolling up
            setNavsVisible(true);
          }
        }

        lastScrollY.current = currentY;
        ticking.current = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [disabled]);

  return { navsVisible };
}
