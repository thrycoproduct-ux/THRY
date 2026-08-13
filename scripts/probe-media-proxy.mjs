import { readFileSync } from "fs";

const secret = readFileSync("scripts/.media-proxy-secret.tmp", "utf8").trim();
const base = "https://thry-media.thrycoproduct.workers.dev";
const key = `healthcheck/proxy-probe-${Date.now()}.txt`;

const put = await fetch(`${base}/object?key=${encodeURIComponent(key)}`, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "text/plain",
  },
  body: "proxy-ok",
});
const putText = await put.text();
console.log(JSON.stringify({ put: put.status, putText: putText.slice(0, 120) }));

const get = await fetch(`${base}/object?key=${encodeURIComponent(key)}`, {
  method: "GET",
  headers: { Authorization: `Bearer ${secret}` },
});
const getText = await get.text();
console.log(JSON.stringify({ get: get.status, getText }));

const del = await fetch(`${base}/object`, {
  method: "DELETE",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ keys: [key] }),
});
console.log(JSON.stringify({ del: del.status, delText: (await del.text()).slice(0, 120) }));
