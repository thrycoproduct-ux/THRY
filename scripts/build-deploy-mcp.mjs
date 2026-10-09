import fs from "node:fs";

const w = fs.readFileSync("workers/thry-catalog/dist-worker.js", "utf8");
const secrets = JSON.parse(
  fs.readFileSync("workers/thry-catalog/.secrets.local.json", "utf8"),
);

const uploadCode = `async () => {
  const body = ${JSON.stringify(w)};
  const res = await cloudflare.request({
    method: "PUT",
    path: "/accounts/" + accountId + "/r2/buckets/thry-cdn/objects/internal/thry-catalog-worker.js",
    body,
    contentType: "application/javascript",
    rawBody: true,
  });
  return { ok: res.success, status: res.status, errors: res.errors };
}`;
fs.writeFileSync("workers/thry-catalog/_mcp-r2-upload-worker.js", uploadCode);

const deployFromR2 = `async () => {
  const obj = await cloudflare.request({
    method: "GET",
    path: "/accounts/" + accountId + "/r2/buckets/thry-cdn/objects/internal/thry-catalog-worker.js",
  });
  // R2 GET via API may return binary differently — if this fails, use upload multipart with body from prior step
  return { status: obj.status, success: obj.success, errors: obj.errors, keys: obj.result && Object.keys(obj.result) };
}`;
fs.writeFileSync("workers/thry-catalog/_mcp-r2-get-worker.js", deployFromR2);

const deploy = `async () => {
  const workerCode = ${JSON.stringify(w)};
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
fs.writeFileSync("workers/thry-catalog/_mcp-deploy-code.js", deploy);
console.log({
  upload: uploadCode.length,
  deploy: deploy.length,
});
