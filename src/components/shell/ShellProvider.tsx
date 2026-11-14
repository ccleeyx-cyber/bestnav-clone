"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiGet, apiPatch } from "./api";

export type TemplateId = "classic" | "magazine" | "console" | "desktop";
export type Density = "grid" | "list" | "compact";

export interface SessionUser {
  id: string;
  username: string;
  role: string;
  display_name: string;
}

export interface ShellState {
  user: SessionUser | null;
  template: TemplateId;
  theme: "light" | "dark";
  density: Density;
  settings: Record<string, string>;
  loading: boolean;
  setTemplate: (t: TemplateId) => void;
  setTheme: (t: "light" | "dark") => void;
  setDensity: (d: Density) => void;
  setSetting: (key: string, value: string) => void;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<ShellState | null>(null);

export const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: "classic", label: "经典" },
  { id: "magazine", label: "杂志" },
  { id: "console", label: "控制台" },
  { id: "desktop", label: "桌面" },
];

export const DENSITIES: { id: Density; label: string }[] = [
  { id: "grid", label: "网格" },
  { id: "list", label: "列表" },
  { id: "compact", label: "紧凑" },
];

export function applyTheme(theme: "light" | "dark") {
  const el = document.documentElement;
  if (theme === "dark") el.classList.add("dark");
  else el.classList.remove("dark");
}

export function ShellProvider({
  children,
  initialUser = null,
  initialSettings = {},
}: {
  children: ReactNode;
  initialUser?: SessionUser | null;
  initialSettings?: Record<string, string>;
}) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([
        apiGet<Record<string, string>>("/api/settings"),
        apiGet<{ needsSetup: boolean; user: SessionUser | null }>("/api/settings/status"),
      ]);
      setSettings(s ?? {});
      setUser(st?.user ?? null);
    } catch {
      /* 匿名或未初始化时忽略 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const template = (settings.template as TemplateId) || "classic";
  const theme = (settings.theme as "light" | "dark") || "light";
  const density = (settings.gridDensity as Density) || "grid";

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setSetting = useCallback(
    async (key: string, value: string) => {
      setSettings((s) => ({ ...s, [key]: value }));
      try {
        const next = await apiPatch<Record<string, string>>("/api/settings", {
          settings: { [key]: value },
        });
        if (next) setSettings(next);
      } catch {
        /* 未登录时忽略（仅本地生效） */
      }
    },
    [],
  );

  const setTemplate = useCallback((t: TemplateId) => void setSetting("template", t), [setSetting]);

  const setTheme = useCallback(
    (t: "light" | "dark") => {
      applyTheme(t);
      try {
        localStorage.setItem("bn-theme", t);
      } catch {
        /* ignore */
      }
      void setSetting("theme", t);
    },
    [setSetting],
  );

  const setDensity = useCallback(
    (d: Density) => void setSetting("gridDensity", d),
    [setSetting],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/settings/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    window.location.href = "/login";
  }, []);

  const value = useMemo<ShellState>(
    () => ({
      user,
      template,
      theme,
      density,
      settings,
      loading,
      setTemplate,
      setTheme,
      setDensity,
      setSetting,
      reload,
      logout,
    }),
    [user, template, theme, density, settings, loading, setTemplate, setTheme, setDensity, setSetting, reload, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell(): ShellState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShell must be used within ShellProvider");
  return v;
}
