/**
 * Create or update an admin user (idempotent).
 * Usage:
 *   node --env-file=.env.local scripts/set-admin-user.mjs <email> <password>
 *   node --env-file=.env.local scripts/set-admin-user.mjs --list
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", override: true });

const ref = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF;
const key = process.env.DATABASE_SERVICE_ROLE;
if (!ref || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_PROJECT_REF or DATABASE_SERVICE_ROLE");
  process.exit(1);
}

const supabase = createClient(`https://${ref}.supabase.co`, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: listed, error: listErr } = await supabase.auth.admin.listUsers({
  perPage: 1000,
});
if (listErr) {
  console.error(listErr.message);
  process.exit(1);
}

if (process.argv[2] === "--list") {
  const admins = listed.users.filter(
    (u) => u.app_metadata?.isAdmin === true || u.app_metadata?.role === "admin",
  );
  console.log("Admin users:");
  for (const u of admins) {
    console.log(`- ${u.email} (${u.id})`);
  }
  if (admins.length === 0) console.log("(none with app_metadata.isAdmin)");
  // Also profiles
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,email,is_admin,name")
    .eq("is_admin", true);
  console.log("profiles.is_admin=true:");
  for (const p of profiles ?? []) {
    console.log(`- ${p.email} name=${p.name ?? ""}`);
  }
  process.exit(0);
}

const email = process.argv[2];
const password = process.argv[3];
if (!email || !password) {
  console.error(
    "Usage: node --env-file=.env.local scripts/set-admin-user.mjs <email> <password>",
  );
  process.exit(1);
}

let user = listed.users.find(
  (u) => u.email?.toLowerCase() === email.toLowerCase(),
);

if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "THRY Admin" },
    app_metadata: { isAdmin: true },
  });
  if (error) {
    console.error("createUser:", error.message);
    process.exit(1);
  }
  user = data.user;
  console.log("Created user", user.id);
} else {
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: { ...user.user_metadata, name: "THRY Admin" },
    app_metadata: { ...user.app_metadata, isAdmin: true },
  });
  if (error) {
    console.error("updateUser:", error.message);
    process.exit(1);
  }
  console.log("Updated existing user", user.id);
}

const { error: profileErr } = await supabase.from("profiles").upsert({
  id: user.id,
  email,
  name: "THRY Admin",
  is_admin: true,
});
if (profileErr) {
  console.error("profile upsert:", profileErr.message);
  process.exit(1);
}

console.log("Admin ready:", email);
console.log("Sign in at /sign-in then open /admin");
