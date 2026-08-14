import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { sql } from "drizzle-orm";
import db from "@/lib/supabase/db";
import { isRedisCacheEnabled, redisGet } from "@/lib/cache/redis";
import { isSentryEnabled } from "@/lib/sentry/shared";

export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} check timed out`)),
        CHECK_TIMEOUT_MS,
      ),
    ),
  ]);
}

/**
 * Deep health check, polled every 5 minutes by the keep-warm GitHub Action.
 * `"status":"ok"` requires the database to answer; the workflow fails (and
 * GitHub emails the owner) when this returns 503. Redis is a fail-open cache,
 * so its state is reported but never fails the check.
 */
export async function GET() {
  const checkedAt = new Date().toISOString();

  const [database, redis] = await Promise.all([
    withTimeout(db.execute(sql`select 1`), "database").then(
      () => "ok" as const,
      (error) => {
        console.error("[health] database check failed:", error);
        Sentry.captureException(error);
        return "error" as const;
      },
    ),
    !isRedisCacheEnabled()
      ? Promise.resolve("disabled" as const)
      : withTimeout(redisGet("health:probe"), "redis").then(
          // redisGet never throws (fail-open), a null result still proves the
          // round trip; only a timeout of the whole call marks an error.
          () => "ok" as const,
          () => "error" as const,
        ),
  ]);

  const healthy = database === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      timestamp: checkedAt,
      service: "thry",
      checks: {
        database,
        redis,
        sentry: isSentryEnabled() ? "ok" : "disabled",
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
