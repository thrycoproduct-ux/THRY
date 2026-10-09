const secret = process.env.CRON_SECRET?.trim();
const origin = process.env.SITE_ORIGIN ?? "https://thryco.com";

async function check(label, url, init) {
  const res = await fetch(url, init);
  const body = await res.text();
  console.log(`${label}: ${res.status} ${body.slice(0, 200)}`);
  return res.ok;
}

const cartOk = await check(
  "cart_pricing",
  `${origin}/api/cart/pricing?ids=`,
);
const cronOk = secret
  ? await check(
      "cron",
      `${origin}/api/cron/release-expired-stock-reservations`,
      { headers: { Authorization: `Bearer ${secret}` } },
    )
  : (console.log("cron: skipped (CRON_SECRET missing)"), false);

process.exit(cartOk && (secret ? cronOk : true) ? 0 : 1);
