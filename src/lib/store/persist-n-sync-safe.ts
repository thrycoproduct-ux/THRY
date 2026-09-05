import type { StateCreator } from "zustand";

export type StorageType = "localStorage" | "sessionStorage" | "cookies";

export interface PersistNSyncOptionsType {
  name: string;
  /** @deprecated */
  regExpToIgnore?: RegExp;
  include?: (string | RegExp)[];
  exclude?: (string | RegExp)[];
  storage?: StorageType;
}

type PersistNSyncType = <T>(
  f: StateCreator<T, [], []>,
  options: PersistNSyncOptionsType,
) => StateCreator<T, [], []>;

function canUseDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function safeGetLocal(name: string): string | null {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}

function safeSetLocal(name: string, value: string): void {
  try {
    window.localStorage.setItem(name, value);
  } catch {
    /* restricted WebView / private mode */
  }
}

function safeRemoveLocal(name: string): void {
  try {
    window.localStorage.removeItem(name);
  } catch {
    /* ignore */
  }
}

function safeGetSession(name: string): string | null {
  try {
    return window.sessionStorage.getItem(name);
  } catch {
    return null;
  }
}

function safeSetSession(name: string, value: string): void {
  try {
    window.sessionStorage.setItem(name, value);
  } catch {
    /* ignore */
  }
}

function safeRemoveSession(name: string): void {
  try {
    window.sessionStorage.removeItem(name);
  } catch {
    /* ignore */
  }
}

function safeGetCookie(name: string): string | undefined {
  try {
    const cookies = document.cookie.split("; ");
    const cookie = cookies.find((c) => c.startsWith(`${name}=`));
    const raw = cookie?.split("=").slice(1).join("=");
    if (!raw) return undefined;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  } catch {
    return undefined;
  }
}

function safeSetCookie(name: string, value: string): void {
  try {
    // Always encode — raw JSON quotes/braces can break document.cookie round-trips
    // so Zustand never rehydrates and /cart shows empty while the cookie still exists.
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=31536000; path=/; SameSite=Strict`;
  } catch {
    /* ignore */
  }
}

function safeClearCookie(name: string): void {
  try {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/; SameSite=Strict`;
  } catch {
    /* ignore */
  }
}

function getItem(options: PersistNSyncOptionsType): string | null {
  const cookie = safeGetCookie(options.name);
  // Prefer the configured storage, then fall back safely.
  if (options.storage === "cookies") {
    return cookie ?? safeGetSession(options.name) ?? safeGetLocal(options.name);
  }
  if (options.storage === "sessionStorage") {
    return safeGetSession(options.name) ?? cookie ?? safeGetLocal(options.name);
  }
  return safeGetLocal(options.name) ?? cookie ?? safeGetSession(options.name);
}

function setItem(options: PersistNSyncOptionsType, value: string): void {
  const storage = options.storage ?? "localStorage";
  if (storage === "cookies") {
    safeSetCookie(options.name, value);
    // Older builds dual-wrote localStorage. Leave a stale copy and a later
    // cookie miss (or getItem fallback) can resurrect a deleted cart.
    safeRemoveLocal(options.name);
    safeRemoveSession(options.name);
    return;
  }
  if (storage === "sessionStorage") {
    safeSetSession(options.name, value);
    return;
  }
  safeSetLocal(options.name, value);
}

function parseStoredState(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
  } catch {
    return JSON.parse(raw) as Record<string, unknown>;
  }
}

export function clearStorage(name: string, storage?: StorageType): void {
  switch (storage || "localStorage") {
    case "localStorage":
      safeRemoveLocal(name);
      break;
    case "sessionStorage":
      safeRemoveSession(name);
      break;
    case "cookies":
      safeClearCookie(name);
      break;
  }
}

function matchPatternOrKey(
  key: string,
  patterns: (string | RegExp)[],
): boolean {
  for (const patternOrKey of patterns) {
    if (typeof patternOrKey === "string" && key === patternOrKey) return true;
    if (patternOrKey instanceof RegExp && patternOrKey.test(key)) return true;
  }
  return false;
}

const getKeysToPersistAndSyncMemoised = (() => {
  const cache: Record<string, string[]> = {};
  const compute = (keys: string[], options: PersistNSyncOptionsType) => {
    const { exclude, include } = options;
    const keysToInclude = include?.length
      ? keys.filter((key) => matchPatternOrKey(key, include))
      : keys;
    return keysToInclude.filter(
      (key) => !matchPatternOrKey(key, exclude || []),
    );
  };
  return (keys: string[], options: PersistNSyncOptionsType) => {
    const cacheKey = JSON.stringify({ options, keys });
    if (!cache[cacheKey]) cache[cacheKey] = compute(keys, options);
    return cache[cacheKey];
  };
})();

function saveAndSync<T extends Record<string, unknown>>(args: {
  newState: T;
  prevState: T;
  options: PersistNSyncOptionsType;
}) {
  const { newState, prevState, options } = args;
  const persistOptions = (
    newState as { __persistNSyncOptions?: PersistNSyncOptionsType }
  ).__persistNSyncOptions;
  if (persistOptions) {
    const prevStorage =
      (prevState as { __persistNSyncOptions?: PersistNSyncOptionsType })
        .__persistNSyncOptions?.storage || options.storage;
    const newStorage = persistOptions.storage || options.storage;
    if (prevStorage !== newStorage) {
      const name =
        (prevState as { __persistNSyncOptions?: PersistNSyncOptionsType })
          .__persistNSyncOptions?.name || options.name;
      clearStorage(name, prevStorage);
    }
    Object.assign(options, persistOptions);
  }

  if (!options.exclude) options.exclude = [];
  if (options.regExpToIgnore) options.exclude.push(options.regExpToIgnore);

  const keysToPersistAndSync = getKeysToPersistAndSyncMemoised(
    Object.keys(newState),
    options,
  );
  if (keysToPersistAndSync.length === 0) return;

  const stateToStore: Record<string, unknown> = {};
  for (const key of keysToPersistAndSync) {
    if (prevState[key] !== newState[key]) {
      stateToStore[key] = newState[key];
    }
  }
  if (Object.keys(stateToStore).length) {
    setItem(options, JSON.stringify(stateToStore));
  }
}

/**
 * Drop-in replacement for persist-and-sync that never throws on restricted
 * storage (Instagram/WebView) and does not dual-write localStorage when
 * storage is "cookies".
 */
export const persistNSync: PersistNSyncType = (stateCreator, options) => {
  return (set, get, store) => {
    if (!canUseDom()) {
      return stateCreator(set, get, store);
    }

    if (!options.storage) options.storage = "localStorage";

    const set_: typeof set = (newStateOrPartialOrFunction, replace) => {
      const prevState = get();
      set(newStateOrPartialOrFunction, replace);
      const newState = get();
      saveAndSync({
        newState: newState as Record<string, unknown>,
        prevState: prevState as Record<string, unknown>,
        options,
      });
    };

    try {
      window.addEventListener("storage", (e) => {
        if (e.key !== options.name) return;
        try {
          set({ ...get(), ...parseStoredState(e.newValue || "{}") });
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }

    const result = stateCreator(set_, get, store);

    // Hydrate once, immediately. A delayed rehydrate used to overwrite
    // replaceCart({}) after the user (or auth sync) emptied the cart.
    try {
      const savedState = getItem(options);
      if (savedState) {
        set({ ...get(), ...parseStoredState(savedState) });
      }
    } catch {
      /* corrupt cookie / blocked storage */
    }

    return result;
  };
};
