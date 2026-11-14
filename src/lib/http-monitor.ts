/**
 * HTTP service monitoring for the `monitors` table (kind='http').
 */
export type HttpCheckResult = {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  error?: string;
};

export async function checkHttp(url: string, timeoutMs = 8000): Promise<HttpCheckResult> {
  const target = /^https?:\/\//i.test(url) ? url : `http://${url}`;
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: { "user-agent": "BestNav-Monitor/1.0" },
    });
    const latencyMs = Date.now() - started;
    return { ok: res.status >= 200 && res.status < 400, status: res.status, latencyMs };
  } catch (e) {
    const err = e as Error;
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - started,
      error: err.name === "AbortError" ? "超时" : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}
