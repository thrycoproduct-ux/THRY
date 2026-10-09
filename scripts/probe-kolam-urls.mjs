import { writeFileSync } from "node:fs";

const BASE = "https://thryco.com";

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "user-agent": "Mozilla/5.0 THRY-kolam-probe" },
    redirect: "follow",
  });
  const text = await res.text();
  return { status: res.status, text, url: res.url };
}

function extractHrefs(html) {
  const out = new Set();
  const re = /href="(\/(?:shop|collections)\/[^"#?]+)"/gi;
  let m;
  while ((m = re.exec(html))) out.add(m[1]);
  return [...out];
}

const collectionCandidates = [
  "/collections/kolam",
  "/collections/kolam-stencils",
  "/collections/kolam-stencil",
  "/collections/acrylic-stands-and-board-collections",
  "/collections/stencils",
];

const found = {
  collections: [],
  products: [],
};

for (const path of collectionCandidates) {
  const { status, text, url } = await get(path);
  const hrefs = extractHrefs(text);
  const products = hrefs.filter((h) => h.startsWith("/shop/"));
  found.collections.push({
    path,
    status,
    finalUrl: url,
    productCount: products.length,
    products: products.slice(0, 80),
  });
}

const home = await get("/");
const shop = await get("/shop");
const all = [
  ...extractHrefs(home.text),
  ...extractHrefs(shop.text),
  ...found.collections.flatMap((c) => c.products),
];
const kolamish = [...new Set(all)].filter((h) =>
  /kolam|stencil|acrylic|arcylic|bunch/i.test(h),
);

found.products = kolamish;
writeFileSync(
  "scripts/.kolam-probe.json",
  JSON.stringify(found, null, 2),
  "utf8",
);
console.log(JSON.stringify(found, null, 2));
