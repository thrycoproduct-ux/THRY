import { readFileSync, writeFileSync } from "node:fs";

const code = readFileSync("workers/thry-catalog/_store-chunk-0.js", "utf8");
writeFileSync(
  "workers/thry-catalog/_invoke0.json",
  JSON.stringify({ code }),
);
console.log("wrote", Buffer.byteLength(JSON.stringify({ code })));
