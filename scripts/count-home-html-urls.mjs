const res = await fetch("https://thryco.com/", {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
  },
});
const html = await res.text();

const allUrls = new Set();
const re = /(?:https?:\/\/[^\s"'<>]+|\/[a-zA-Z0-9_./?&=%-]+)/g;
for (const m of html.matchAll(re)) {
  const raw = m[0];
  if (raw.length < 4 || raw.startsWith("//")) continue;
  try {
    const u = new URL(raw, "https://thryco.com");
    allUrls.add(u.origin + u.pathname + u.search);
  } catch {
    /* skip */
  }
}

const byHost = {};
for (const url of allUrls) {
  const host = new URL(url).host;
  byHost[host] = (byHost[host] || 0) + 1;
}

const thry = [...allUrls].filter((u) => u.includes("thryco.com"));
const media = [...allUrls].filter((u) => u.includes("media.thryco.com"));
const nextJs = thry.filter((u) => u.includes("/_next/static/"));
const api = thry.filter((u) => u.includes("/api/"));

console.log(
  JSON.stringify(
    {
      initialHtmlUniqueUrls: allUrls.size,
      thrycoUrlsInHtml: thry.length,
      mediaUrlsInHtml: media.length,
      nextStaticInHtml: nextJs.length,
      apiInHtml: api.length,
      byHost,
      estimatedBrowserFirstLoad:
        "Initial HTML references ~" +
        thry.length +
        " thryco.com URLs; full browser load typically adds JS chunks + images + 2-4 API calls",
    },
    null,
    2,
  ),
);
