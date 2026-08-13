/**
 * After R2 is enabled on the NEW Cloudflare account (Shaarunew01):
 * 1. Create bucket hubofcraftss-cdn
 * 2. Create an R2 API token (Object Read & Write) for that bucket
 * 3. Enable public r2.dev access (or custom CDN domain)
 * 4. Run this script to print the secrets you must set, then:
 *      npx wrangler secret bulk secrets.json --name hub-of-craftss --config wrangler.workers.new-account.jsonc
 *      npm run deploy:new
 *
 * Usage (fill env first):
 *   NEW_R2_ACCESS_KEY_ID=... NEW_R2_SECRET_ACCESS_KEY=... NEW_R2_ACCOUNT_ID=<thry-account-id> NEW_R2_PUBLIC_URL=https://pub-xxxx.r2.dev node scripts/print-new-account-r2-secrets.mjs
 */
const accountId =
  process.env.NEW_R2_ACCOUNT_ID?.trim() || "";
const accessKeyId = process.env.NEW_R2_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.NEW_R2_SECRET_ACCESS_KEY?.trim();
const publicUrl = process.env.NEW_R2_PUBLIC_URL?.trim();
const bucket = process.env.NEW_R2_BUCKET?.trim() || "thry-cdn";

if (!accessKeyId || !secretAccessKey || !publicUrl) {
  console.error(`Missing env. Set:
  NEW_R2_ACCESS_KEY_ID
  NEW_R2_SECRET_ACCESS_KEY
  NEW_R2_PUBLIC_URL   (e.g. https://pub-xxxxx.r2.dev)
Optional:
  NEW_R2_ACCOUNT_ID   (default ${accountId})
  NEW_R2_BUCKET       (default ${bucket})
`);
  process.exit(1);
}

const secrets = {
  NEXT_PUBLIC_S3_BUCKET: bucket,
  NEXT_PUBLIC_S3_REGION: "auto",
  S3_ENDPOINT: `https://${accountId}.r2.cloudflarestorage.com`,
  S3_ACCESS_KEY_ID: accessKeyId,
  S3_SECRET_ACCESS_KEY: secretAccessKey,
  NEXT_PUBLIC_CDN_URL: publicUrl.replace(/\/$/, ""),
};

console.log(JSON.stringify(secrets, null, 2));
console.log(`
Next:
  1. Save JSON to a temp file (do not commit)
  2. CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=${accountId} npx wrangler secret bulk <file> --name hub-of-craftss --config wrangler.workers.new-account.jsonc
  3. Update .env.local + .dev.vars with the same values
  4. npm run deploy:new
`);
