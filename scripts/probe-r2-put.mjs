import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { AwsClient } from "aws4fetch";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ""),
      ];
    }),
);

const endpoint = env.S3_ENDPOINT.replace(/\/$/, "");
const bucket = env.NEXT_PUBLIC_S3_BUCKET;
const key = `healthcheck/r2-probe-${Date.now()}.txt`;
const url = `${endpoint}/${bucket}/${key}`;

const client = new AwsClient({
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  service: "s3",
  region: env.NEXT_PUBLIC_S3_REGION || "auto",
});

const res = await client.fetch(url, {
  method: "PUT",
  headers: { "Content-Type": "text/plain" },
  body: "probe",
});
const text = await res.text().catch(() => "");
console.log(
  JSON.stringify({
    status: res.status,
    ok: res.ok,
    host: new URL(endpoint).host,
    bucketLen: bucket.length,
    accessKeyLen: env.S3_ACCESS_KEY_ID.length,
    secretLen: env.S3_SECRET_ACCESS_KEY.length,
    body: text.slice(0, 200),
  }),
);

if (res.ok) {
  const del = await client.fetch(url, { method: "DELETE" });
  console.log(JSON.stringify({ cleanup: del.status }));
}
