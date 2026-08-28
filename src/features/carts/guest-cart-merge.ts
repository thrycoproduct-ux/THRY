export type AuthCartEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | string;

export type GuestCartMergeAction = "sync_from_db" | "merge_cookie_to_db" | "skip";

export type GuestCartMergeInput = {
  authEvent: AuthCartEvent;
  /** True only if this JS runtime already saw a logged-out user. */
  sawLoggedOutInThisRuntime: boolean;
  dbHasLines: boolean;
  cookieHasLines: boolean;
  authCartCleared: boolean;
};

/**
 * Logged-in cart lives in Postgres. The cookie is only a mirror / guest cart.
 *
 * Cookie → DB upsert is allowed only on a real login (guest → signed in) when
 * the DB cart is empty. Session restore, token refresh, and tab focus must
 * never write a stale cookie back into the database — that is what made
 * removed items reappear after Shop → Cart.
 */
export function decideGuestCartMerge(
  input: GuestCartMergeInput,
): GuestCartMergeAction {
  if (input.authEvent === "SIGNED_OUT") return "skip";

  if (
    input.authEvent === "INITIAL_SESSION" ||
    input.authEvent === "TOKEN_REFRESHED" ||
    input.authEvent === "USER_UPDATED"
  ) {
    return "sync_from_db";
  }

  if (input.authEvent !== "SIGNED_IN") return "skip";

  if (input.authCartCleared) return "sync_from_db";
  if (input.dbHasLines) return "sync_from_db";
  if (!input.sawLoggedOutInThisRuntime) return "sync_from_db";
  if (!input.cookieHasLines) return "sync_from_db";

  return "merge_cookie_to_db";
}

export function cartHasLines(
  cart: Record<string, { quantity?: number }> | null | undefined,
): boolean {
  if (!cart || typeof cart !== "object") return false;
  return Object.values(cart).some((item) => Number(item?.quantity ?? 0) > 0);
}
