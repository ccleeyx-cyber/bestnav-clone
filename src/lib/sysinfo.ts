/**
 * Cross-platform host resource sampling.
 * Linux  : /proc + /sys
 * macOS  : os module + vm_stat + df
 * Windows: os module + wmic/PowerShell subprocess (3s timeout, degrade to null)
 */
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import os from "node:os";

export type DiskUsage = { mount: string; total: number; used: number; free: number; usePct: number };
export type NetIface = { name: string; rx: number; tx: number };
export type HostSnapshot = {
  ts: number;
  platform: string;
  cpu: { model: string; cores: number; usagePct: number; loadAvg: number[] };
  mem: { total: number; used: number; free: number; usagePct: number };
  disk: DiskUsage[];
  net: { iface: NetIface[]; rxTotal: number; txTotal: number };
  uptimeSec: number;
  temps: { label: string; celsius: number }[] | null;
  nodeVersion: string;
};

function execCmd(
  cmd: string,
  args: string[],
  timeout = 3000,
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        if (err) return resolve(null);
        resolve(String(stdout));
      });
    } catch {
      resolve(null);
    }
  });
}

let lastCpu: { idle: number; total: number } | null = null;

/* ------------------------------- Linux ------------------------------- */

async function linuxCpu(): Promise<{ model: string; cores: number; usagePct: number }> {
  const model = os.cpus()[0]?.model?.trim() || "CPU";
  const cores = os.cpus().length || 1;
  let usagePct = 0;
  try {
    const raw = await readFile("/proc/stat", "utf8");
    const line = raw.split("\n").find((l) => l.startsWith("cpu "));
    if (line) {
      const parts = line.trim().split(/\s+/).slice(1).map(Number);
      const idle = parts[3] ?? 0;
      const total = parts.reduce((a, b) => a + b, 0);
      if (lastCpu) {
        const dIdle = idle - lastCpu.idle;
        const dTotal = total - lastCpu.total;
        if (dTotal > 0) usagePct = Math.round((1 - dIdle / dTotal) * 1000) / 10;
      }
      lastCpu = { idle, total };
    }
  } catch {
    /* not linux */
  }
  return { model, cores, usagePct };
}

async function linuxMem(): Promise<{ total: number; used: number; free: number; usagePct: number }> {
  try {
    const raw = await readFile("/proc/meminfo", "utf8");
    const get = (k: string) => {
      const m = raw.match(new RegExp(`^${k}:\\s+(\\d+)`, "m"));
      return m ? Number(m[1]) * 1024 : 0;
    };
    const total = get("MemTotal");
    const free = get("MemAvailable");
    const cached = get("Cached");
    const buffers = get("Buffers");
    const used = Math.max(0, total - free - cached - buffers);
    return { total, used, free, usagePct: total ? Math.round((used / total) * 1000) / 10 : 0 };
  } catch {
    return windowsMem();
  }
}

async function linuxNet(): Promise<NetIface[]> {
  try {
    const raw = await readFile("/proc/net/dev", "utf8");
    const out: NetIface[] = [];
    for (const line of raw.split("\n").slice(2)) {
      const [rawName, rest] = line.split(":");
      if (!rawName || !rest) continue;
      const name = rawName.trim();
      const cols = rest.trim().split(/\s+/).map(Number);
      const rx = cols[0] ?? 0;
      const tx = cols[8] ?? 0;
      out.push({ name, rx, tx });
    }
    return out;
  } catch {
    return [];
  }
}

async function linuxUptime(): Promise<number> {
  try {
    const raw = await readFile("/proc/uptime", "utf8");
    return Math.round(Number(raw.trim().split(/\s+/)[0] ?? 0));
  } catch {
    return Math.round(os.uptime());
  }
}

