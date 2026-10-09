const res = await fetch("https://thryco.com/", {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "text/html",
  },
});
const html = await res.text();

const scripts = new Set();
const styles = new Set();
const preloads = new Set();
const images = new Set();

for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) scripts.add(m[1]);
for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g))
  styles.add(m[1]);
for (const m of html.matchAll(/<link[^>]+rel="preload"[^>]+href="([^"]+)"/g))
  preloads.add(m[1]);
for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) images.add(m[1]);

const r2 = new Set();
for (const m of html.matchAll(/https:\/\/pub-[^"'\s]+/g)) r2.add(m[0]);

const thirdParty = new Set();
for (const m of html.matchAll(/https:\/\/(?!thryco\.com)[^"'\s]+/g)) {
  thirdParty.add(m[0].split(/["'?]/)[0]);
}

const thryStatic = [...scripts, ...styles, ...preloads].filter((u) =>
  u.startsWith("/_next/"),
);

console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      firstLoadNetworkRequestsEstimate: {
        document: 1,
        nextScripts: scripts.size,
        stylesheets: styles.size,
        preloads: preloads.size,
        imgTagsInHtml: images.size,
        productImagesR2: r2.size,
        thirdPartyScripts: [...thirdParty].filter((u) =>
          /clarity|cloudflare|vercel|razorpay/i.test(u),
        ).length,
      },
      subtotalTypicalFirstPaint:
        1 +
        scripts.size +
        styles.size +
        preloads.size +
        images.size +
        r2.size +
        3,
      note: "Subtotal excludes lazy chunks after hydration, scroll API calls, and Clarity beacon (~2-3 more)",
      scripts: [...scripts],
      styles: [...styles],
      preloads: [...preloads],
      thirdParty: [...thirdParty],
    },
    null,
    2,
  ),
);
