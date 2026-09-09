"use client";

import { useEffect } from "react";

export const KEYBOARD_INSET_VAR = "--keyboard-inset";

/** Ignore URL-bar / scrollbar jitter; a soft keyboard is far taller than this. */
const MIN_KEYBOARD_PX = 80;

export function computeKeyboardInset(
  innerHeight: number,
  visualHeight: number,
  visualOffsetTop: number,
): number {
  const inset = Math.round(innerHeight - visualHeight - visualOffsetTop);
  return inset >= MIN_KEYBOARD_PX ? inset : 0;
}

/**
 * Publishes the on-screen keyboard height as `--keyboard-inset` on <html>
 * while `enabled`. In Chromium WebViews (Instagram / Facebook in-app browser,
 * Chrome Android default `interactive-widget=resizes-visual`) the keyboard
 * shrinks only the visual viewport, so `100dvh` / `position: fixed` layers
 * keep full height and their bottom part is unreachable behind the keyboard.
 * Consumers subtract this var so fixed dialogs end above the keyboard.
 *
 * When the layout viewport already shrinks (iOS, `resizes-content`, WebView
 * resized by host app) innerHeight tracks the visual height → inset is 0.
 */
export function useKeyboardInset(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    if (!vv) return;

    let frame = 0;
    const publish = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const inset = computeKeyboardInset(
          window.innerHeight,
          vv.height,
          vv.offsetTop,
        );
        if (inset > 0) {
          root.style.setProperty(KEYBOARD_INSET_VAR, `${inset}px`);
        } else {
          root.style.removeProperty(KEYBOARD_INSET_VAR);
        }
      });
    };

    publish();
    vv.addEventListener("resize", publish);
    vv.addEventListener("scroll", publish);
    window.addEventListener("focusin", publish);
    window.addEventListener("focusout", publish);

    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", publish);
      vv.removeEventListener("scroll", publish);
      window.removeEventListener("focusin", publish);
      window.removeEventListener("focusout", publish);
      root.style.removeProperty(KEYBOARD_INSET_VAR);
    };
  }, [enabled]);
}
