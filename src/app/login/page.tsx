"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { applyTheme } from "@/components/shell/ShellProvider";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("bn-theme");
    const isDark = t === "dark" || (!t && matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(isDark);
    applyTheme(isDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    // 未初始化（无任何用户）→ 引导到 /setup
    fetch("/api/settings/status")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d?.data?.needsSetup) router.replace("/setup");
      })
      .catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "登录失败");
      router.push("/");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1000px 500px at 15% 0%, rgb(var(--c-primary)/0.28), transparent 60%), radial-gradient(800px 480px at 90% 100%, rgb(var(--c-accent)/0.24), transparent 60%)",
        }}
      />
      <button
        className="absolute right-4 top-4 btn"
        onClick={() => {
          const next = dark ? "light" : "dark";
          setDark(!dark);
          applyTheme(next);
          try {
            localStorage.setItem("bn-theme", next);
          } catch {
            /* ignore */
          }
        }}
      >
        {dark ? "☀ 亮色" : "☾ 暗色"}
      </button>

      <div className="w-full max-w-[520px]">
        <div className="card p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary text-xl font-bold text-white">
              B
            </div>
            <h1 className="text-xl font-semibold">欢迎回到 BestNav</h1>
            <p className="mt-1 text-sm text-muted">登录后管理你的书签、分组与卡片墙</p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-muted" htmlFor="u">
                用户名
              </label>
              <input
                id="u"
                className="input"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted" htmlFor="p">
                密码
              </label>
              <input
                id="p"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
              />
            </div>
            {err && (
              <div className="rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-sm text-err">
                {err}
              </div>
            )}
            <button className="btn btn-primary w-full justify-center py-2" disabled={busy}>
              {busy ? "登录中…" : "登录"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          首次使用？{" "}
          <a className="text-primary hover:underline" href="/setup">
            创建管理员账号
          </a>
        </p>
      </div>
    </div>
  );
}
