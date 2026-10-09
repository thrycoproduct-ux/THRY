import fs from "node:fs";
import path from "node:path";

const dir = "scripts/_d1-sql-batches";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const groups = [];
let current = [];
let size = 0;
const MAX = 45000;
for (const f of files) {
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  if (size + sql.length > MAX && current.length) {
    groups.push(current.join("\n"));
    current = [];
    size = 0;
  }
  current.push(sql);
  size += sql.length;
}
if (current.length) groups.push(current.join("\n"));

const out = "scripts/_d1-mcp-groups";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
groups.forEach((g, i) => {
  fs.writeFileSync(path.join(out, `group-${String(i).padStart(2, "0")}.sql`), g);
});
console.log(JSON.stringify({ groups: groups.length, sizes: groups.map((g) => g.length) }));
