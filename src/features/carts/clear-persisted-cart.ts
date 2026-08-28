const CART_STORAGE_NAME = "cart";

function expireCookie(name: string) {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/; SameSite=Strict`;
  } catch {
    // Ignore storage access failures.
  }
}

/** Wipe cookie + leftover local/session copies so a stale mirror cannot be upserted. */
export function clearPersistedCartStorage() {
  expireCookie(CART_STORAGE_NAME);
  try {
    window.localStorage.removeItem(CART_STORAGE_NAME);
  } catch {
    // Ignore storage access failures.
  }
  try {
    window.sessionStorage.removeItem(CART_STORAGE_NAME);
  } catch {
    // Ignore storage access failures.
  }
}
