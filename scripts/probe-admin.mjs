import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const projectRef = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF;
const base = "http://localhost:3000";

const sb = createClient(url, anon);
const { data, error } = await sb.auth.signInWithPassword({
  email: "sanjay.cyber.audit@gmail.com",
  password: "HocAdmin_3b0a578b!2026",
});
if (error) {
  console.error("auth", error);
  process.exit(1);
}

console.log("isAdmin", data.user.app_metadata?.isAdmin);
const storageKey = `sb-${projectRef}-auth-token`;
const cookie = `${storageKey}=${encodeURIComponent(JSON.stringify(data.session))}`;

const res = await fetch(`${base}/admin/dashboard`, {
  headers: {
    Cookie: cookie,
    Accept: "text/html",
    "User-Agent": "Mozilla/5.0",
  },
  redirect: "manual",
});
const text = await res.text();
writeFileSync("scripts/.admin-probe.html", text);

console.log("status", res.status);
console.log("error page?", text.includes("Admin could not load"));
console.log("title", (text.match(/<title>[^<]+/i) || [])[0]);
console.log(
  "err text",
  (text.match(/Something went wrong[^<]{0,80}/) || [])[0] || null,
);
console.log(
  "has ReactCurrentOwner",
  text.includes("ReactCurrentOwner"),
);
const digests = [...text.matchAll(/"digest":"([^"]+)"/g)].map((m) => m[1]);
console.log("digests", digests.slice(0, 8));
