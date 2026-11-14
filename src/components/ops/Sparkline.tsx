"use client";

import { useMemo } from "react";

export type SparkPoint = { t: number; v: number };

export function Sparkline({
  points,
  width = 220,
  height = 48,
  color = "rgb(var(--c-primary))",
  fill = true,
  label,
}: {
  points: SparkPoint[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  label?: string;
}) {
  const { path, area, min, max } = useMemo(() => {
    if (!points.length) return { path: "", area: "", min: 0, max: 0 };
    const values = points.map((p) => p.v);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = hi - lo || 1;
    const stepX = points.length > 1 ? width / (points.length - 1) : width;
    const pad = 4;
    const usable = height - pad * 2;
    const coords = points.map((p, i) => {
      const x = i * stepX;
      const y = pad + usable - ((p.v - lo) / span) * usable;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const d = `M${coords.join(" L")}`;
    const a = `${d} L${width},${height} L0,${height} Z`;
    return { path: d, area: a, min: lo, max: hi };
  }, [points, width, height]);

  if (!points.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted"
        style={{ width, height }}
      >
        暂无数据
      </div>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? "趋势图"}
      className="overflow-visible"
    >
      {fill ? <path d={area} fill={color} opacity={0.12} /> : null}
      <path d={path} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <title>{`${label ?? "趋势"}：${min.toFixed(1)} ~ ${max.toFixed(1)}`}</title>
    </svg>
  );
}

export function SparklinePair({
  series,
  width = 320,
  height = 64,
}: {
  series: { down: number[]; up: number[] };
  width?: number;
  height?: number;
}) {
  const n = Math.max(series.down.length, series.up.length);
  const down: SparkPoint[] = series.down.map((v, i) => ({ t: i, v }));
  const up: SparkPoint[] = series.up.map((v, i) => ({ t: i, v }));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" /> 下行
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" /> 上行
        </span>
      </div>
      <Sparkline points={down} width={width} height={height} color="rgb(var(--c-accent))" label="下行速率" />
      <Sparkline points={up} width={width} height={height} color="rgb(var(--c-primary))" label="上行速率" />
      <span className="sr-only">{n} 个采样点</span>
    </div>
  );
}
