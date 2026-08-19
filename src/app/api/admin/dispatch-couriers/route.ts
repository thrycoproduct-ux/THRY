import { getSessionUser, isAdminUser } from "@/lib/auth/admin";
import {
  publicValidationPayload,
  logServerError,
} from "@/lib/api/public-error";
import {
  courierNameToIdBase,
  parseCreateDispatchCourierPayload,
} from "@/lib/dispatch/courier-form";
import db from "@/lib/supabase/db";
import { dispatchCouriers } from "@/lib/supabase/schema";
import { asc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const user = await getSessionUser();
  const admin = await isAdminUser(user);
  if (!user || !admin) return null;
  return user;
}

async function findCourierByNameInsensitive(name: string) {
  const rows = await db
    .select({
      id: dispatchCouriers.id,
      name: dispatchCouriers.name,
      trackingUrlTemplate: dispatchCouriers.trackingUrlTemplate,
      isActive: dispatchCouriers.isActive,
    })
    .from(dispatchCouriers)
    .where(sql`lower(trim(${dispatchCouriers.name})) = lower(trim(${name}))`)
    .limit(1);

  return rows[0] ?? null;
}

async function buildUniqueCourierId(name: string) {
  const base = courierNameToIdBase(name);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await db
      .select({ id: dispatchCouriers.id })
      .from(dispatchCouriers)
      .where(eq(dispatchCouriers.id, candidate))
      .limit(1);

    if (existing.length === 0) return candidate;

    candidate = `${base}${suffix}`;
    suffix += 1;
  }
}

export async function GET() {
  const user = await ensureAdmin();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const couriers = await db
    .select({
      id: dispatchCouriers.id,
      name: dispatchCouriers.name,
      trackingUrlTemplate: dispatchCouriers.trackingUrlTemplate,
    })
    .from(dispatchCouriers)
    .where(eq(dispatchCouriers.isActive, true))
    .orderBy(asc(dispatchCouriers.name));

  return NextResponse.json({ couriers });
}

export async function POST(request: NextRequest) {
  const user = await ensureAdmin();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const parsed = parseCreateDispatchCourierPayload(
    await request.json().catch(() => null),
  );

  if (parsed.success === false) {
    return NextResponse.json(
      publicValidationPayload("Invalid courier payload", parsed.error),
      { status: 400 },
    );
  }

  const { name, trackingUrlTemplate } = parsed.data;

  const existing = await findCourierByNameInsensitive(name);
  if (existing) {
    if (!existing.isActive) {
      const [reactivated] = await db
        .update(dispatchCouriers)
        .set({
          isActive: true,
          trackingUrlTemplate:
            trackingUrlTemplate ?? existing.trackingUrlTemplate,
        })
        .where(eq(dispatchCouriers.id, existing.id))
        .returning({
          id: dispatchCouriers.id,
          name: dispatchCouriers.name,
          trackingUrlTemplate: dispatchCouriers.trackingUrlTemplate,
        });

      return NextResponse.json({
        courier: reactivated,
        created: false,
        reactivated: true,
      });
    }

    return NextResponse.json(
      { message: `Courier "${existing.name}" already exists.` },
      { status: 409 },
    );
  }

  try {
    const id = await buildUniqueCourierId(name);
    const [created] = await db
      .insert(dispatchCouriers)
      .values({
        id,
        name,
        trackingUrlTemplate,
        isActive: true,
      })
      .returning({
        id: dispatchCouriers.id,
        name: dispatchCouriers.name,
        trackingUrlTemplate: dispatchCouriers.trackingUrlTemplate,
      });

    return NextResponse.json({
      courier: created,
      created: true,
      reactivated: false,
    });
  } catch (error) {
    logServerError("admin/dispatch-couriers POST", error);
    return NextResponse.json(
      { message: "Could not save courier. Please retry." },
      { status: 500 },
    );
  }
}
