import fs from "node:fs";
import path from "node:path";

const dbId = "85283c0d-4c77-4187-8d68-ff166a1a6d50";
const dir = "scripts/_d1-mcp-groups";
const out = "scripts/_d1-mcp-apply";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  const code = `async () => {
  const dbId = ${JSON.stringify(dbId)};
  const sql = ${JSON.stringify(sql)};
  const res = await cloudflare.request({
    method: "POST",
    path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query",
    body: { sql },
  });
  return {
    file: ${JSON.stringify(f)},
    success: res.success,
    status: res.status,
    errors: res.errors,
    resultCount: Array.isArray(res.result) ? res.result.length : 0,
  };
}`;
  const name = f.replace(".sql", ".js");
  fs.writeFileSync(path.join(out, name), code);
  console.log(name, code.length);
}
