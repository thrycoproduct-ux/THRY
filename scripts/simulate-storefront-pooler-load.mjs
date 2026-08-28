#!/usr/bin/env node
/**
 * Production-safe read-only burst simulation (crawler / PDP cold-load patterns).
 * Does not POST checkout or mutate data.
 *
 * Usage:
 *   node scripts/simulate-storefront-pooler-load.mjs
 *   node scripts/simulate-storefront-pooler-load.mjs --base https://thryco.com --concurrency 25
 */

const args = process.argv.slice(2);

function readArg(name, fallback) {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const BASE = readArg("--base", "https://thryco.com").replace(/\/$/, "");
const CONCURRENCY = Number(readArg("--concurrency", "20"));
const TIMEOUT_MS = Number(readArg("--timeout", "30000"));

async function fetchWithTiming(url) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "thry-pooler-sim/1.0" },
      redirect: "follow",
    });
    const ms = Date.now() - started;
    const bodySnippet = await res.text();
    const poolerError =
      bodySnippet.includes("EMAXCONN") ||
      bodySnippet.includes("max client connections");
    return {
      url,
      status: res.status,
      ms,
      poolerError,
      ok: res.ok && !poolerError,
    };
  } catch (error) {
    return {
      url,
      status: 0,
      ms: Date.now() - started,
      poolerError: false,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(urls, label, concurrency = CONCURRENCY) {
  console.log(`\n=== ${label} (${urls.length} requests, concurrency ${concurrency}) ===`);
  const results = [];
  let index = 0;

  async function worker() {
    while (index < urls.length) {
      const current = index++;
      results[current] = await fetchWithTiming(urls[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()),
  );

  const ok = results.filter((r) => r.ok).length;
  const poolerHits = results.filter((r) => r.poolerError).length;
  const failed = results.filter((r) => !r.ok);
  const p95 = [...results]
    .map((r) => r.ms)
    .sort((a, b) => a - b)[Math.floor(results.length * 0.95)];

  console.log(`ok: ${ok}/${results.length} | pooler errors: ${poolerHits} | p95: ${p95}ms`);
  for (const row of failed.slice(0, 5)) {
    console.log(
      `  FAIL ${row.status} ${row.ms}ms ${row.url}${row.error ? ` (${row.error})` : ""}`,
    );
  }
  if (failed.length > 5) {
    console.log(`  ... and ${failed.length - 5} more failures`);
  }

  return { ok, total: results.length, poolerHits, p95, failed };
}

function extractShopSlugs(sitemapXml, limit) {
  const slugs = [];
  const re = /<loc>[^<]*\/shop\/([^<]+)<\/loc>/g;
  let match;
  while ((match = re.exec(sitemapXml)) && slugs.length < limit) {
    slugs.push(decodeURIComponent(match[1]));
  }
  return slugs;
}

async function main() {
  console.log(`Base: ${BASE}`);

  const health = await fetchWithTiming(`${BASE}/api/health`);
  console.log(
    `\nHealth: ${health.status} in ${health.ms}ms${health.poolerError ? " [POOLER]" : ""}`,
  );

  const sitemapRes = await fetchWithTiming(`${BASE}/sitemap.xml`);
  console.log(
    `Sitemap: ${sitemapRes.status} in ${sitemapRes.ms}ms${sitemapRes.poolerError ? " [POOLER]" : ""}`,
  );

  let slugs = ["kolam-stencil-10cm"];
  if (sitemapRes.ok) {
    const xml = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text());
    const fromSitemap = extractShopSlugs(xml, 24);
    if (fromSitemap.length > 0) slugs = fromSitemap;
  }

  const pdpUrls = slugs.map((slug) => `${BASE}/shop/${encodeURIComponent(slug)}`);

  const cases = [
    {
      label: "Case A — single PDP (warm path baseline)",
      urls: [pdpUrls[0]],
      concurrency: 1,
    },
    {
      label: "Case B — sitemap crawl (sequential, like our fix)",
      urls: [`${BASE}/sitemap.xml`],
      concurrency: 1,
    },
    {
      label: "Case C — Google-style PDP burst",
      urls: pdpUrls,
      concurrency: CONCURRENCY,
    },
    {
      label: "Case D — mixed crawl (sitemap + PDP burst)",
      urls: [`${BASE}/sitemap.xml`, ...pdpUrls.slice(0, 12)],
      concurrency: CONCURRENCY,
    },
    {
      label: "Case E — shop listing + featured paths",
      urls: [
        `${BASE}/shop`,
        `${BASE}/collections`,
        `${BASE}/`,
        ...pdpUrls.slice(0, 5),
      ],
      concurrency: 8,
    },
  ];

  const summary = [];
  for (const scenario of cases) {
    const result = await runPool(
      scenario.urls,
      scenario.label,
      scenario.concurrency ?? CONCURRENCY,
    );
    summary.push({ ...scenario, ...result });
  }

  console.log("\n=== Summary ===");
  for (const row of summary) {
    const status = row.poolerHits > 0 ? "POOLER_ERR" : row.ok === row.total ? "PASS" : "WARN";
    console.log(
      `${status} | ${row.label} | ${row.ok}/${row.total} ok | p95 ${row.p95}ms`,
    );
  }

  const anyPooler = summary.some((r) => r.poolerHits > 0);
  process.exit(anyPooler ? 2 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
