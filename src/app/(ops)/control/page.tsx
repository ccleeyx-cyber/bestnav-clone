"use client";

import { useCallback, useEffect, useState } from "react";
import OpsShell from "@/components/ops/OpsShell";
import { apiGet, apiSend } from "@/components/ops/usePolling";

type SwitchDef = {
  id: string;
  title: string;
  kind: string;
  impact: "有感" | "无感";
  idempotent: boolean;
  description: string;
  params: { name: string; type: string; required: boolean; desc: string }[];
};

export default function ControlPage() {
  const [switches, setSwitches] = useState<SwitchDef[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const [params, setParams] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ switches: SwitchDef[] }>("/api/control");
      setSwitches(d.switches);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    // auto refresh every 30s
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  const invoke = async (sw: SwitchDef, dryRun: boolean) => {
    setBusy(`${sw.id}:${dryRun ? "dry" : "exec"}`);
    try {
      const p = params[sw.id] ?? {};
      const parsed: Record<string, unknown> = {};
      for (const def of sw.params) {
        const v = p[def.name];
        if (v === undefined || v === "") {
          if (def.required) throw new Error(`缺少参数：${def.name}`);
          continue;
        }
        if (def.type === "string[]") parsed[def.name] = v.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
        else if (def.type === "number") parsed[def.name] = Number(v);
        else if (def.type === "boolean") parsed[def.name] = v === "true" || v === "1";
        else parsed[def.name] = v;
      }
      const r = await apiSend<{ ok: boolean; message: string }>("/api/control", "POST", {
        switchId: sw.id,
        dryRun,
        params: parsed,
      });
      setResult((prev) => ({
        ...prev,
        [sw.id]: `${dryRun ? "预演" : "执行"}：${r.message}${r.ok ? "" : "（未完全成功）"}`,
      }));
    } catch (e) {
      setResult((prev) => ({ ...prev, [sw.id]: `失败：${(e as Error).message}` }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <OpsShell
      title="控制室"
      description="开关墙 · 支持预演与执行，执行与预演分开记账"
      actions={
        <button className="btn" onClick={() => void load()}>
          刷新
        </button>
      }
    >
      {err ? <div className="card mb-4 border-err/40 p-4 text-sm text-err">{err}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {switches.map((sw) => (
          <div key={sw.id} className="card flex flex-col gap-3 p-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{sw.title}</h2>
                <span
                  className={`chip ${sw.impact === "有感" ? "text-warn" : "text-ok"}`}
                  title={sw.impact === "有感" ? "该操作会产生可感知影响" : "该操作无感知影响"}
                >
                  {sw.impact}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{sw.description}</p>
              <div className="mt-1.5 text-[11px] text-muted">
                {sw.idempotent ? "幂等" : "非幂等"} · {sw.kind}
              </div>
            </div>

            {sw.params.map((p) => (
              <div key={p.name}>
                <label className="mb-1 block text-xs text-muted">
                  {p.name}
                  {p.required ? " *" : ""} — {p.desc}
                </label>
                <input
                  className="input"
                  placeholder={p.type === "string[]" ? "id1, id2" : p.name}
                  value={params[sw.id]?.[p.name] ?? ""}
                  onChange={(e) =>
                    setParams((prev) => ({
                      ...prev,
                      [sw.id]: { ...(prev[sw.id] ?? {}), [p.name]: e.target.value },
                    }))
                  }
                />
              </div>
            ))}

            <div className="mt-auto flex gap-2">
              <button
                className="btn flex-1"
                disabled={busy !== null}
                onClick={() => void invoke(sw, true)}
              >
                预演
              </button>
              <button
                className="btn btn-primary flex-1"
                disabled={busy !== null}
                onClick={() => void invoke(sw, false)}
              >
                执行
              </button>
            </div>

            {result[sw.id] ? (
              <p className="rounded-lg bg-bg px-3 py-2 text-xs leading-5 text-muted">{result[sw.id]}</p>
            ) : null}
          </div>
        ))}
      </div>
    </OpsShell>
  );
}
