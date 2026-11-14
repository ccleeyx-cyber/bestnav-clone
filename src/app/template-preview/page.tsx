import Link from "next/link";
import { rows } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { visibleWhere } from "@/lib/visibility";
import type { Bookmark, Group } from "@/lib/types";
import MagazineTemplate from "@/components/templates/magazine/MagazineTemplate";
import type { MagazineData } from "@/components/templates/magazine/types";
import ConsoleTemplate from "@/components/templates/console/ConsoleTemplate";
import type { ConsoleData } from "@/components/templates/console/types";
import DesktopTemplate from "@/components/templates/desktop/DesktopTemplate";
import type { DesktopData } from "@/components/templates/desktop/types";
import { summarize } from "@/lib/visitors";

export const dynamic = "force-dynamic";

const TEMPLATES = ["magazine", "console", "desktop"] as const;
type TemplateId = (typeof TEMPLATES)[number];

export default async function TemplatePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const sp = await searchParams;
  const requested = (sp.template ?? "magazine") as TemplateId;
  const template: TemplateId = TEMPLATES.includes(requested) ? requested : "magazine";

  const me = await currentUser();
  const data = await loadTemplateData(template, me);

  return (
    <div className="min-h-screen">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <span className="text-xs text-muted">模板预览</span>
        {TEMPLATES.map((t) => (
          <Link
            key={t}
            href={`/template-preview?template=${t}`}
            className={t === template ? "btn btn-primary" : "btn"}
          >
            {t}
          </Link>
        ))}
        <Link href="/" className="btn ml-auto">
          返回首页
        </Link>
      </div>

      {template === "magazine" ? <MagazineTemplate data={data.magazine} /> : null}
      {template === "console" ? <ConsoleTemplate data={data.console} /> : null}
      {template === "desktop" ? <DesktopTemplate data={data.desktop} /> : null}
    </div>
  );
}

interface LoadedData {
  magazine: MagazineData;
  console: ConsoleData;
  desktop: DesktopData;
}

async function loadTemplateData(template: TemplateId, me: Awaited<ReturnType<typeof currentUser>>) {
  const vb = visibleWhere(me, "bookmarks");
  const vg = visibleWhere(me, "groups");

  const groups = rows<Group>(
    `SELECT * FROM groups g WHERE ${vg.sql} ORDER BY g.sort_order ASC`,
    ...vg.params,
  );
  const bookmarks = rows<Bookmark>(
    `SELECT * FROM bookmarks b WHERE ${vb.sql} AND b.enabled = 1 ORDER BY b.sort_order ASC`,
    ...vb.params,
  );

  const byGroup = new Map<string, Bookmark[]>();
  for (const b of bookmarks) {
    if (!b.group_id) continue;
    const arr = byGroup.get(b.group_id) ?? [];
    arr.push(b);
    byGroup.set(b.group_id, arr);
  }

  const magazine: MagazineData = {
    headline: {
      title: "BestNav 日报",
      summary:
        "把所有公开书签按分组铺成杂志分栏；把任意一条链接设为头条即可占据顶部大图位。",
      tag: "头条",
      link: bookmarks[0]?.url,
    },
    columns: groups.slice(0, 6).map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      bookmarks: byGroup.get(g.id) ?? [],
    })),
    sidebar: bookmarks.filter((b) => !b.group_id).slice(0, 12),
    updatedAt: new Date().toLocaleString(),
  };

  const consoleData = buildConsoleData(groups, byGroup, bookmarks);
  const desktopData = buildDesktopData(groups, byGroup, bookmarks);

  return { magazine, console: consoleData, desktop: desktopData };
}

function buildConsoleData(
  groups: Group[],
  byGroup: Map<string, Bookmark[]>,
  bookmarks: Bookmark[],
): ConsoleData {
  const degraded: string[] = [];

  // 容器 / 主机 / 证书 / 日志来自 monitoring 队友的 API 与表；不可用时留空并说明。
  const containers: { name: string; status: string; image?: string }[] = [];
  const certs: { domain: string; daysLeft: number | null; issuer?: string }[] = [];
  let host = { cpu: 0, mem: 0, disk: 0 };
  const logs: { ts: string; level: string; message: string }[] = [];

  try {
    const certRows = rows<{ domain: string; days_left: number | null; issuer: string }>(
      "SELECT domain, days_left, issuer FROM ssl_certs WHERE not_after IS NOT NULL ORDER BY days_left ASC LIMIT 20",
    );
    for (const c of certRows) {
      certs.push({ domain: c.domain, daysLeft: c.days_left, issuer: c.issuer });
    }
  } catch {
    degraded.push("ssl");
  }

  try {
    const logRows = rows<{ created_at: string; action: string; target: string }>(
      "SELECT created_at, action, target FROM audit_logs ORDER BY created_at DESC LIMIT 20",
    );
    for (const l of logRows) {
      logs.push({
        ts: l.created_at.slice(11, 19),
        level: /fail|error|delete/i.test(l.action) ? "error" : "info",
        message: `${l.action} ${l.target}`.trim(),
      });
    }
  } catch {
    degraded.push("audit");
  }

  let visitors = { todayPv: 0, todayUv: 0, totalUv: 0 };
  try {
    const s = summarize("today", 1);
    visitors = { todayPv: s.todayPv, todayUv: s.todayUv, totalUv: s.totalUv };
  } catch {
    degraded.push("visitors");
  }

  if (!containers.length) degraded.push("docker");
  if (!host.cpu && !host.mem && !host.disk) degraded.push("host");

  return {
    containers,
    host,
    certs,
    visitors,
    logs,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      items: (byGroup.get(g.id) ?? []).map((b) => ({
        id: b.id,
        title: b.title,
        url: b.url,
      })),
    })),
    degraded,
  };
}

function buildDesktopData(
  groups: Group[],
  byGroup: Map<string, Bookmark[]>,
  bookmarks: Bookmark[],
): DesktopData {
  const apps: DesktopData["apps"] = groups.slice(0, 6).map((g) => ({
    id: `group-${g.id}`,
    name: g.name,
    icon: g.icon || "◻",
    kind: "grid",
    groups: [
      {
        id: g.id,
        name: g.name,
        icon: g.icon,
        items: (byGroup.get(g.id) ?? []).map((b) => ({
          id: b.id,
          title: b.title,
          url: b.url,
        })),
      },
    ],
  }));

  const loose = bookmarks.filter((b) => !b.group_id);
  if (loose.length) {
    apps.unshift({
      id: "all-links",
      name: "全部链接",
      icon: "◎",
      kind: "links",
      items: loose.map((b) => ({ id: b.id, title: b.title, url: b.url })),
    });
  }

  return { apps };
}
