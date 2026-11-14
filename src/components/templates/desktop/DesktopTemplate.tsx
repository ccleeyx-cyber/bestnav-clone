"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DesktopApp, DesktopData } from "./types";

interface WinState {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
}

const DEFAULT_W = 720;
const DEFAULT_H = 420;

/**
 * macOS 风格桌面：窗口可拖动 / 最小化 / 最大化，Dock 有放大动画。
 * 纯 React state + CSS transform，不引任何库。
 */
export default function DesktopTemplate({ data }: { data: DesktopData }) {
  const [wins, setWins] = useState<WinState[]>(() =>
    data.apps.map((app, i) => ({
      id: app.id,
      x: 60 + (i % 3) * 80,
      y: 40 + Math.floor(i / 3) * 60,
      w: DEFAULT_W,
      h: DEFAULT_H,
      z: i + 1,
      minimized: false,
      maximized: false,
    })),
  );
  const [zTop, setZTop] = useState(data.apps.length + 1);
  const [openAppId, setOpenAppId] = useState<string | null>(data.apps[0]?.id ?? null);
  const [dockHover, setDockHover] = useState<{ x: number; w: number } | null>(null);

  const apps = useMemo(() => data.apps, [data.apps]);

  const openApp = useCallback(
    (id: string) => {
      setWins((prev) =>
        prev.map((w) =>
          w.id === id ? { ...w, minimized: false, z: zTop + 1 } : w,
        ),
      );
      setZTop((z) => z + 1);
      setOpenAppId(id);
    },
    [zTop],
  );

  const minimize = (id: string) =>
    setWins((prev) => prev.map((w) => (w.id === id ? { ...w, minimized: true } : w)));

  const toggleMax = (id: string) =>
    setWins((prev) =>
      prev.map((w) => (w.id === id ? { ...w, maximized: !w.maximized, z: zTop + 1 } : w)),
    );
  const close = (id: string) =>
    setWins((prev) => prev.filter((w) => w.id !== id));

  const drag = useCallback(
    (id: string, dx: number, dy: number) => {
      setWins((prev) =>
        prev.map((w) =>
          w.id === id && !w.maximized
            ? { ...w, x: Math.max(0, w.x + dx), y: Math.max(0, w.y + dy) }
            : w,
        ),
      );
    },
    [],
  );

  const resize = useCallback((id: string, dw: number, dh: number) => {
    setWins((prev) =>
      prev.map((w) =>
        w.id === id
          ? {
              ...w,
              w: Math.max(320, w.w + dw),
              h: Math.max(200, w.h + dh),
            }
          : w,
      ),
    );
  }, []);

  if (apps.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#1b2440] via-[#16233c] to-[#0f1729] text-sm text-white/70">
        暂无可用的桌面应用（没有公开书签）。
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#1b2440] via-[#16233c] to-[#0f1729]"
      style={
        data.wallpaper ? { backgroundImage: `url(${data.wallpaper})`, backgroundSize: "cover" } : undefined
      }
    >
      {/* 桌面顶栏 */}
      <div className="flex items-center justify-between bg-black/25 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
        <div className="font-medium">Finder</div>
        <div className="flex gap-3">
          <span>窗口 {wins.filter((w) => !w.minimized).length}</span>
          <span>应用 {apps.length}</span>
        </div>
      </div>

      {/* 窗口层 */}
      <div className="relative h-[calc(100vh-88px)]">
        {wins.map((w) => {
          const app = apps.find((a) => a.id === w.id);
          if (!app || w.minimized) return null;
          return (
            <Window
              key={w.id}
              app={app}
              state={w}
              active={openAppId === w.id}
              onFocus={() => {
                setZTop(w.z + 1);
                setOpenAppId(w.id);
                setWins((prev) => prev.map((x) => (x.id === w.id ? { ...x, z: w.z + 1 } : x)));
              }}
              onDrag={drag}
              onResize={resize}
              onMinimize={() => minimize(w.id)}
              onMaximize={() => toggleMax(w.id)}
              onClose={() => close(w.id)}
            />
          );
        })}
      </div>

      {/* Dock */}
      <Dock
        apps={apps}
        minimizedIds={wins.filter((w) => w.minimized).map((w) => w.id)}
        openId={openAppId}
        hover={dockHover}
        onHover={setDockHover}
        onOpen={openApp}
      />
    </div>
  );
}

