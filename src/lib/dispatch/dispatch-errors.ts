import { isPoolerSocketError } from "@/lib/supabase/pooler-errors";

export const DISPATCH_GUARD_MISMATCH_MESSAGE =
  "Dispatch guard mismatch (order already dispatched or not preparing).";

export class DispatchConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatchConflictError";
  }
}

type PostgresLikeError = {
  code?: string;
  message?: string;
};

function isPostgresLikeError(error: unknown): error is PostgresLikeError {
  return (
    typeof error === "object" &&
    error !== null &&
    ("code" in error || "message" in error)
  );
}

export function mapDispatchPersistenceError(error: unknown): Error {
  if (
    error instanceof Error &&
    error.message === DISPATCH_GUARD_MISMATCH_MESSAGE
  ) {
    return new DispatchConflictError(
      "Order is already dispatched (or no longer PREPARING).",
    );
  }

  if (error instanceof DispatchConflictError) return error;

  if (isPostgresLikeError(error)) {
    if (error.code === "23505") {
      return new DispatchConflictError(
        "Order is already dispatched (or no longer PREPARING).",
      );
    }
    if (error.code === "23503") {
      return new Error(
        "Dispatch could not be saved because linked order/courier data is invalid. Refresh and retry.",
      );
    }
  }

  if (error instanceof Error && isPoolerSocketError(error)) {
    return new Error(
      "Database connection was interrupted. Please wait a moment and retry.",
    );
  }

  if (error instanceof Error) return error;
  return new Error("Dispatch failed. Please retry.");
}
