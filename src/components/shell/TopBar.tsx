"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DENSITIES, TEMPLATES, useShell, type Density, type TemplateId } from "./ShellProvider";

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return ref;
}

export function TopBar({ children }: { children?: React.ReactNode }) {
  const shell = useShell();
  const router = useRouter();
  const [menu, setMenu] = useState<"none" | "template" | "density" | "user" | "settings">("none");
  const menuRef = useOutsideClose(() => setMenu("none"));

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
        <button
          className="flex items-center gap-2 text-base font-semibold"
          onClick={() => router.push("/")}
          title="BestNav 首页"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-sm text-white">
            B
          </span>
          <span className="hidden sm:inline">BestNav</span>
        </button>

        <div className="flex-1">{children}</div>

        <div ref={menuRef} className="relative flex items-center gap-1.5">
          {/* 模板切换 */}
          <button
            className="btn"
            onClick={() => setMenu((m) => (m === "template" ? "none" : "template"))}
          >
            模板
          </button>
          {menu === "template" && (
            <div className="absolute right-0 top-full z-50 mt-2 w-40 rounded-xl border border-border bg-surface p-1 shadow-card">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm transition ${
                    shell.template === t.id ? "bg-primary/10 text-primary" : "hover:bg-bg"
                  }`}
                  onClick={() => {
                    shell.setTemplate(t.id as TemplateId);
                    setMenu("none");
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* 密度 */}
          <button
            className="btn"
            onClick={() => setMenu((m) => (m === "density" ? "none" : "density"))}
          >
            布局
          </button>
          {menu === "density" && (
            <div className="absolute right-0 top-full z-50 mt-2 w-36 rounded-xl border border-border bg-surface p-1 shadow-card">
              {DENSITIES.map((d) => (
                <button
                  key={d.id}
                  className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm transition ${
                    shell.density === d.id ? "bg-primary/10 text-primary" : "hover:bg-bg"
                  }`}
                  onClick={() => {
                    shell.setDensity(d.id as Density);
                    setMenu("none");
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}

          {/* 明暗 */}
          <button
            className="btn"
            title={shell.theme === "dark" ? "切换到亮色" : "切换到暗色"}
            onClick={() => shell.setTheme(shell.theme === "dark" ? "light" : "dark")}
          >
            {shell.theme === "dark" ? "☀" : "☾"}
          </button>

          {/* 设置 */}
          <button
            className="btn"
            title="外观设置"
            onClick={() => setMenu((m) => (m === "settings" ? "none" : "settings"))}
          >
            ⚙
          </button>
          {menu === "settings" && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border bg-surface p-3 shadow-card">
              <label className="mb-1 block text-xs text-muted">主题</label>
              <div className="mb-3 flex gap-1.5">
                {(["light", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    className={`btn flex-1 ${shell.theme === t ? "btn-primary" : ""}`}
                    onClick={() => shell.setTheme(t)}
                  >
                    {t === "light" ? "亮色" : "暗色"}
                  </button>
                ))}
              </div>
              <label className="mb-1 block text-xs text-muted">布局密度</label>
              <div className="mb-3 flex gap-1.5">
                {DENSITIES.map((d) => (
                  <button
                    key={d.id}
                    className={`btn flex-1 ${shell.density === d.id ? "btn-primary" : ""}`}
                    onClick={() => shell.setDensity(d.id as Density)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <label className="mb-1 block text-xs text-muted">背景</label>
              <input
                className="input"
                placeholder="背景图片 URL（留空为纯色）"
                defaultValue={shell.settings.background ?? ""}
                onBlur={(e) => void shell.setSetting("background", e.target.value.trim())}
              />
            </div>
          )}

          {/* 用户 */}
          {shell.user ? (
            <>
              <button
                className="btn"
                onClick={() => setMenu((m) => (m === "user" ? "none" : "user"))}
              >
                {shell.user.display_name || shell.user.username}
              </button>
              {menu === "user" && (
                <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-border bg-surface p-1 shadow-card">
                  <div className="px-3 py-1.5 text-xs text-muted">
                    {shell.user.username} · {shell.user.role}
                  </div>
                  <button
                    className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-bg"
                    onClick={() => {
                      setMenu("none");
                      void shell.logout();
                    }}
                  >
                    退出登录
                  </button>
                </div>
              )}
            </>
          ) : (
            <button className="btn" onClick={() => router.push("/login")}>
              登录
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
