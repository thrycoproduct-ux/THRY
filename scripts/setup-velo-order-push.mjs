import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

const VELO_PUSH_KEY = "velo_order_push";
const DEFAULT_PUSH_URL = "";
const SHOP_BASE_URL = "http://localhost:3000";

function canonicalShopKey(input) {
  const trimmed = input.trim().replace(/\/$/, "");
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${host}${path}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const existing = await sql`
    select value from api_settings where key = ${VELO_PUSH_KEY} limit 1
  `;

  let pushSecret =
    typeof existing[0]?.value?.pushSecret === "string"
      ? existing[0].value.pushSecret.trim()
      : "";

  if (!pushSecret) {
    pushSecret = `velo_push_${randomBytes(24).toString("base64url")}`;
  }

  const payload = {
    pushSecret,
    pushUrl: DEFAULT_PUSH_URL,
    shopBaseUrl: SHOP_BASE_URL,
  };

  await sql`
    insert into api_settings (key, value, is_enabled, updated_at)
    values (
      ${VELO_PUSH_KEY},
      ${sql.json(payload)},
      true,
      ${new Date().toISOString()}
    )
    on conflict (key) do update set
      value = excluded.value,
      is_enabled = excluded.is_enabled,
      updated_at = excluded.updated_at
  `;

  console.log(
    JSON.stringify({
      ok: true,
      shopBaseUrl: SHOP_BASE_URL,
      shopKey: canonicalShopKey(SHOP_BASE_URL),
      fingerprint: createHash("sha256").update(pushSecret).digest("hex").slice(0, 12),
      configured: true,
    }),
  );
} finally {
  await sql.end();
}
