#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const result = spawnSync(process.execPath, [path.join(root, "validate-thry-media-proxy.mjs")], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