async function linuxTemps(): Promise<{ label: string; celsius: number }[] | null> {
  try {
    const base = "/sys/class/thermal";
    const entries = await readdir(base);
    const out: { label: string; celsius: number }[] = [];
    for (const e of entries) {
      if (!e.startsWith("thermal_zone")) continue;
      try {
        const t = await readFile(`${base}/${e}/temp`, "utf8");
        const milli = Number(t.trim());
        if (Number.isFinite(milli) && milli > 0) {
          out.push({ label: e, celsius: Math.round((milli / 1000) * 10) / 10 });
        }
      } catch {
        /* skip */
      }
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

async function linuxDisk(): Promise<DiskUsage[]> {
  const out: DiskUsage[] = [];
  try {
    const raw = await readFile("/proc/mounts", "utf8");
    for (const line of raw.split("\n")) {
      const [dev, mount, type] = line.split(/\s+/);
      if (!mount || !type) continue;
      if (!/^(ext4|xfs|btrfs|overlay|vfat|f2fs|ntfs3?)$/.test(type)) continue;
      if (dev.startsWith("/dev/loop")) continue;
      out.push(await statDisk(mount));
    }
  } catch {
    /* fall through */
  }
  return out;
}

/* ------------------------------ Windows ------------------------------ */

function windowsMem() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return { total, used, free, usagePct: total ? Math.round((used / total) * 1000) / 10 : 0 };
}

async function windowsDisk(): Promise<DiskUsage[]> {
  const out: DiskUsage[] = [];
  const ps = "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { \"$($_.DeviceID)|$($_.Size)|$($_.FreeSpace)\" }";
  const raw = await execCmd("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps]);
  if (raw) {
    for (const line of raw.split(/\r?\n/)) {
      const [drive, size, free] = line.split("|");
      if (!drive || !size || !free) continue;
      const total = Number(size);
      const freeB = Number(free);
      if (!Number.isFinite(total) || total <= 0) continue;
      const usedB = total - freeB;
      out.push({
        mount: drive.trim(),
        total,
        used: usedB,
        free: freeB,
        usePct: Math.round((usedB / total) * 1000) / 10,
      });
    }
    return out;
  }
  const wmic = await execCmd("wmic", ["logicaldisk", "get", "DeviceID,Size,FreeSpace"]);
  if (wmic) {
    for (const line of wmic.split(/\r?\n/).slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 3) continue;
      const total = Number(cols[1]);
      const freeB = Number(cols[2]);
      if (!Number.isFinite(total) || total <= 0) continue;
      const usedB = total - freeB;
      out.push({
        mount: cols[0],
        total,
        used: usedB,
        free: freeB,
        usePct: Math.round((usedB / total) * 1000) / 10,
      });
    }
  }
  return out;
}

async function windowsTemps(): Promise<{ label: string; celsius: number }[] | null> {
  const raw = await execCmd("wmic", [
    "/namespace:\\\\root\\wmi",
    "path",
    "MSAcpi_ThermalZoneTemperature",
    "get",
    "CurrentTemperature",
  ]);
  if (!raw) return null;
  const out: { label: string; celsius: number }[] = [];
  let i = 0;
  for (const line of raw.split(/\r?\n/).slice(1)) {
    const v = Number(line.trim());
    if (!Number.isFinite(v) || v <= 0) continue;
    // value is in tenths of Kelvin
    out.push({ label: `zone${i++}`, celsius: Math.round((v / 10 - 273.15) * 10) / 10 });
  }
  return out.length ? out : null;
}

/** Windows NIC byte counters via Get-NetAdapterStatistics (3s timeout, degrades to []). */
async function windowsNet(): Promise<NetIface[]> {
  const ps =
    "Get-NetAdapterStatistics | ForEach-Object { \"$($_.Name)|$($_.ReceivedBytes)|$($_.SentBytes)\" }";
  const raw = await execCmd("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps]);
  if (!raw) return [];
  const out: NetIface[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const [name, rx, tx] = line.split("|");
    if (!name || !rx || !tx) continue;
    const r = Number(rx);
    const t = Number(tx);
    if (!Number.isFinite(r) || !Number.isFinite(t)) continue;
    out.push({ name: name.trim(), rx: r, tx: t });
  }
  return out;
}

/* -------------------------------- macOS ------------------------------ */

async function macDisk(): Promise<DiskUsage[]> {
  const raw = await execCmd("df", ["-k"]);
  if (!raw) return [];
  const out: DiskUsage[] = [];
  for (const line of raw.split("\n").slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4) continue;
    const [mount, , totalK, freeK] = cols;
    if (!mount || !totalK || !freeK) continue;
    if (!mount.startsWith("/")) continue;
    const total = Number(totalK) * 1024;
    const free = Number(freeK) * 1024;
    if (!Number.isFinite(total) || total <= 0) continue;
    const used = total - free;
    out.push({ mount, total, used, free, usePct: Math.round((used / total) * 1000) / 10 });
  }
  return out;
}

async function macTemps(): Promise<{ label: string; celsius: number }[] | null> {
  const raw = await execCmd("osx-cpu-temp", []);
  if (!raw) return null;
  const m = raw.match(/([\d.]+)\s*°?C/i);
  if (!m) return null;
  return [{ label: "cpu", celsius: Math.round(Number(m[1]) * 10) / 10 }];
}

/** macOS per-interface byte counters via netstat -ib (3s timeout, degrades to []). */
async function macNet(): Promise<NetIface[]> {
  const raw = await execCmd("netstat", ["-ib"]);
  if (!raw) return [];
  const out: NetIface[] = [];
  for (const line of raw.split("\n").slice(2)) {
    const cols = line.trim().split(/\s+/);
    // name, Mtu, Network, Address, Ipkts, Ierrs, Opkts, Oerrs, Bytes (rx), ...
    if (cols.length < 10) continue;
    const name = cols[0];
    const rx = Number(cols[8]);
    const tx = Number(cols[9]);
    if (!name || !Number.isFinite(rx) || !Number.isFinite(tx)) continue;
    out.push({ name, rx, tx });
  }
  return out;
}

/* -------------------------------- shared ----------------------------- */

async function statDisk(mount: string): Promise<DiskUsage> {
  try {
    const s = await execCmd("df", ["-k", mount]);
    if (s) {
      const cols = s.trim().split(/\n/).pop()!.trim().split(/\s+/);
      const total = Number(cols[1]) * 1024;
      const used = Number(cols[2]) * 1024;
      const free = Number(cols[3]) * 1024;
      if (total > 0) {
        return { mount, total, used, free, usePct: Math.round((used / total) * 1000) / 10 };
      }
    }
  } catch {
    /* ignore */
  }
  return { mount, total: 0, used: 0, free: 0, usePct: 0 };
}

export async function collectHostSnapshot(): Promise<HostSnapshot> {
  const platform = process.platform;
  let net: NetIface[] = [];
  if (platform === "linux") net = await linuxNet();
  else if (platform === "darwin") net = await macNet();
  else if (platform === "win32") net = await windowsNet();

  const iface: NetIface[] =
    net.length > 0
      ? net
      : Object.entries(os.networkInterfaces()).flatMap(([name, addrs]) => {
          const list = (addrs ?? []).filter((a) => a.family === "IPv4");
          return list.length ? [{ name, rx: 0, tx: 0 }] : [];
        });

  const rxTotal = iface.reduce((a, b) => a + b.rx, 0);
  const txTotal = iface.reduce((a, b) => a + b.tx, 0);

  let cpu = { model: os.cpus()[0]?.model?.trim() || "CPU", cores: os.cpus().length || 1, usagePct: 0 };
  let mem = { total: os.totalmem(), used: 0, free: os.freemem(), usagePct: 0 };
  let disk: DiskUsage[] = [];
  let temps: { label: string; celsius: number }[] | null = null;
  let uptimeSec = Math.round(os.uptime());

  if (platform === "linux") {
    cpu = await linuxCpu();
    mem = await linuxMem();
    disk = await linuxDisk();
    temps = await linuxTemps();
    uptimeSec = await linuxUptime();
  } else if (platform === "darwin") {
    const vm = await execCmd("vm_stat", []);
    if (vm) {
      const page = Number(vm.match(/page size of (\d+)/)?.[1] ?? 4096);
      const get = (k: string) => Number(vm.match(new RegExp(`${k}:\\s+(\\d+)`))?.[1] ?? 0) * page;
      const active = get("Pages active");
      const inactive = get("Pages inactive");
      const wired = get("Pages wired down");
      const compressed = get("Pages occupied by compressor");
      const total = os.totalmem();
      const used = active + wired + compressed;
      mem = {
        total,
        used,
        free: Math.max(0, total - used - inactive),
        usagePct: total ? Math.round((used / total) * 1000) / 10 : 0,
      };
    }
    disk = await macDisk();
    temps = await macTemps();
  } else {
    mem = windowsMem();
    disk = await windowsDisk();
    temps = await windowsTemps();
  }

  const loadAvg = os.loadavg();

  return {
    ts: Date.now(),
    platform,
    cpu: { ...cpu, loadAvg },
    mem,
    disk,
    net: { iface, rxTotal, txTotal },
    uptimeSec,
    temps,
    nodeVersion: process.version,
  };
}

/** Interfaces excluded from traffic accounting. */
export function isNoiseIface(name: string): boolean {
  const n = name.toLowerCase();
  return n === "lo" || n.startsWith("lo0") || n.startsWith("veth") || n.startsWith("docker") || n.startsWith("br-");
}
