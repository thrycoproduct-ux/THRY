const ORIGIN = "https://thryco.com";
const seen = new Set();
const queue = ["/"];
const max = 120;

function normalize(url) {
  try {
    const u = new URL(url, ORIGIN);
    if (u.origin !== ORIGIN) return null;
    u.hash = "";
    return u.pathname + (u.search || "");
  } catch {
    return null;
  }
}

function extractUrls(html) {
  const found = [];
  const re =
    /(?:src|href)=["']([^"']+)["']|"(https:\/\/thryco\.com[^"]+)"|"(https:\/\/www\.thryco\.com[^"]+)"|"(https:\/\/media\.thryco\.com[^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1] || m[2] || m[3] || m[4];
    if (raw) found.push(raw);
  }
  return found;
}

while (queue.length > 0 && seen.size < max) {
  const path = queue.shift();
  const key = normalize(path);
  if (!key || seen.has(key)) continue;
  seen.add(key);

  const res = await fetch(new URL(key, ORIGIN), {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; THRY-request-counter/1.0)" },
    redirect: "follow",
  });
  const type = res.headers.get("content-type") || "";
  if (!type.includes("text/html") && !type.includes("javascript")) continue;
  const text = await res.text();
  for (const raw of extractUrls(text)) {
    const next = normalize(raw);
    if (next && !seen.has(next)) queue.push(next);
  }
}

const buckets = {
  document: 0,
  next_js: 0,
  next_css: 0,
  next_font: 0,
  api: 0,
  images: 0,
  other: 0,
};
for (const u of seen) {
  if (u === "/") buckets.document++;
  else if (u.startsWith("/api/")) buckets.api++;
  else if (u.includes("/_next/static/chunks/")) buckets.next_js++;
  else if (u.includes("/_next/static/css/")) buckets.next_css++;
  else if (u.includes("/_next/static/media/")) buckets.next_font++;
  else if (/\.(png|jpg|jpeg|webp|svg|gif|ico)/i.test(u)) buckets.images++;
  else buckets.other++;
}

console.log(
  JSON.stringify(
    {
      totalUniqueThryRequests: seen.size,
      buckets,
      note: "HTML+JS crawl only; runtime fetches (RSC flight, client nav) may add more",
    },
    null,
    2,
  ),
);
