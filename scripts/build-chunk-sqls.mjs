import { readFileSync, writeFileSync } from "node:fs";

const parts = JSON.parse(
  readFileSync("workers/thry-catalog/_chunks.json", "utf8"),
);
const sqls = parts.map(
  (p, i) =>
    `INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('worker_b64_${i}', '${p}');`,
);
writeFileSync("workers/thry-catalog/_chunk-sqls.json", JSON.stringify(sqls));
console.log(sqls.map((s) => s.length));
