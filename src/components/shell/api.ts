"use client";

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  extra?: unknown;
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  let payload: ApiResult<T> | null = null;
  try {
    payload = (await res.json()) as ApiResult<T>;
  } catch {
    payload = null;
  }
  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.error ?? `请求失败 (${res.status})`);
  }
  return payload.data as T;
}

export const apiGet = <T,>(path: string) => api<T>(path);
export const apiPost = <T,>(path: string, body: unknown) => api<T>(path, { method: "POST", json: body });
export const apiPatch = <T,>(path: string, body: unknown) => api<T>(path, { method: "PATCH", json: body });
export const apiDelete = <T,>(path: string) => api<T>(path, { method: "DELETE" });
