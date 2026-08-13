import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const t = readFileSync(join(root, ".env.local"), "utf8");
for (const k of [
  "NEXT_PUBLIC_S3_BUCKET",
  "S3_ENDPOINT",
  "NEXT_PUBLIC_CDN_URL",
  "NEXT_PUBLIC_S3_REGION",
]) {
  const m = t.match(new RegExp(`^${k}=(.*)$`, "m"));
  const v = m
    ? m[1].trim().replace(/^["']|["']$/g, "")
    : "(missing)";
  console.log(`${k}=${v}`);
}
