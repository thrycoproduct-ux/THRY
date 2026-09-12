/**
 * Build + optionally upload India PIN directory shards to Cloudflare R2.
 *
 * Source: All India Pincode Directory CSV (data.gov.in). Expected columns
 * (case-insensitive): Pincode, StateName / State, District, OfficeName /
 * Officename / Office Name.
 *
 * Usage:
 *   # Build shards only (writes to .tmp/pincode-shards/)
 *   node scripts/build-pincode-r2-shards.mjs --csv path/to/pincode.csv
 *
 *   # Upload hot overrides (includes seed 560111) using .env.local S3_* keys
 *   node scripts/build-pincode-r2-shards.mjs --upload-overrides
 *
 *   # Build + upload all shards + overrides
 *   node scripts/build-pincode-r2-shards.mjs --csv path/to/pincode.csv --upload
 *
 * Env (from .env.local when --upload / --upload-overrides):
 *   S3_ENDPOINT, NEXT_PUBLIC_S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 *   NEXT_PUBLIC_S3_REGION (optional, default auto)
 *
 * R2 keys written:
 *   geo/pincode/{first3}.json   — shard maps pin → { state, district, office }
 *   geo/pincode-overrides.json  — hotfixes (seed + optional merge)
 *
 * Does not block app deploys — upload when ready; app falls back to local seed.
 */

import { AwsClient } from "aws4fetch";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(root, ".tmp", "pincode-shards");
const OVERRIDES_KEY = "geo/pincode-overrides.json";
const SEED_PATH = join(root, "src", "lib", "geo", "pincode-overrides.seed.json");

function parseArgs(argv) {
  const args = {
    csv: null,
    upload: false,
    uploadOverrides: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--upload") args.upload = true;
    else if (a === "--upload-overrides") args.uploadOverrides = true;
    else if (a === "--csv") args.csv = argv[++i] ?? null;
    else if (a.startsWith("--csv=")) args.csv = a.slice("--csv=".length);
  }
  return args;
}

function loadEnvLocal() {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [
          l.slice(0, i).trim(),
          l
            .slice(i + 1)
            .trim()
            .replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

function normalizeHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function pickCol(headers, names) {
  const normalized = headers.map(normalizeHeader);
  for (const name of names) {
    const idx = normalized.indexOf(normalizeHeader(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

async function buildShardsFromCsv(csvPath) {
  const stream = createReadStream(csvPath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let headers = null;
  let pinIdx = -1;
  let stateIdx = -1;
  let districtIdx = -1;
  let officeIdx = -1;
  /** @type {Map<string, Record<string, { state: string, district: string, office?: string }>>} */
  const shards = new Map();
  let rows = 0;
  let kept = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!headers) {
      headers = parseCsvLine(line);
      pinIdx = pickCol(headers, ["pincode", "pin", "pin code"]);
      stateIdx = pickCol(headers, [
        "statename",
        "state",
        "statenameenglish",
      ]);
      districtIdx = pickCol(headers, [
        "district",
        "districtname",
        "districtnameenglish",
      ]);
      officeIdx = pickCol(headers, [
        "officename",
        "office name",
        "office",
        "officenameenglish",
      ]);
      if (pinIdx < 0 || stateIdx < 0 || districtIdx < 0) {
        throw new Error(
          `CSV missing required columns. Found: ${headers.join(", ")}. ` +
            "Need Pincode, State/StateName, District.",
        );
      }
      continue;
    }

    rows++;
    const cells = parseCsvLine(line);
    const pin = String(cells[pinIdx] ?? "")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!/^\d{6}$/.test(pin)) continue;
    const state = String(cells[stateIdx] ?? "").trim();
    const district = String(cells[districtIdx] ?? "").trim();
    const office =
      officeIdx >= 0 ? String(cells[officeIdx] ?? "").trim() : "";
    if (!state || (!district && !office)) continue;

    const shardKey = pin.slice(0, 3);
    let map = shards.get(shardKey);
    if (!map) {
      map = {};
      shards.set(shardKey, map);
    }
    // Prefer first office; keep existing if already set.
    if (!map[pin]) {
      map[pin] = {
        state,
        district: district || office,
        ...(office ? { office } : {}),
      };
      kept++;
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  for (const [prefix, map] of shards) {
    writeFileSync(
      join(OUT_DIR, `${prefix}.json`),
      JSON.stringify(map),
      "utf8",
    );
  }

  console.log(
    JSON.stringify({
      csv: csvPath,
      rows,
      pins: kept,
      shards: shards.size,
      outDir: OUT_DIR,
    }),
  );
  return shards;
}

function loadSeedOverrides() {
  if (!existsSync(SEED_PATH)) {
    throw new Error(`Missing seed overrides at ${SEED_PATH}`);
  }
  return JSON.parse(readFileSync(SEED_PATH, "utf8"));
}

function createS3Client(env) {
  const endpoint = (env.S3_ENDPOINT || "").replace(/\/$/, "");
  const bucket = env.NEXT_PUBLIC_S3_BUCKET;
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing S3_ENDPOINT / NEXT_PUBLIC_S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY in .env.local",
    );
  }
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: env.NEXT_PUBLIC_S3_REGION || "auto",
  });
  return { client, endpoint, bucket };
}

async function putJson({ client, endpoint, bucket }, key, value) {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  const url = `${endpoint}/${bucket}/${key}`;
  const res = await client.fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body)),
      "Cache-Control": "public, max-age=3600",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `PUT ${key} failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  return key;
}

async function uploadOverrides(s3) {
  const overrides = loadSeedOverrides();
  await putJson(s3, OVERRIDES_KEY, overrides);
  console.log(
    JSON.stringify({
      uploaded: OVERRIDES_KEY,
      pins: Object.keys(overrides),
    }),
  );
}

async function uploadShards(s3) {
  if (!existsSync(OUT_DIR)) {
    throw new Error(`No shards at ${OUT_DIR}. Run with --csv first.`);
  }
  const { readdirSync } = await import("node:fs");
  const files = readdirSync(OUT_DIR).filter((f) => f.endsWith(".json"));
  let n = 0;
  for (const file of files) {
    const prefix = file.replace(/\.json$/, "");
    const key = `geo/pincode/${prefix}.json`;
    const body = readFileSync(join(OUT_DIR, file), "utf8");
    await putJson(s3, key, body);
    n++;
    if (n % 50 === 0) console.log(`uploaded ${n}/${files.length} shards…`);
  }
  console.log(JSON.stringify({ uploadedShards: n }));
}

function printHelp() {
  console.log(`build-pincode-r2-shards.mjs

Build offline PIN shards from the official All India Pincode Directory CSV
and upload to R2 (media bucket) for /api/geo/pincode fallback.

  node scripts/build-pincode-r2-shards.mjs --csv <file>
  node scripts/build-pincode-r2-shards.mjs --upload-overrides
  node scripts/build-pincode-r2-shards.mjs --csv <file> --upload

Day-one production fix (before full CSV import):
  node scripts/build-pincode-r2-shards.mjs --upload-overrides
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.csv && !args.upload && !args.uploadOverrides)) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  if (args.csv) {
    if (!existsSync(args.csv)) {
      throw new Error(`CSV not found: ${args.csv}`);
    }
    await buildShardsFromCsv(args.csv);
  }

  if (args.upload || args.uploadOverrides) {
    const env = { ...loadEnvLocal(), ...process.env };
    const s3 = createS3Client(env);
    if (args.uploadOverrides || args.upload) {
      await uploadOverrides(s3);
    }
    if (args.upload) {
      await uploadShards(s3);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
