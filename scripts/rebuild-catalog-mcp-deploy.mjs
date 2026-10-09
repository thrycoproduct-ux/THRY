import { readFileSync, writeFileSync } from "node:fs";

const workerCode = readFileSync(
  "workers/thry-catalog/dist-worker.js",
  "utf8",
);
const secrets = JSON.parse(
  readFileSync("workers/thry-catalog/.secrets.local.json", "utf8"),
);

// Step 1: upload worker source to R2 as text
const uploadR2 = `async () => {
  const workerCode = ${JSON.stringify(workerCode)};
  const res = await cloudflare.request({
    method: "PUT",
    path: "/accounts/" + accountId + "/r2/buckets/thry-cdn/objects/internal/thry-catalog-worker.js",
    body: workerCode,
    contentType: "application/javascript",
    rawBody: true,
  });
  return { ok: res.success, status: res.status, errors: res.errors };
}`;
writeFileSync("workers/thry-catalog/_mcp-r2-upload-worker.js", uploadR2);

// Step 2: deploy using keep_bindings inherit secrets from existing worker where possible,
// but we still need to set bindings. Use secret_text from local secrets.
const deploy = `async () => {
  const workerCode = ${JSON.stringify(workerCode)};
  const metadata = {
    main_module: "worker.js",
    compatibility_date: "2026-08-14",
    bindings: [
      { type: "d1", name: "DB", id: "85283c0d-4c77-4187-8d68-ff166a1a6d50" },
      { type: "secret_text", name: "CATALOG_SYNC_SECRET", text: ${JSON.stringify(secrets.CATALOG_SYNC_SECRET)} },
      { type: "secret_text", name: "SUPABASE_URL", text: ${JSON.stringify(secrets.SUPABASE_URL)} },
      { type: "secret_text", name: "SUPABASE_ANON_KEY", text: ${JSON.stringify(secrets.SUPABASE_ANON_KEY)} },
    ],
  };
  const b = "----B" + Date.now();
  const body = [
    "--" + b,
    'Content-Disposition: form-data; name="metadata"',
    "Content-Type: application/json",
    "",
    JSON.stringify(metadata),
    "--" + b,
    'Content-Disposition: form-data; name="worker.js"; filename="worker.js"',
    "Content-Type: application/javascript+module",
    "",
    workerCode,
    "--" + b + "--",
  ].join("\\r\\n");
  const upload = await cloudflare.request({
    method: "PUT",
    path: "/accounts/" + accountId + "/workers/scripts/thry-catalog",
    query: { include_subdomain_availability: "true" },
    body,
    contentType: "multipart/form-data; boundary=" + b,
    rawBody: true,
  });
  let subdomain = { success: false, errors: [] };
  try {
    subdomain = await cloudflare.request({
      method: "POST",
      path: "/accounts/" + accountId + "/workers/scripts/thry-catalog/subdomain",
      body: { enabled: true },
    });
  } catch (e) {
    subdomain = { success: false, errors: [{ message: String(e) }] };
  }
  return {
    uploadSuccess: upload.success,
    uploadStatus: upload.status,
    uploadErrors: upload.errors,
    subdomainSuccess: subdomain.success,
    subdomainErrors: subdomain.errors,
  };
}`;
writeFileSync("workers/thry-catalog/_mcp-deploy-code.js", deploy);
console.log("deploy_bytes", deploy.length);
