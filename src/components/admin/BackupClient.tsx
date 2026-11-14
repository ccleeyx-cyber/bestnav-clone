"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./client";

interface BackupRow {
  id: string;
  kind: string;
  path: string;
  size: number;
  created_at: string;
}

interface BackupInfo {
  backups: BackupRow[];
  intervalHours: number | null;
  intervalOptions: number[];
  webdav: { url: string; user: string; configured: boolean } | null;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function BackupClient() {
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const [url, setUrl] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api<BackupInfo>("/api/backup");
    if (!res.ok) setError(res.error ?? "加载失败");
    else if (res.data) {
      setInfo(res.data);
      setUrl(res.data.webdav?.url ?? "");
      setUser(res.data.webdav?.user ?? "");
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (json: Record<string, unknown>, okMsg: string) => {
    setError("");
    setNotice("");
    const res = await api<Record<string, unknown>>("/api/backup", { method: "POST", json });
    if (!res.ok) {
      setError(res.error ?? "操作失败");
      return false;
    }
    setNotice(okMsg);
    await load();
    return true;
  };

  const manualBackup = async () => {
    setError("");
    setNotice("");
    const res = await api<{ backup: BackupRow; webdav: { uploaded: boolean; message: string } | null }>(
      "/api/backup",
      { method: "POST", json: { action: "backup" } },
    );
    if (!res.ok) {
      setError(res.error ?? "备份失败");
      return;
    }
    const extra = res.data?.webdav ? `；${res.data.webdav.message}` : "";
    setNotice(`备份完成：${res.data?.backup.path ?? ""} (${fmtSize(res.data?.backup.size ?? 0)})${extra}`);
    await load();
  };

  const restore = async (row: BackupRow) => {
    if (!confirm(`确认从 ${row.path} 恢复？当前数据将被覆盖。`)) return;
    setError("");
    setNotice("");
    const res = await api<{ restored: { table: string; rows: number }[] }>("/api/backup/restore", {
      method: "POST",
      json: { fileId: row.id },
    });
    if (!res.ok) {
      setError(res.error ?? "恢复失败");
      return;
    }
    setNotice(
      `恢复完成：${(res.data?.restored ?? []).map((r) => `${r.table}(${r.rows})`).join(", ")}`,
    );
  };

  const testWebdav = async () => {
    setError("");
    setNotice("");
    const res = await api<{ message: string }>("/api/backup", {
      method: "POST",
      json: { action: "test-webdav" },
    });
    if (!res.ok) {
      setError(res.error ?? "连接测试失败");
      return;
    }
    setNotice(`连接测试：${res.data?.message ?? "正常"}`);
  };

  return (
    <div className="space-y-5">
      {error ? <div className="card p-3 text-sm text-err">{error}</div> : null}
      {notice ? <div className="card p-3 text-sm text-ok">{notice}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-semibold">手动备份</h2>
          <p className="text-xs text-muted">
            导出 users / bookmarks / groups / cards / settings / notes / calendar_events /
            search_sources / navpacks / relays / api_keys / monitors / notifications 为 zip，
            落盘到 data/backups/。
          </p>
          <button className="btn btn-primary" onClick={manualBackup} disabled={loading}>
            立即备份
          </button>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-semibold">定时自动备份</h2>
          <p className="text-xs text-muted">
            模块级单例定时器（不随请求重复创建）。当前：
            {info?.intervalHours ? `每 ${info.intervalHours} 小时` : "未开启"}
          </p>
          <div className="flex flex-wrap gap-2">
            {(info?.intervalOptions ?? [6, 12, 24, 72, 168]).map((h) => (
              <button
                key={h}
                className={info?.intervalHours === h ? "btn btn-primary" : "btn"}
                onClick={() => void act({ action: "interval", hours: h }, `已设为每 ${h} 小时自动备份`)}
              >
                {h}h
              </button>
            ))}
            <button
              className="btn"
              onClick={() => void act({ action: "interval", hours: 0 }, "已关闭自动备份")}
            >
              关闭
            </button>
          </div>
        </section>
      </div>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">WebDAV 异地备份</h2>
        <p className="text-xs text-muted">
          密码使用 scrypt(BESTNAV_SECRET) 派生密钥 + AES-256-GCM 加密落盘，接口永不返回明文。
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            className="input"
            placeholder="WebDAV 地址，如 https://dav.example.com/bestnav/"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <input
            className="input"
            placeholder="用户名（可空）"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="密码（可空）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            onClick={() => void act({ action: "webdav", url, user, password }, "WebDAV 配置已保存")}
          >
            保存配置
          </button>
          <button className="btn" onClick={testWebdav}>
            测试连接（PROPFIND）
          </button>
        </div>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-medium">时间</th>
              <th className="px-3 py-2 font-medium">类型</th>
              <th className="px-3 py-2 font-medium">路径</th>
              <th className="px-3 py-2 font-medium">大小</th>
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-muted" colSpan={5}>
                  加载中…
                </td>
              </tr>
            ) : !info || info.backups.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted" colSpan={5}>
                  还没有备份记录
                </td>
              </tr>
            ) : (
              info.backups.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-muted">
                    {b.created_at.slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="px-3 py-2">
                    <span className="chip">{b.kind}</span>
                  </td>
                  <td className="max-w-[320px] truncate px-3 py-2">{b.path}</td>
                  <td className="px-3 py-2 text-muted">{fmtSize(b.size)}</td>
                  <td className="px-3 py-2">
                    <button className="btn" onClick={() => void restore(b)}>
                      恢复
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
