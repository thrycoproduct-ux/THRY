import fs from "node:fs";

for (const name of ["p-0", "p-1"]) {
  const b64 = fs.readFileSync(
    `scripts/_d1-mcp-apply/worker-staging/${name}.js.b64`,
    "utf8",
  );
  const wrap = `async () => {
  const code = atob(${JSON.stringify(b64)});
  const fn = (0, eval)("(" + code + ")");
  return await fn();
}`;
  fs.writeFileSync(
    `scripts/_d1-mcp-apply/worker-staging/${name}.wrap.js`,
    wrap,
  );
  console.log(name, wrap.length);
}
