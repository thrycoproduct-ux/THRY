import postgres from "postgres";
import fs from "fs";

function load(p) {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(p, "utf8")
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
  } catch {
    return {};
  }
}

const env = { ...load(".dev.vars"), ...load(".env.local") };
const url = env.DATABASE_URL || env.POSTGRES_URL || env.SUPABASE_DB_URL;
const sql = postgres(url, { ssl: "require", max: 1 });
const on = await sql`
  select id, name, slug, sold_as_pack, pack_size, featured, is_draft
  from products
  where sold_as_pack = true
`;
console.log(JSON.stringify(on, null, 2));
await sql.end();
