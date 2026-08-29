/**
 * Enable Google single-tap sign-in on Supabase Auth for THRY.
 *
 * Prerequisites (put in .env.local):
 *   SUPABASE_ACCESS_TOKEN   — https://supabase.com/dashboard/account/tokens
 *   GOOGLE_CLIENT_ID        — Google Cloud → APIs & Services → Credentials
 *   GOOGLE_CLIENT_SECRET
 *
 * Google Cloud Web client Authorized redirect URI (exact):
 *   https://azqgyxdzwlhdmjvkngbs.supabase.co/auth/v1/callback
 *
 * Run: node scripts/enable-google-signin.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const missing = [];
if (!process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
  missing.push("SUPABASE_ACCESS_TOKEN");
}
if (!process.env.GOOGLE_CLIENT_ID?.trim()) missing.push("GOOGLE_CLIENT_ID");
if (!process.env.GOOGLE_CLIENT_SECRET?.trim()) {
  missing.push("GOOGLE_CLIENT_SECRET");
}

if (missing.length) {
  console.error("Missing in .env.local:", missing.join(", "));
  console.error(`
How to finish Google single-tap (about 3 minutes):

1) Google Cloud Console → APIs & Services → Credentials
   Create OAuth client ID → Application type: Web application
   Name: THRY Web
   Authorized redirect URIs — add exactly:
     https://azqgyxdzwlhdmjvkngbs.supabase.co/auth/v1/callback

2) Copy Client ID + Client Secret into .env.local:
     GOOGLE_CLIENT_ID=....apps.googleusercontent.com
     GOOGLE_CLIENT_SECRET=...

3) Supabase access token:
     https://supabase.com/dashboard/account/tokens
     SUPABASE_ACCESS_TOKEN=sbp_...

4) Run again:
     node scripts/enable-google-signin.mjs
`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [join(root, "scripts/setup-auth-config.mjs")],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);

process.exit(result.status ?? 1);
