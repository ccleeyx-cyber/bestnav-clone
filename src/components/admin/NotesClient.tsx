"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "./client";

interface Todo {
  id?: string;
  text: string;
  done: boolean;
}

interface NoteRow {
  id: string;
  title: string;
  body: string;
  folder: string;
  pinned: number;
  todo: Todo[];
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

type Filter = "all" | "pinned" | "unfiled" | "recent" | "undone";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "pinned", label: "重要" },
  { id: "unfiled", label: "未归类" },
  { id: "recent", label: "近 7 天编辑" },
  { id: "undone", label: "未完成待办" },
];

export default function NotesClient() {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [folders, setFolders] = useState<{ folder: string; n: number }[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [folderFilter, setFolderFilter] = useState("");
  const [editing, setEditing] = useState<NoteRow | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await api<{ notes: NoteRow[]; folders: { folder: string; n: number }[] }>(
      "/api/notes",
    );
    if (!res.ok) setError(res.error ?? "加载失败");
    else if (res.data) {
      setNotes(res.data.notes);
      setFolders(res.data.folders);
      setError("");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    let list = notes;
    if (folderFilter) list = list.filter((n) => n.folder === folderFilter);
    switch (filter) {
      case "pinned":
        list = list.filter((n) => n.pinned === 1);
        break;
      case "unfiled":
        list = list.filter((n) => !n.folder);
        break;
      case "recent":
        list = list.filter(
          (n) => Date.now() - new Date(n.updated_at).getTime() < 7 * 24 * 3600 * 1000,
        );
        break;
      case "undone":
        list = list.filter((n) => (n.todo ?? []).some((t) => !t.done));
        break;
      default:
        break;
    }
    return list;
  }, [notes, filter, folderFilter]);

  const remove = async (id: string) => {
    if (!confirm("确认删除这条笔记？")) return;
    const res = await api(`/api/notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      setError(res.error ?? "删除失败");
      return;
    }
    setError("");
    void load();
  };

  const togglePin = async (n: NoteRow) => {
    const res = await api("/api/notes", {
      method: "PATCH",
      json: { id: n.id, pinned: n.pinned !== 1 },
    });
    if (!res.ok) {
      setError(res.error ?? "更新失败");
      return;
    }
    setError("");
    void load();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-3">
        <div className="card p-2">
          <button
            className="btn btn-primary w-full justify-start"
            onClick={() =>
              setEditing({
                id: "",
                title: "",
                body: "",
                folder: "",
                pinned: 0,
                todo: [],
                owner_id: null,
                created_at: "",
                updated_at: "",
              })
            }
          >
            + 新建笔记
          </button>
        </div>

        <div className="card p-2">
          <div className="px-2 py-1 text-xs text-muted">分栏</div>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={
                filter === f.id
                  ? "w-full rounded-lg bg-bg px-2 py-1.5 text-left text-sm text-primary"
                  : "w-full rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-bg"
              }
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="card p-2">
          <div className="px-2 py-1 text-xs text-muted">文件夹</div>
          <button
            className={
              folderFilter === ""
                ? "w-full rounded-lg bg-bg px-2 py-1.5 text-left text-sm text-primary"
                : "w-full rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-bg"
            }
            onClick={() => setFolderFilter("")}
          >
            全部
          </button>
          {folders
            .filter((f) => f.folder)
            .map((f) => (
              <button
                key={f.folder}
                className={
                  folderFilter === f.folder
                    ? "w-full rounded-lg bg-bg px-2 py-1.5 text-left text-sm text-primary"
                    : "w-full rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-bg"
                }
                onClick={() => setFolderFilter(f.folder)}
              >
                {f.folder} <span className="text-xs text-muted">({f.n})</span>
              </button>
            ))}
        </div>
      </aside>

      <div className="space-y-4">
        {error ? <div className="card p-3 text-sm text-err">{error}</div> : null}

        {editing ? (
          <NoteEditor
            note={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              void load();
            }}
          />
        ) : null}

        {loading ? (
          <div className="card p-6 text-sm text-muted">加载中…</div>
        ) : visible.length === 0 ? (
          <div className="card p-6 text-sm text-muted">这个分栏还没有笔记</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {visible.map((n) => (
              <article key={n.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold">{n.title || "(无标题)"}</h3>
                  <div className="flex shrink-0 gap-1">
                    <button
                      className={n.pinned === 1 ? "btn text-primary" : "btn"}
                      onClick={() => void togglePin(n)}
                      title="置顶"
                    >
                      ★
                    </button>
                    <button className="btn" onClick={() => setEditing(n)}>
                      编辑
                    </button>
                    <button className="btn text-err" onClick={() => void remove(n.id)}>
                      删除
                    </button>
                  </div>
                </div>
                {n.folder ? <div className="mt-1 chip">{n.folder}</div> : null}
                {n.body ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{n.body}</p>
                ) : null}
                {n.todo?.length ? (
                  <ul className="mt-3 space-y-1">
                    {n.todo.map((t, i) => (
                      <li key={t.id ?? i}>
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={t.done}
                            onChange={async () => {
                              const next = n.todo.map((x, j) =>
                                j === i ? { ...x, done: !x.done } : x,
                              );
                              const res = await api("/api/notes", {
                                method: "PATCH",
                                json: { id: n.id, todo: next },
                              });
                              if (!res.ok) setError(res.error ?? "更新失败");
                              else void load();
                            }}
                          />
                          <span className={t.done ? "line-through text-muted" : ""}>{t.text}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-3 text-xs text-muted">
                  更新于 {n.updated_at.slice(0, 19).replace("T", " ")}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteEditor({
  note,
  onClose,
  onSaved,
}: {
  note: NoteRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [folder, setFolder] = useState(note.folder);
  const [todoText, setTodoText] = useState(
    (note.todo ?? []).map((t) => `${t.done ? "[x]" : "[ ]"} ${t.text}`).join("\n"),
  );
  const [msg, setMsg] = useState("");

  const save = async () => {
    setMsg("");
    const todo: Todo[] = todoText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => ({
        text: l.replace(/^\[[ xX]\]\s*/, ""),
        done: /^\[[xX]\]/.test(l),
      }))
      .filter((t) => t.text.length > 0);

    const payload = { title: title || "(无标题)", body, folder, todo };
    const res = note.id
      ? await api("/api/notes", { method: "PATCH", json: { id: note.id, ...payload } })
      : await api("/api/notes", { method: "POST", json: payload });
    if (!res.ok) {
      setMsg(res.error ?? "保存失败");
      return;
    }
    onSaved();
  };

  return (
    <div className="card space-y-3 p-4">
      <input
        className="input"
        placeholder="标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="input min-h-[120px]"
        placeholder="正文"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <input
        className="input"
        placeholder="文件夹（可空）"
        value={folder}
        onChange={(e) => setFolder(e.target.value)}
      />
      <textarea
        className="input min-h-[90px]"
        placeholder={'待办，每行一条，可用 [ ] / [x] 标记完成状态'}
        value={todoText}
        onChange={(e) => setTodoText(e.target.value)}
      />
      {msg ? <div className="text-sm text-err">{msg}</div> : null}
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={save}>
          保存
        </button>
        <button className="btn" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  );
}
