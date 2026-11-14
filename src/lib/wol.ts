import dgram from "node:dgram";

export async function sendWakeOnLan(
  mac: string,
  broadcast = "255.255.255.255",
  port = 9,
): Promise<{ ok: boolean; error?: string }> {
  const hex = mac.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length !== 12) return { ok: false, error: "MAC 地址长度不正确" };
  const bytes = Buffer.alloc(102);
  for (let i = 0; i < 6; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  for (let i = 6; i < 102; i++) bytes[i] = 0xff;

  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    const done = (ok: boolean, error?: string) => {
      try { sock.close(); } catch { /* already closed */ }
      resolve(error ? { ok, error } : { ok });
    };
    sock.on("error", (e) => done(false, e.message));
    sock.bind(() => {
      sock.setBroadcast(true);
      sock.send(bytes, 0, bytes.length, port, broadcast, (err) => {
        if (err) done(false, err.message);
        else done(true);
      });
    });
  });
}
