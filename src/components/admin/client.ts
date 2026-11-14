"use client";

/** 管理后台统一的 API 调用封装：返回 {ok,data,error}。 */
export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<{ ok: boolean; data?: T; error?: string; extra?: unknown }> {
  const { json, ...rest } = init ?? {};
  try {
    const res = await fetch(path, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "content-type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: T;
      error?: string;
      extra?: unknown;
    };
    if (!res.ok || body.ok === false) {
      return { ok: false, error: body.error ?? `请求失败 (${res.status})`, extra: body.extra };
    }
    return { ok: true, data: body.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "网络错误" };
  }
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
