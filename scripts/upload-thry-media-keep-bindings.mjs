import { readFileSync } from "fs";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!accountId || !token) {
  console.error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN");
  process.exit(1);
}

const script = readFileSync(".tmp-thry-media.js");
const metadata = {
  main_module: "index.js",
  compatibility_date: "2026-08-14",
  keep_bindings: ["r2_bucket", "images", "secret_text"],
  observability: { enabled: true, head_sampling_rate: 1 },
};

const fd = new FormData();
fd.set(
  "metadata",
  new Blob([JSON.stringify(metadata)], { type: "application/json" }),
);
fd.set(
  "index.js",
  new Blob([script], { type: "application/javascript+module" }),
  "index.js",
);

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/thry-media?include_subdomain_availability=true`,
  {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  },
);
const json = await res.json();
console.log(
  JSON.stringify(
    {
      http: res.status,
      success: json.success,
      errors: json.errors,
      messages: json.messages,
      id: json.result?.id,
    },
    null,
    2,
  ),
);
if (!json.success) process.exit(1);
