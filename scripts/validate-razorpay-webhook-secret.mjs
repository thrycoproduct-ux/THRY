import crypto from "node:crypto";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const rows = await sql`
  select value from api_settings where key = 'razorpay' limit 1
`;
const secret = String(rows[0]?.value?.webhookSecret ?? "").trim();
await sql.end({ timeout: 3 });

const body = JSON.stringify({
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_validate_test",
        order_id: "order_validate_test",
        status: "captured",
        amount: 200,
        notes: { shop_order_id: "validate_only" },
      },
    },
    order: {
      entity: {
        id: "order_validate_test",
        receipt: "validate_only",
        status: "paid",
        notes: { shop_order_id: "validate_only" },
      },
    },
  },
});

const goodSig = crypto.createHmac("sha256", secret).update(body).digest("hex");
const badSig = "00".repeat(32);

async function hit(label, signature) {
  const res = await fetch("https://thryco.com/api/razorpay/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "x-razorpay-signature": signature } : {}),
    },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  console.log(JSON.stringify({ label, status: res.status, body: json }));
}

console.log(
  JSON.stringify({
    secretConfigured: secret.length >= 8,
    secretLooksLikeUrl: /^https?:\/\//i.test(secret),
    secretLen: secret.length,
  }),
);

await hit("no_signature", null);
await hit("bad_signature", badSig);
await hit("good_signature", goodSig);
