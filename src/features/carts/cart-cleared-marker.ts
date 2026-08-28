const AUTH_CART_CLEARED_KEY = "cart:auth-cleared-user-id";

export function markAuthCartCleared(userId: string) {
  try {
    sessionStorage.setItem(AUTH_CART_CLEARED_KEY, userId);
  } catch {
    // Ignore storage access failures.
  }
}

export function clearAuthCartClearedMarker() {
  try {
    sessionStorage.removeItem(AUTH_CART_CLEARED_KEY);
  } catch {
    // Ignore storage access failures.
  }
}

export function hasAuthCartClearedForUser(userId: string) {
  try {
    return sessionStorage.getItem(AUTH_CART_CLEARED_KEY) === userId;
  } catch {
    return false;
  }
}
