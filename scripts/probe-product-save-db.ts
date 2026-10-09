/**
 * Isolated probes so one postgres.js crash cannot kill the rest.
 * Usage: npx tsx --env-file=.env.local scripts/probe-product-save-db.ts
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const envFile = path.join(root, ".env.local");

const cases = [
  "tx-select",
  "tx-begin",
  "tx-drizzle-tx",
  "session-select",
  "session-begin",
  "session-drizzle-tx",
  "tx-count-products",
] as const;

for (const name of cases) {
  const result = spawnSync(
    "npx",
    [
      "tsx",
      `--env-file=${envFile}`,
      path.join(root, "scripts/probe-product-save-case.ts"),
      name,
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 25000,
      shell: true,
    },
  );
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const line = out.split(/\r?\n/).filter(Boolean).at(-1) ?? "(no output)";
  const status = result.status === 0 ? "PASS" : "FAIL";
  console.log(`${status}  ${name} :: ${line.slice(0, 200)}`);
}
