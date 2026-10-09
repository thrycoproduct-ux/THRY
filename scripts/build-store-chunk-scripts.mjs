import { readFileSync, writeFileSync } from "node:fs";

const parts = JSON.parse(
  readFileSync("workers/thry-catalog/_chunks.json", "utf8"),
);

for (let i = 0; i < parts.length; i++) {
  const chunk = parts[i];
  const code = `async () => {
  const dbId = "85283c0d-4c77-4187-8d68-ff166a1a6d50";
  const chunk = ${JSON.stringify(chunk)};
  const res = await cloudflare.request({
    method: "POST",
    path: "/accounts/" + accountId + "/d1/database/" + dbId + "/query",
    body: {
      sql: "INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)",
      params: ["worker_b64_${i}", chunk],
    },
  });
  return { success: res.success, errors: res.errors, i: ${i}, chunkLen: chunk.length };
}`;
  writeFileSync(`workers/thry-catalog/_store-chunk-${i}.js`, code);
  console.log(i, code.length);
}
