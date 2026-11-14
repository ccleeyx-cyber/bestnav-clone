import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3199";

async function session() {
  const jar = [];
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "tester", password: "test12345" }),
  });
  const sc = res.headers.get("set-cookie");
  if (sc) jar.push(sc.split(";")[0]);
  return {
    cookie: jar.join("; "),
    async get(path) {
      const r = await fetch(`${BASE}${path}`, { headers: { cookie: jar.join("; ") } });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    async post(path, body) {
      const r = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: jar.join("; ") },
        body: JSON.stringify(body ?? {}),
      });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
  };
}

const s = await session();
const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
  }
}

await check("GET /api/health", async () => {
  const r = await s.get("/api/health");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return `status=${r.json.status}`;
});

await check("GET /api/bookmarks", async () => {
  const r = await s.get("/api/bookmarks");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return `groups=${r.json.data.groups?.length ?? r.json.data.length}`;
});

await check("GET /api/groups", async () => {
  const r = await s.get("/api/groups");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  const d = r.json.data;
  return `n=${(d.groups ?? d)?.length ?? 0}`;
});

await check("GET /api/cards", async () => {
  const r = await s.get("/api/cards");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return `n=${r.json.data.length ?? 0}`;
});

await check("GET /api/settings", async () => {
  const r = await s.get("/api/settings");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return "ok";
});

await check("GET /api/template", async () => {
  const r = await s.get("/api/template");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return `template=${r.json.data.template ?? r.json.data.current ?? "?"}`;
});

await check("GET /api/search/sources", async () => {
  const r = await s.get("/api/search/sources");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  const d = r.json.data;
  return `n=${(d.sources ?? d)?.length ?? 0}`;
});

await check("GET /api/navpack", async () => {
  const r = await s.get("/api/navpack");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return `packs=${r.json.data.packs?.length ?? 0}`;
});

await check("GET /api/tools", async () => {
  const r = await s.get("/api/tools");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return `engines=${r.json.data.count ?? r.json.data.engines?.length ?? 0}`;
});

await check("GET /api/monitor/docker", async () => {
  const r = await s.get("/api/monitor/docker");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return "ok";
});

await check("GET /api/monitor/host", async () => {
  const r = await s.get("/api/monitor/host");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return "ok";
});

await check("GET /api/monitor/http", async () => {
  const r = await s.get("/api/monitor/http");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return "ok";
});

await check("GET /api/ssl", async () => {
  const r = await s.get("/api/ssl");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return "ok";
});

await check("GET /api/traffic", async () => {
  const r = await s.get("/api/traffic");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return "ok";
});

await check("GET /api/notify", async () => {
  const r = await s.get("/api/notify");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return "ok";
});

await check("GET /api/actions", async () => {
  const r = await s.get("/api/actions");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return `switches=${r.json.data.switches.length}`;
});

await check("GET /api/users", async () => {
  const r = await s.get("/api/users");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return `n=${r.json.data.length}`;
});

await check("GET /api/audit", async () => {
  const r = await s.get("/api/audit");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return "ok";
});

await check("GET /api/backup", async () => {
  const r = await s.get("/api/backup");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return `backups=${r.json.data.backups.length}`;
});

await check("GET /api/visitors", async () => {
  const r = await s.get("/api/visitors");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return "ok";
});

await check("GET /api/notes", async () => {
  const r = await s.get("/api/notes");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return "ok";
});

await check("GET /api/calendar", async () => {
  const r = await s.get("/api/calendar");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return "ok";
});

await check("GET /api/relay/stats", async () => {
  const r = await s.get("/api/relay/stats");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return "ok";
});

await check("GET /api/relay", async () => {
  const r = await s.get("/api/relay");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return `relays=${r.json.data.length}`;
});

await check("GET /api/apikeys", async () => {
  const r = await s.get("/api/apikeys");
  if (!r.json?.ok) throw new Error(JSON.stringify(r.json));
  return `keys=${r.json.data.length}`;
});

await check("GET /api/monitor (public, no auth)", async () => {
  const r = await fetch(`${BASE}/api/bookmarks`);
  if (r.status !== 200) throw new Error(`status=${r.status}`);
  return "public readable";
});

const pass = results.filter((r) => r.ok).length;
console.log(`\n=== ${pass}/${results.length} passed ===`);
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
process.exit(pass === results.length ? 0 : 1);
