"use client";

import { useEffect, useState } from "react";
import { api } from "./client";

interface UserRow {
  id: string;
  username: string;
  role: "owner" | "admin" | "member";
  display_name: string;
  enabled: number;
  created_at: string;
  permissions: string[];
}

interface MatrixRow {
  role: string;
  permissions: string[];
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export default function UsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [myId, setMyId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await api<{ users: UserRow[]; matrix: MatrixRow[]; myId: string }>(
      "/api/users",
    );
    if (!res.ok) {
      setError(res.error ?? "加载失败");
    } else if (res.data) {
      setUsers(res.data.users);
      setMatrix(res.data.matrix);
      setMyId(res.data.myId);
      setError("");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">共 {users.length} 个账号</p>
        <button className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "收起" : "新建用户"}
        </button>
      </div>

      {error ? <div className="card p-3 text-sm text-err">{error}</div> : null}

      {showCreate ? <CreateUser onDone={() => { setShowCreate(false); void load(); }} /> : null}

      {loading ? (
        <div className="card p-6 text-sm text-muted">加载中…</div>
      ) : users.length === 0 ? (
        <div className="card p-6 text-sm text-muted">暂无用户</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-medium">用户名</th>
                <th className="px-3 py-2 font-medium">显示名</th>
                <th className="px-3 py-2 font-medium">角色</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">创建时间</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isSelf={u.id === myId}
                  onChanged={load}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {matrix.length ? (
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">权限矩阵</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {matrix.map((m) => (
              <div key={m.role} className="rounded-lg border border-border p-3">
                <div className="mb-2 text-sm font-medium">{ROLE_LABEL[m.role] ?? m.role}</div>
                <ul className="space-y-1 text-xs text-muted">
                  {m.permissions.length === 0 ? (
                    <li>无</li>
                  ) : (
                    m.permissions.map((p) => <li key={p}>{p}</li>)
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CreateUser({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"owner" | "admin" | "member">("member");
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setMsg("");
    const res = await api("/api/users", {
      method: "POST",
      json: { username, password, role, display_name: displayName },
    });
    if (!res.ok) {
      setMsg(res.error ?? "创建失败");
      return;
    }
    onDone();
  };

  return (
    <div className="card space-y-3 p-4">
      <div className="grid gap-3 md:grid-cols-4">
        <input
          className="input"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="input"
          placeholder="显示名"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="密码（至少 6 位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select
          className="input"
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
          <option value="owner">owner</option>
        </select>
      </div>
      {msg ? <div className="text-sm text-err">{msg}</div> : null}
      <button className="btn btn-primary" onClick={submit}>
        创建
      </button>
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  onChanged,
}: {
  user: UserRow;
  isSelf: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [role, setRole] = useState(user.role);
  const [enabled, setEnabled] = useState(user.enabled === 1);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setRole(user.role);
    setEnabled(user.enabled === 1);
  }, [user.role, user.enabled]);

  const patch = async (extra: Record<string, unknown>) => {
    setMsg("");
    const res = await api("/api/users", {
      method: "PATCH",
      json: { id: user.id, ...extra },
    });
    if (!res.ok) {
      setMsg(res.error ?? "更新失败");
      return;
    }
    await onChanged();
  };

  const remove = async () => {
    setMsg("");
    const res = await api(`/api/users?id=${encodeURIComponent(user.id)}`, { method: "DELETE" });
    if (!res.ok) {
      setMsg(res.error ?? "删除失败");
      return;
    }
    await onChanged();
  };

  const locked = user.role === "owner";

  return (
    <tr className="border-b border-border last:border-0 align-middle">
      <td className="px-3 py-2">
        {user.username}
        {isSelf ? <span className="ml-2 chip">我</span> : null}
      </td>
      <td className="px-3 py-2 text-muted">{user.display_name || "—"}</td>
      <td className="px-3 py-2">
        {locked ? (
          <span className="chip">owner</span>
        ) : (
          <select
            className="input w-28"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as typeof role);
              void patch({ role: e.target.value });
            }}
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
            <option value="owner">owner</option>
          </select>
        )}
      </td>
      <td className="px-3 py-2">
        <button
          className="btn"
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            void patch({ enabled: next });
          }}
          disabled={locked}
        >
          {enabled ? "启用" : "禁用"}
        </button>
      </td>
      <td className="px-3 py-2 text-muted">{user.created_at.slice(0, 19).replace("T", " ")}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            className="input w-32"
            type="password"
            placeholder="重置密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            className="btn"
            onClick={() => {
              if (!password) return;
              void patch({ password }).then(() => setPassword(""));
            }}
          >
            保存
          </button>
          {!locked ? (
            <button className="btn text-err" onClick={remove}>
              删除
            </button>
          ) : (
            <span className="text-xs text-muted">不可删除</span>
          )}
        </div>
        {msg ? <div className="mt-1 text-xs text-err">{msg}</div> : null}
      </td>
    </tr>
  );
}
