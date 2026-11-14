"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { applyTheme } from "@/components/shell/ShellProvider";

export default function SetupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("bn-theme");
    if (t === "dark" || (!t && matchMedia("(prefers-color-scheme: dark)").matches)) {
      applyTheme("dark");
    }
    fetch("/api/settings/status")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && !d?.data?.needsSetup) router.replace("/login");
      })
      .catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (password.length < 6) return setErr("密码至少 6 位");
    if (password !== confirm) return setErr("两次输入的密码不一致");
    setBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, display_name: displayName }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "创建失败");
      setDone(true);
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "创建失败");
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
            "radial-gradient(1000px 520px at 20% 0%, rgb(var(--c-primary)/0.3), transparent 60%), radial-gradient(760px 460px at 85% 100%, rgb(var(--c-accent)/0.26), transparent 60%)",
        }}
      />
      <div className="w-full max-w-[520px]">
        <div className="mb-5 rounded-[14px] border border-border bg-surface/80 px-6 py-4 text-center backdrop-blur">
          <h1 className="text-lg font-semibold">初始化 BestNav</h1>
          <p className="mt-1 text-sm text-muted">
            创建第一个管理员（owner）账号，该账号拥有全部权限。
          </p>
        </div>

        <div className="card p-8">
          {done ? (
            <div className="py-6 text-center">
              <div className="mb-2 text-3xl text-ok">✓</div>
              <p className="text-sm text-muted">创建成功，正在进入首页…</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-muted" htmlFor="su">
                  用户名
                </label>
                <input
                  id="su"
                  className="input"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="至少 3 个字符"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted" htmlFor="sn">
                  显示名（可选）
                </label>
                <input
                  id="sn"
                  className="input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="例如：管理员"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted" htmlFor="sp">
                  密码
                </label>
                <input
                  id="sp"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted" htmlFor="sc">
                  确认密码
                </label>
                <input
                  id="sc"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {err && (
                <div className="rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-sm text-err">
                  {err}
                </div>
              )}
              <button className="btn btn-primary w-full justify-center py-2" disabled={busy}>
                {busy ? "创建中…" : "创建管理员并进入"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
