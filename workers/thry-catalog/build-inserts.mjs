import fs from "node:fs";

for (let i = 0; i < 4; i++) {
  const chunk = fs.readFileSync(`workers/thry-catalog/_chunk_${i}.txt`, "utf8");
  const code = `async () => {
  const dbId = "85283c0d-4c77-4187-8d68-ff166a1a6d50";
  const chunk = ${JSON.stringify(chunk)};
  const res = await cloudflare.request({
    method: "POST",
    path: \`/accounts/\${accountId}/d1/database/\${dbId}/query\`,
    body: {
      sql: "INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)",
      params: ["worker_b64_${i}", chunk],
    },
  });
  return { i: ${i}, success: res.success, errors: res.errors };
}`;
  fs.writeFileSync(`workers/thry-catalog/_insert_${i}.js`, code);
  console.log("wrote insert", i, code.length);
}
