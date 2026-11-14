import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const BASE = "http://127.0.0.1:3199";

async function login() {
  const jar = [];
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: jar.join("; ") },
    body: JSON.stringify({ username: "tester", password: "test12345" }),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) jar.push(setCookie.split(";")[0]);
  return jar;
}

const jar = await login();
const b64 = readFileSync(".verify-data/test.png").toString("base64");

const res = await fetch(`${BASE}/api/tools`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: jar.join("; ") },
  body: JSON.stringify({ engine: "image.resize", input: { base64: b64, width: 50, height: 0 } }),
});
const j = await res.json();
console.log("ok =", j.ok, "mime =", j.data?.mime);

const out = j.data?.output;
const dataUrl = typeof out === "string" ? out : out?.data;
const raw = String(dataUrl).replace(/^data:image\/\w+;base64,/, "");
const buf = Buffer.from(raw, "base64");
writeFileSync(".verify-data/out.png", buf);
const m = await sharp(buf).metadata();
console.log("OUT", m.width + "x" + m.height, m.format, buf.length + " bytes");
