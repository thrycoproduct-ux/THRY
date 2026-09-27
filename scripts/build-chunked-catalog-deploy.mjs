import crypto from "node:crypto";
import fs from "node:fs";

const worker = fs.readFileSync(
  "workers/thry-catalog/dist-worker.js",
  "utf8",
);
if (/[^\x00-\x7f]/.test(worker)) {
  // atob() in the deploy sandbox yields Latin-1, which would corrupt multi-byte UTF-8.
  throw new Error("dist-worker.js contains non-ASCII characters");
}
const sha256 = crypto.createHash("sha256").update(worker).digest("hex");
const b64 = Buffer.from(worker, "utf8").toString("base64");
const chunk = 3500;
const parts = [];
for (let i = 0; i < b64.length; i += chunk) {
  parts.push(b64.slice(i, i + chunk));
}

const code = `async () => {
  const parts = ${JSON.stringify(parts)};
  const workerCode = atob(parts.join(""));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(workerCode));
  const actualSha = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
  if (actualSha !== "${sha256}") {
    return { aborted: "sha256 mismatch", expected: "${sha256}", actual: actualSha };
  }
  const metadata = {
    main_module: "worker.js",
    compatibility_date: "2026-08-14",
    keep_bindings: ["secret_text"],
    bindings: [
      { type: "d1", name: "DB", id: "85283c0d-4c77-4187-8d68-ff166a1a6d50" },
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
  if (!upload.success) {
    return { uploadSuccess: false, uploadStatus: upload.status, uploadErrors: upload.errors };
  }
  const schedules = await cloudflare.request({
    method: "PUT",
    path: "/accounts/" + accountId + "/workers/scripts/thry-catalog/schedules",
    body: [{ cron: "*/30 * * * *" }],
  });
  return {
    uploadSuccess: upload.success,
    uploadStatus: upload.status,
    schedulesSuccess: schedules.success,
    schedules: schedules.result,
    schedulesErrors: schedules.errors,
    hasScheduled: workerCode.includes("async scheduled("),
    hasNameRank: workerCode.includes("name_rank ASC NULLS LAST"),
    workerBytes: workerCode.length,
  };
}`;

fs.writeFileSync("workers/thry-catalog/_mcp-deploy-chunked.js", code);
console.log(
  JSON.stringify({
    parts: parts.length,
    codeBytes: Buffer.byteLength(code),
  }),
);
