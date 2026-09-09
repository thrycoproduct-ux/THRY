"use client";

import { useEffect, type RefObject } from "react";

export const BOTTOM_DOCK_HEIGHT_VAR = "--bottom-dock-height";

/**
 * Publish the rendered height of a fixed bottom dock (sticky ATC / checkout bar)
 * as a CSS variable so transient UI (toasts) can sit above it instead of
 * underneath. Height is 0 when the dock is hidden (display:none on desktop).
 */
export function useBottomDockHeight(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
) {
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!enabled || !el) {
      root.style.removeProperty(BOTTOM_DOCK_HEIGHT_VAR);
      return;
    }

    const publish = () => {
      root.style.setProperty(
        BOTTOM_DOCK_HEIGHT_VAR,
        `${Math.round(el.offsetHeight)}px`,
      );
    };
    publish();

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(publish)
        : null;
    observer?.observe(el);
    window.addEventListener("resize", publish);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty(BOTTOM_DOCK_HEIGHT_VAR);
    };
  }, [ref, enabled]);
}
