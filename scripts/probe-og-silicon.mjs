const url =
  "https://thryco.com/collections/silicon-mould-and-mould-making-kit-collections";

function pick(html, ...res) {
  for (const re of res) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

const res = await fetch(url, {
  headers: {
    "user-agent": "facebookexternalhit/1.1",
    accept: "text/html",
  },
});
const html = await res.text();

const og = {
  status: res.status,
  title: pick(
    html,
    /property=["']og:title["']\s+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["']\s+property=["']og:title["']/i,
  ),
  image: pick(
    html,
    /property=["']og:image["']\s+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["']\s+property=["']og:image["']/i,
  ),
  imageWidth: pick(
    html,
    /property=["']og:image:width["']\s+content=["']([^"']+)["']/i,
  ),
  imageHeight: pick(
    html,
    /property=["']og:image:height["']\s+content=["']([^"']+)["']/i,
  ),
  imageType: pick(
    html,
    /property=["']og:image:type["']\s+content=["']([^"']+)["']/i,
  ),
  twitterImage: pick(
    html,
    /name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["']\s+name=["']twitter:image["']/i,
  ),
};

console.log(JSON.stringify(og, null, 2));

if (!og.image) {
  console.log(JSON.stringify({ imageFetch: "NO_OG_IMAGE" }));
  process.exit(0);
}

const img = await fetch(og.image, {
  method: "GET",
  headers: { "user-agent": "facebookexternalhit/1.1" },
  redirect: "follow",
});
const buf = Buffer.from(await img.arrayBuffer());
console.log(
  JSON.stringify(
    {
      imageUrl: og.image,
      imageStatus: img.status,
      contentType: img.headers.get("content-type"),
      contentLengthHeader: img.headers.get("content-length"),
      bytes: buf.length,
      cacheControl: img.headers.get("cache-control"),
      finalUrl: img.url,
    },
    null,
    2,
  ),
);
