"use client";

import type { ConsoleData } from "./types";

/**
 * 控制台模板：深色高密度运维控制台。
 * 左侧固定导航 + 右侧多面板。纯 CSS/React state，不引库。
 * 外部 API 不可用时，面板显示占位并由调用方在 degraded 中说明。
 */
export default function ConsoleTemplate({ data }: { data: ConsoleData }) {
  return (
    <div className="min-h-screen bg-[#0b0e14] text-[#d6deeb]">
      <div className="flex">
        {/* 左侧固定导航 */}
        <aside className="sticky top-0 h-screen w-56 shrink-0 border-r border-[#1c2333] bg-[#0d1117] p-3">
          <div className="mb-4 px-2">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#4d5b76]">BestNav</div>
            <div className="font-mono text-sm font-bold text-[#7ee787]">console</div>
          </div>
          <nav className="space-y-0.5 font-mono text-xs">
            <SideLink href="#containers" label="containers" />
            <SideLink href="#host" label="host" />
            <SideLink href="#certs" label="certificates" />
            <SideLink href="#visitors" label="visitors" />
            <SideLink href="#logs" label="logs" />
          </nav>
          <div className="mt-6 border-t border-[#1c2333] pt-3">
            <div className="px-2 text-[10px] uppercase tracking-widest text-[#4d5b76]">Bookmarks</div>
            <ul className="mt-1 space-y-0.5">
              {data.groups.map((g) => (
                <li key={g.id}>
                  <a
                    href={g.items[0]?.url ?? "#"}
                    className="block truncate rounded px-2 py-1 font-mono text-xs text-[#8b98b0] transition hover:bg-[#161d2b] hover:text-[#d6deeb]"
                    title={g.name}
                  >
                    {g.icon ? `${g.icon} ` : ""}
                    {g.name}
                  </a>
                </li>
              ))}
              {data.groups.length === 0 ? (
                <li className="px-2 py-1 font-mono text-xs text-[#4d5b76]">no groups</li>
              ) : null}
            </ul>
          </div>
        </aside>

        {/* 右侧多面板 */}
        <main className="min-w-0 flex-1 p-4">
          <header className="mb-4 flex items-center justify-between border-b border-[#1c2333] pb-2">
            <h1 className="font-mono text-sm text-[#d6deeb]">~/bestnav/console</h1>
            <div className="font-mono text-[11px] text-[#4d5b76]">
              {data.degraded.length ? `degraded: ${data.degraded.join(", ")}` : "all sources ok"}
            </div>
          </header>

          <div className="grid gap-3 xl:grid-cols-2">
            <Panel id="containers" title="CONTAINERS" accent="#7ee787">
              {data.containers.length === 0 ? (
                <Empty text="无容器数据（docker 未配置或 API 不可用）" />
              ) : (
                <table className="w-full font-mono text-xs">
                  <tbody>
                    {data.containers.map((c) => (
                      <tr key={c.name} className="border-b border-[#161d2b] last:border-0">
                        <td className="py-1 pr-2 text-[#d6deeb]">{c.name}</td>
                        <td className="py-1 pr-2 text-[#4d5b76]">{c.image ?? ""}</td>
                        <td className="py-1">
                          <Status value={c.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel id="host" title="HOST METRICS" accent="#79c0ff">
              <div className="space-y-2 font-mono text-xs">
                <Meter label="cpu" value={data.host.cpu} unit="%" />
                <Meter label="mem" value={data.host.mem} unit="%" />
                <Meter label="disk" value={data.host.disk} unit="%" />
                {data.host.load ? <Row k="load" v={data.host.load} /> : null}
                {data.host.uptime ? <Row k="uptime" v={data.host.uptime} /> : null}
              </div>
            </Panel>

            <Panel id="certs" title="CERT EXPIRY" accent="#ffa657">
              {data.certs.length === 0 ? (
                <Empty text="暂无证书记录" />
              ) : (
                <ul className="space-y-1 font-mono text-xs">
                  {data.certs.map((c) => (
                    <li key={c.domain} className="flex items-center justify-between">
                      <span className="truncate text-[#d6deeb]">{c.domain}</span>
                      <span
                        className={
                          (c.daysLeft ?? 999) < 15
                            ? "text-[#ff7b72]"
                            : (c.daysLeft ?? 999) < 30
                              ? "text-[#ffa657]"
                              : "text-[#7ee787]"
                        }
                      >
                        {c.daysLeft === null ? "unknown" : `${c.daysLeft}d`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel id="visitors" title="VISITORS TODAY" accent="#d2a8ff">
              <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                <Metric label="PV" value={data.visitors.todayPv} />
                <Metric label="UV" value={data.visitors.todayUv} />
                <Metric label="TOTAL UV" value={data.visitors.totalUv} />
              </div>
            </Panel>

            <Panel id="logs" title="RECENT LOGS" accent="#79c0ff" full>
              {data.logs.length === 0 ? (
                <Empty text="暂无日志" />
              ) : (
                <ul className="space-y-0.5 font-mono text-xs">
                  {data.logs.map((l, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 text-[#4d5b76]">{l.ts}</span>
                      <span
                        className={
                          l.level === "error"
                            ? "text-[#ff7b72]"
                            : l.level === "warn"
                              ? "text-[#ffa657]"
                              : "text-[#7ee787]"
                        }
                      >
                        {l.level.toUpperCase().padEnd(5)}
                      </span>
                      <span className="truncate text-[#8b98b0]">{l.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel id="links" title="LINKS" accent="#d2a8ff" full>
              {data.groups.length === 0 ? (
                <Empty text="暂无书签分组" />
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  {data.groups.map((g) => (
                    <div key={g.id}>
                      <div className="mb-1 font-mono text-[11px] text-[#4d5b76]">
                        {g.icon ? `${g.icon} ` : ""}
                        {g.name}
                      </div>
                      <ul className="space-y-0.5">
                        {g.items.map((it) => (
                          <li key={it.id}>
                            <a
                              href={it.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs text-[#8b98b0] transition hover:text-[#79c0ff]"
                            >
                              → {it.title}
                            </a>
                          </li>
                        ))}
                        {g.items.length === 0 ? (
                          <li className="font-mono text-[11px] text-[#3b4757]">empty</li>
                        ) : null}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </main>
      </div>
    </div>
  );
}

function SideLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="block rounded px-2 py-1 text-[#8b98b0] transition hover:bg-[#161d2b] hover:text-[#79c0ff]"
    >
      <span className="text-[#4d5b76]">$</span> {label}
    </a>
  );
}

function Panel({
  id,
  title,
  accent,
  full,
  children,
}: {
  id: string;
  title: string;
  accent: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`rounded-lg border border-[#1c2333] bg-[#0d1117] ${full ? "xl:col-span-2" : ""}`}
    >
      <div className="flex items-center gap-2 border-b border-[#161d2b] px-3 py-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: accent }} />
        <h2 className="font-mono text-[11px] tracking-widest text-[#8b98b0]">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="font-mono text-xs text-[#3b4757]">{text}</p>;
}

function Status({ value }: { value: string }) {
  const ok = /^(running|up|healthy|ok)$/i.test(value);
  const bad = /^(exited|down|unhealthy|error)$/i.test(value);
  const color = ok ? "#7ee787" : bad ? "#ff7b72" : "#8b98b0";
  return (
    <span style={{ color }}>
      ● {value || "unknown"}
    </span>
  );
}

function Meter({ label, value, unit }: { label: string; value: number; unit: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 90 ? "#ff7b72" : pct >= 70 ? "#ffa657" : "#7ee787";
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="text-[#8b98b0]">{label}</span>
        <span style={{ color }}>
          {value}
          {unit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#161d2b]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#8b98b0]">{k}</span>
      <span className="text-[#d6deeb]">{v}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-[#1c2333] px-2 py-1.5">
      <div className="text-[10px] text-[#4d5b76]">{label}</div>
      <div className="text-base text-[#d6deeb]">{value}</div>
    </div>
  );
}
