"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "./client";

interface EventRow {
  id: string;
  title: string;
  date: string;
  all_day: number;
  time_start: string | null;
  time_end: string | null;
  source: "manual" | "ssl" | "backup";
  ref_id: string | null;
}

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function CalendarClient() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", date: "", all_day: true, time_start: "", time_end: "" });

  const load = async () => {
    setLoading(true);
    const res = await api<{ events: EventRow[] }>("/api/calendar");
    if (!res.ok) setError(res.error ?? "加载失败");
    else if (res.data) {
      setEvents(res.data.events);
      setError("");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const byDate = useMemo(() => {
    const m = new Map<string, EventRow[]>();
    for (const e of events) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    return m;
  }, [events]);

  /** 当月网格（含前后补齐的相邻月日期）。 */
  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // 周一开头
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    const cells: { date: string; inMonth: boolean; day: number }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push({
        date: ymd(d),
        inMonth: d.getMonth() === cursor.getMonth(),
        day: d.getDate(),
      });
    }
    return cells;
  }, [cursor]);

  const create = async () => {
    setError("");
    setMsg("");
    if (!form.title.trim()) {
      setError("标题不能为空");
      return;
    }
    if (!form.date) {
      setError("请选择日期");
      return;
    }
    const res = await api("/api/calendar", {
      method: "POST",
      json: {
        title: form.title.trim(),
        date: form.date,
        all_day: form.all_day,
        time_start: form.all_day ? null : form.time_start || null,
        time_end: form.all_day ? null : form.time_end || null,
      },
    });
    if (!res.ok) {
      setError(res.error ?? "创建失败");
      return;
    }
    setForm({ title: "", date: "", all_day: true, time_start: "", time_end: "" });
    setMsg("事件已创建");
    void load();
  };

  const remove = async (e: EventRow) => {
    setError("");
    setMsg("");
    const res = await api(`/api/calendar?id=${encodeURIComponent(e.id)}`, { method: "DELETE" });
    if (!res.ok) {
      setError(res.error ?? "删除失败");
      return;
    }
    setMsg("事件已删除");
    void load();
  };

  const shift = (delta: number) => {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };

  return (
    <div className="space-y-5">
      {error ? <div className="card p-3 text-sm text-err">{error}</div> : null}
      {msg ? <div className="card p-3 text-sm text-ok">{msg}</div> : null}

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">新建事件</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <input
            className="input"
            placeholder="标题"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            className="input"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.all_day}
              onChange={(e) => setForm({ ...form, all_day: e.target.checked })}
            />
            全天
          </label>
          <input
            className="input"
            type="time"
            disabled={form.all_day}
            value={form.time_start}
            onChange={(e) => setForm({ ...form, time_start: e.target.value })}
          />
          <input
            className="input"
            type="time"
            disabled={form.all_day}
            value={form.time_end}
            onChange={(e) => setForm({ ...form, time_end: e.target.value })}
          />
        </div>
        <button className="btn btn-primary" onClick={create}>
          添加
        </button>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月
          </h2>
          <div className="flex gap-2">
            <button className="btn" onClick={() => shift(-1)}>
              上月
            </button>
            <button
              className="btn"
              onClick={() => {
                const d = new Date();
                setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
              }}
            >
              今天
            </button>
            <button className="btn" onClick={() => shift(1)}>
              下月
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
          {WEEKDAYS.map((w) => (
            <div key={w} className="bg-surface px-2 py-1.5 text-center text-xs text-muted">
              {w}
            </div>
          ))}
          {grid.map((cell) => {
            const list = byDate.get(cell.date) ?? [];
            const today = cell.date === ymd(new Date());
            return (
              <div
                key={cell.date}
                className={
                  cell.inMonth
                    ? "min-h-[92px] bg-surface p-1.5 align-top"
                    : "min-h-[92px] bg-bg/60 p-1.5 align-top"
                }
              >
                <div
                  className={
                    today
                      ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-white"
                      : "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-muted"
                  }
                >
                  {cell.day}
                </div>
                <ul className="mt-1 space-y-1">
                  {list.map((e) => (
                    <li
                      key={e.id}
                      className={
                        e.source === "manual"
                          ? "rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
                          : e.source === "ssl"
                            ? "rounded bg-warn/15 px-1.5 py-0.5 text-[11px] text-warn"
                            : "rounded bg-ok/15 px-1.5 py-0.5 text-[11px] text-ok"
                      }
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="truncate" title={e.title}>
                          {e.title}
                        </span>
                        {e.source === "manual" ? (
                          <button
                            className="shrink-0 text-muted hover:text-err"
                            onClick={() => void remove(e)}
                            title="删除"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded bg-primary/60" /> 本地事件
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded bg-warn/60" /> SSL 证书到期（自动）
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded bg-ok/60" /> 备份记录（自动）
          </span>
        </div>
      </section>

      {loading ? (
        <div className="card p-6 text-sm text-muted">加载中…</div>
      ) : events.length === 0 ? (
        <div className="card p-6 text-sm text-muted">暂无事件</div>
      ) : (
        <section className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-medium">日期</th>
                <th className="px-3 py-2 font-medium">标题</th>
                <th className="px-3 py-2 font-medium">来源</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">{e.date}</td>
                  <td className="px-3 py-2">{e.title}</td>
                  <td className="px-3 py-2">
                    <span className="chip">{e.source}</span>
                  </td>
                  <td className="px-3 py-2">
                    {e.source === "manual" ? (
                      <button className="btn text-err" onClick={() => void remove(e)}>
                        删除
                      </button>
                    ) : (
                      <span className="text-xs text-muted">系统生成，不可删除</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
