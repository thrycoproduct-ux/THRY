import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const code = fs.readFileSync(
  path.join(root, "workers/thry-catalog/dist-worker.js"),
  "utf8",
);
const secrets = JSON.parse(
  fs.readFileSync(
    path.join(root, "workers/thry-catalog/.secrets.local.json"),
    "utf8",
  ),
);

const dbId = "85283c0d-4c77-4187-8d68-ff166a1a6d50";
const scriptName = "thry-catalog";

const mcpCode = `async () => {
  const scriptName = ${JSON.stringify(scriptName)};
  const dbId = ${JSON.stringify(dbId)};
  const workerCode = ${JSON.stringify(code)};
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
  const b = "----formboundary" + Date.now();
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
    path: "/accounts/" + accountId + "/workers/scripts/" + scriptName,
    query: { include_subdomain_availability: "true" },
    body,
    contentType: "multipart/form-data; boundary=" + b,
    rawBody: true,
  });
  let subdomain = { success: false, errors: [] };
  try {
    subdomain = await cloudflare.request({
      method: "POST",
      path: "/accounts/" + accountId + "/workers/scripts/" + scriptName + "/subdomain",
      body: { enabled: true },
    });
  } catch (e) {
    subdomain = { success: false, errors: [{ message: String(e) }] };
  }
  return {
    uploadSuccess: upload.success,
    uploadErrors: upload.errors,
    uploadStatus: upload.status,
    uploadMessages: upload.messages,
    subdomainSuccess: subdomain.success,
    subdomainErrors: subdomain.errors,
    id: upload.result && upload.result.id,
  };
}`;

fs.writeFileSync(
  path.join(root, "workers/thry-catalog/_mcp-deploy-code.js"),
  mcpCode,
);
console.log("wrote mcp deploy code bytes", mcpCode.length);
