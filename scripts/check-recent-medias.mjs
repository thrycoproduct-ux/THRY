import { readFileSync } from "fs";
import postgres from "postgres";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
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

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });
const rows = await sql`
  SELECT id, alt, key, created_at
  FROM medias
  ORDER BY created_at DESC NULLS LAST, id DESC
  LIMIT 15
`;
const counts = await sql`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE created_at > now() - interval '2 hours')::int AS last_2h
  FROM medias
`;
console.log(JSON.stringify({ counts: counts[0], recent: rows }, null, 2));
await sql.end({ timeout: 5 });
