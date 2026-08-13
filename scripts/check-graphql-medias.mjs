import { readFileSync } from "fs";

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

const url = `https://${env.NEXT_PUBLIC_SUPABASE_PROJECT_REF}.supabase.co/graphql/v1`;
const query = `
  query {
    mediasCollection(first: 10, orderBy: [{ created_at: DescNullsLast }, { id: DescNullsLast }]) {
      edges { node { id alt key created_at } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
  },
  body: JSON.stringify({ query }),
});
const json = await res.json();
console.log(JSON.stringify({ status: res.status, json }, null, 2));
