import fs from "node:fs";

for (let i = 0; i < 8; i++) {
  const chunk = fs.readFileSync(
    `scripts/_d1-mcp-apply/r2-chunk-${i}.json`,
    "utf8",
  );
  const code = `async () => {
  const body = ${JSON.stringify(chunk)};
  const res = await cloudflare.request({
    method: "PUT",
    path: "/accounts/" + accountId + "/r2/buckets/thry-cdn/objects/internal/catalog-seed/chunk-${i}.json",
    body,
    contentType: "application/json",
    rawBody: true,
  });
  return { chunk: ${i}, success: res.success, status: res.status, errors: res.errors };
}`;
  fs.writeFileSync(`scripts/_d1-mcp-apply/r2-upload-${i}.js`, code);
  console.log(i, code.length);
}