function Window({
  app,
  state,
  active,
  onFocus,
  onDrag,
  onResize,
  onMinimize,
  onMaximize,
  onClose,
}: {
  app: DesktopApp;
  state: WinState;
  active: boolean;
  onFocus: () => void;
  onDrag: (id: string, dx: number, dy: number) => void;
  onResize: (id: string, dw: number, dh: number) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}) {
  const dragRef = useRef<{ px: number; py: number } | null>(null);
  const resizeRef = useRef<{ px: number; py: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        onDrag(state.id, e.clientX - dragRef.current.px, e.clientY - dragRef.current.py);
        dragRef.current = { px: e.clientX, py: e.clientY };
      }
      if (resizeRef.current) {
        onResize(state.id, e.clientX - resizeRef.current.px, e.clientY - resizeRef.current.py);
        resizeRef.current = { px: e.clientX, py: e.clientY };
      }
    };
    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onDrag, onResize, state.id]);

  const style: React.CSSProperties = state.maximized
    ? { left: 12, top: 12, width: "calc(100% - 24px)", height: "calc(100% - 24px)" }
    : { left: state.x, top: state.y, width: state.w, height: state.h };

  return (
    <div
      className={`absolute flex flex-col overflow-hidden rounded-xl border shadow-2xl backdrop-blur-xl transition-[box-shadow,opacity] ${
        active
          ? "border-white/25 bg-white/12 shadow-black/50"
          : "border-white/10 bg-white/8 shadow-black/30 opacity-80"
      }`}
      style={style}
      onMouseDown={onFocus}
    >
      {/* 标题栏 */}
      <div
        className="flex shrink-0 items-center gap-2 bg-black/25 px-3 py-2 backdrop-blur"
        onMouseDown={(e) => {
          if (state.maximized) return;
          dragRef.current = { px: e.clientX, py: e.clientY };
          onFocus();
        }}
      >
        <button
          className="h-3 w-3 rounded-full bg-[#ff5f57]"
          title="关闭"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        />
        <button
          className="h-3 w-3 rounded-full bg-[#febc2e]"
          title="最小化"
          onClick={(e) => {
            e.stopPropagation();
            onMinimize();
          }}
        />
        <button
          className="h-3 w-3 rounded-full bg-[#28c840]"
          title="最大化"
          onClick={(e) => {
            e.stopPropagation();
            onMaximize();
          }}
        />
        <span className="ml-2 truncate text-xs text-white/85">
          {app.icon} {app.name}
        </span>
      </div>

      {/* 内容 */}
      <div className="min-h-0 flex-1 overflow-auto p-4 text-sm text-white/90">
        <WindowBody app={app} />
      </div>

      {/* 右下角缩放手柄 */}
      {!state.maximized ? (
        <div
          className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
          onMouseDown={(e) => {
            e.stopPropagation();
            resizeRef.current = { px: e.clientX, py: e.clientY };
          }}
        />
      ) : null}
    </div>
  );
}

function WindowBody({ app }: { app: DesktopApp }) {
  if (app.kind === "text") {
    return <div className="whitespace-pre-wrap text-white/80">{app.text ?? ""}</div>;
  }
  if (app.kind === "grid") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {(app.groups ?? []).map((g) => (
          <div key={g.id}>
            <div className="mb-1.5 text-xs text-white/60">
              {g.icon} {g.name}
            </div>
            <ul className="space-y-1">
              {g.items.map((it) => (
                <li key={it.id}>
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded px-2 py-1 text-white/85 transition hover:bg-white/10"
                  >
                    {it.title}
                  </a>
                </li>
              ))}
              {g.items.length === 0 ? (
                <li className="text-xs text-white/40">空</li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {(app.items ?? []).map((it) => (
        <li key={it.id}>
          <a
            href={it.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg bg-white/8 px-3 py-2 transition hover:bg-white/15"
          >
            <span className="truncate">{it.title}</span>
          </a>
        </li>
      ))}
      {(app.items ?? []).length === 0 ? <li className="text-xs text-white/40">空</li> : null}
    </ul>
  );
}

/**
 * Dock：纯 CSS transform 放大动画。
 * 用鼠标在 dock 上的 x 坐标计算每个图标的缩放比例（距离越近越大）。
 */
function Dock({
  apps,
  minimizedIds,
  openId,
  hover,
  onHover,
  onOpen,
}: {
  apps: DesktopApp[];
  minimizedIds: string[];
  openId: string | null;
  hover: { x: number; w: number } | null;
  onHover: (v: { x: number; w: number } | null) => void;
  onOpen: (id: string) => void;
}) {
  const dockRef = useRef<HTMLDivElement | null>(null);

  const handleMove = (e: React.MouseEvent) => {
    const rect = dockRef.current?.getBoundingClientRect();
    if (!rect) return;
    onHover({ x: e.clientX - rect.left, w: rect.width });
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3">
      <div
        ref={dockRef}
        className="pointer-events-auto flex items-end gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-xl"
        onMouseMove={handleMove}
        onMouseLeave={() => onHover(null)}
      >
        {apps.map((app, i) => {
          const scale = dockScale(i, apps.length, hover);
          const running = openId === app.id || minimizedIds.includes(app.id);
          return (
            <button
              key={app.id}
              title={app.name}
              onClick={() => onOpen(app.id)}
              className="group relative flex flex-col items-center"
              style={{ transform: `scale(${scale})`, transformOrigin: "bottom center" }}
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl transition ${
                  running ? "bg-white/25" : "bg-white/12"
                } group-hover:bg-white/30`}
              >
                {app.icon || "◻"}
              </span>
              {running ? (
                <span className="absolute -bottom-1 h-1 w-1 rounded-full bg-white/80" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 根据 dock 宽度与鼠标位置计算第 i 个图标的缩放。 */
function dockScale(i: number, count: number, hover: { x: number; w: number } | null): number {
  if (!hover) return 1;
  const itemW = hover.w / Math.max(1, count);
  const center = itemW * (i + 0.5);
  const dist = Math.abs(hover.x - center);
  const influence = itemW * 2.2;
  if (dist >= influence) return 1;
  const t = 1 - dist / influence;
  return 1 + t * 0.55;
}
