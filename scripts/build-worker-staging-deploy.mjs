import fs from "node:fs";

const dbId = "85283c0d-4c77-4187-8d68-ff166a1a6d50";
const worker = fs.readFileSync("workers/thry-catalog/dist-worker.js", "utf8");
const secrets = JSON.parse(
  fs.readFileSync("workers/thry-catalog/.secrets.local.json", "utf8"),
);
const CHUNK = 5000;
const parts = [];
for (let i = 0; i < worker.length; i += CHUNK) {
  parts.push(worker.slice(i, i + CHUNK));
}
const out = "scripts/_d1-mcp-apply/worker-staging";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

fs.writeFileSync(
  `${out}/00-setup.js`,
  `async () => {
  const dbId = ${JSON.stringify(dbId)};
  const sql = "CREATE TABLE IF NOT EXISTS seed_staging (id INTEGER PRIMARY KEY, chunk TEXT NOT NULL); DELETE FROM seed_staging WHERE id >= 100;";
  const res = await cloudflare.request({ method: "POST", path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query", body: { sql } });
  return { ok: res.success, errors: res.errors, parts: ${parts.length} };
}`,
);

parts.forEach((part, i) => {
  const id = 100 + i;
  fs.writeFileSync(
    `${out}/p-${i}.js`,
    `async () => {
  const dbId = ${JSON.stringify(dbId)};
  const chunk = ${JSON.stringify(part)};
  const res = await cloudflare.request({
    method: "POST",
    path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query",
    body: { sql: "INSERT OR REPLACE INTO seed_staging (id, chunk) VALUES (?, ?)", params: [${id}, chunk] },
  });
  return { id: ${id}, ok: res.success, errors: res.errors, len: chunk.length };
}`,
  );
});

fs.writeFileSync(
  `${out}/zz-deploy.js`,
  `async () => {
  const dbId = ${JSON.stringify(dbId)};
  const load = await cloudflare.request({
    method: "POST",
    path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query",
    body: { sql: "SELECT id, chunk FROM seed_staging WHERE id >= 100 ORDER BY id;" },
  });
  if (!load.success) return { ok: false, stage: "load", errors: load.errors };
  const rows = (load.result && load.result[0] && load.result[0].results) || [];
  const workerCode = rows.map((r) => r.chunk).join("");
  const metadata = {
    main_module: "worker.js",
    compatibility_date: "2026-08-14",
    bindings: [
      { type: "d1", name: "DB", id: dbId },
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
  await cloudflare.request({
    method: "POST",
    path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query",
    body: { sql: "DELETE FROM seed_staging WHERE id >= 100;" },
  });
  return {
    workerBytes: workerCode.length,
    uploadSuccess: upload.success,
    uploadStatus: upload.status,
    uploadErrors: upload.errors,
    subdomainSuccess: subdomain.success,
    subdomainErrors: subdomain.errors,
  };
}`,
);

console.log({
  parts: parts.length,
  sizes: parts.map((_, i) => fs.statSync(`${out}/p-${i}.js`).size),
  deploy: fs.statSync(`${out}/zz-deploy.js`).size,
});
