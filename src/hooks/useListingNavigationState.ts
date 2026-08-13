"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export const LISTING_PRODUCT_OPEN_EVENT = "hoc:listing-product-open";

const STORAGE_PREFIX = "hoc:listing-state:v1:";
const MAX_AGE_MS = 30 * 60 * 1000;
const RESTORE_TIMEOUT_MS = 8_000;

type StoredListingState<T> = {
  state: T;
  scrollY: number;
  productId: string | null;
  savedAt: number;
};

function storageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

export function readListingState<T>(key: string): StoredListingState<T> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredListingState<T>>;
    if (
      parsed.state === undefined ||
      typeof parsed.scrollY !== "number" ||
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > MAX_AGE_MS
    ) {
      window.sessionStorage.removeItem(storageKey(key));
      return null;
    }
    return {
      state: parsed.state,
      scrollY: Math.max(0, parsed.scrollY),
      productId: typeof parsed.productId === "string" ? parsed.productId : null,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

function writeListingState<T>(key: string, state: T, productId: string | null) {
  try {
    window.sessionStorage.setItem(
      storageKey(key),
      JSON.stringify({
        state,
        scrollY: Math.max(0, window.scrollY),
        productId,
        savedAt: Date.now(),
      } satisfies StoredListingState<T>),
    );
  } catch {
    // Storage can be unavailable in private mode; navigation still works.
  }
}

function focusOpenedProduct(productId: string | null) {
  if (!productId) return true;
  const links = document.querySelectorAll<HTMLElement>("[data-product-id]");
  for (const link of links) {
    if (link.dataset.productId !== productId) continue;
    link.focus({ preventScroll: true });
    return true;
  }
  return false;
}

/**
 * Persists pagination and scroll per listing URL. On Back, all previously loaded
 * cursors are rebuilt first; scroll and keyboard focus are restored once the
 * dynamic list is tall enough.
 */
export function useListingNavigationState<T>(
  key: string,
  createInitialState: () => T,
): [T, Dispatch<SetStateAction<T>>] {
  // Always match the server render; session state is applied after hydration.
  const [state, setState] = useState<T>(() => createInitialState());
  const stateRef = useRef(state);
  const keyRef = useRef(key);
  const productIdRef = useRef<string | null>(null);
  const createInitialStateRef = useRef(createInitialState);
  const hydratedRef = useRef(false);

  stateRef.current = state;
  createInitialStateRef.current = createInitialState;

  const save = useCallback(() => {
    writeListingState(keyRef.current, stateRef.current, productIdRef.current);
  }, []);

  useEffect(() => {
    if (hydratedRef.current && keyRef.current === key) return;
    if (hydratedRef.current) save();
    hydratedRef.current = true;
    keyRef.current = key;
    const restored = readListingState<T>(key);
    productIdRef.current = restored?.productId ?? null;
    setState(restored?.state ?? createInitialStateRef.current());
  }, [key, save]);

  useEffect(() => {
    const onProductOpen = (event: Event) => {
      const productId = (event as CustomEvent<{ productId?: string }>).detail
        ?.productId;
      productIdRef.current = productId?.trim() || null;
      save();
    };
    const onPageHide = () => save();

    window.addEventListener(LISTING_PRODUCT_OPEN_EVENT, onProductOpen);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      save();
      window.removeEventListener(LISTING_PRODUCT_OPEN_EVENT, onProductOpen);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [save]);

  useEffect(() => {
    const restored = readListingState<T>(key);
    if (!restored || restored.scrollY <= 0) return;

    const targetY = restored.scrollY;
    const startedAt = Date.now();
    let frame = 0;
    let observer: MutationObserver | null = null;
    let scrollRestored = false;

    const tryRestore = () => {
      const maxY = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const timedOut = Date.now() - startedAt >= RESTORE_TIMEOUT_MS;
      if (!scrollRestored && (maxY >= targetY || timedOut)) {
        window.scrollTo({ top: Math.min(targetY, maxY), behavior: "auto" });
        scrollRestored = true;
      }
      const focusRestored = focusOpenedProduct(restored.productId);
      if ((scrollRestored && focusRestored) || timedOut) {
        observer?.disconnect();
        return;
      }
      frame = window.requestAnimationFrame(tryRestore);
    };

    observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(tryRestore);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    frame = window.requestAnimationFrame(tryRestore);

    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [key]);

  return [state, setState];
}
