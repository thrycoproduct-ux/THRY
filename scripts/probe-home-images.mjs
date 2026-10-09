const urls = [
  "https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev/uploads/upload-UxsKPiHH0huPjKvjWhLS2.webp",
  "https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev/uploads/upload-bat0Jc4NISjTbZoNSmUlQ.png",
  "https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev/uploads/upload-1U5INHtiDEdmha5BMrfaR.png",
];
for (const u of urls) {
  const r = await fetch(u, { method: "HEAD" });
  console.log(
    r.status,
    String(r.headers.get("content-length")).padStart(8),
    r.headers.get("content-type"),
    u.split("/").pop(),
  );
}
