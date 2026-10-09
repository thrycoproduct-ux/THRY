import fs from "node:fs";

const chunks = [0, 1, 2, 3].map((i) =>
  fs.readFileSync(`workers/thry-catalog/_chunk_${i}.txt`, "utf8"),
);

const code = `async () => {
  const dbId = "85283c0d-4c77-4187-8d68-ff166a1a6d50";
  const chunks = ${JSON.stringify(chunks)};
  await cloudflare.request({
    method: "POST",
    path: \`/accounts/\${accountId}/d1/database/\${dbId}/query\`,
    body: { sql: "DELETE FROM catalog_meta WHERE key LIKE 'worker_b64_%'" },
  });
  for (let i = 0; i < chunks.length; i++) {
    const res = await cloudflare.request({
      method: "POST",
      path: \`/accounts/\${accountId}/d1/database/\${dbId}/query\`,
      body: {
        sql: "INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)",
        params: ["worker_b64_" + i, chunks[i]],
      },
    });
    if (!res.success) return { step: "insert", i, errors: res.errors };
  }
  const b64 = chunks.join("");
  const workerCode = atob(b64);
  const scriptName = "thry-catalog";
  const metadata = {
    main_module: "index.js",
    compatibility_date: "2026-08-14",
    bindings: [
      { type: "d1", name: "DB", id: "85283c0d-4c77-4187-8d68-ff166a1a6d50" },
      { type: "secret_text", name: "CATALOG_SYNC_SECRET" },
      { type: "secret_text", name: "SUPABASE_ANON_KEY" },
      { type: "secret_text", name: "SUPABASE_URL" },
    ],
  };
  const boundary = "----FormBoundary" + Date.now();
  const body =
    "--" +
    boundary +
    "\\r\\n" +
    'Content-Disposition: form-data; name="metadata"\\r\\n' +
    "Content-Type: application/json\\r\\n\\r\\n" +
    JSON.stringify(metadata) +
    "\\r\\n" +
    "--" +
    boundary +
    "\\r\\n" +
    'Content-Disposition: form-data; name="index.js"; filename="index.js"\\r\\n' +
    "Content-Type: application/javascript+module\\r\\n\\r\\n" +
    workerCode +
    "\\r\\n" +
    "--" +
    boundary +
    "--";
  const put = await cloudflare.request({
    method: "PUT",
    path: \`/accounts/\${accountId}/workers/scripts/\${scriptName}\`,
    query: { include_subdomain_availability: "true", excludeScript: "true" },
    body,
    contentType: \`multipart/form-data; boundary=\${boundary}\`,
    rawBody: true,
  });
  await cloudflare.request({
    method: "POST",
    path: \`/accounts/\${accountId}/d1/database/\${dbId}/query\`,
    body: { sql: "DELETE FROM catalog_meta WHERE key LIKE 'worker_b64_%'" },
  });
  return {
    putSuccess: put.success,
    putErrors: put.errors,
    workerBytes: workerCode.length,
    hasLowerName: workerCode.includes("LOWER(name) ASC"),
  };
}`;

fs.writeFileSync("workers/thry-catalog/_mcp-deploy-code.js", code);
console.log("wrote deploy code len=" + code.length);
