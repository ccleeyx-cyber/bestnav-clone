"use client";

import { useRef, useState } from "react";

export interface ToolField {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "file" | "boolean";
  required?: boolean;
  placeholder?: string;
  default?: unknown;
  options?: { value: string; label: string }[];
  multiple?: boolean;
  help?: string;
}

export interface ToolEngineMeta {
  name: string;
  category: string;
  description: string;
  fields: ToolField[];
}

export interface ToolRunOutput {
  engine: string;
  output: unknown;
  mime?: string;
  filename?: string;
}

function isDataUrl(v: string): boolean {
  return v.startsWith("data:") || v.startsWith("http");
}

/** 解析引擎输出里的图片 / 文本 / 文件。 */
export function renderOutput(result: ToolRunOutput) {
  const out = result.output;

  // 图片数组（PDF→图片、批量结果）
  if (Array.isArray(out) && out.length && typeof out[0] === "object" && out[0] !== null && "data" in (out[0] as object)) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {out.map((o, i) => {
          const rec = o as { data: string; name?: string };
          return (
            <div key={i} className="card p-2">
              {isDataUrl(rec.data) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rec.data} alt={rec.name ?? ""} className="w-full rounded-lg" />
              ) : null}
              <div className="mt-1 flex items-center gap-2">
                <span className="truncate text-xs text-muted">{rec.name ?? `image-${i}`}</span>
                <a
                  href={rec.data}
                  download={rec.name ?? "image.png"}
                  className="ml-auto rounded px-2 py-0.5 text-xs text-primary hover:bg-surface"
                >
                  下载
                </a>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (out && typeof out === "object" && "data" in out && typeof (out as { data: unknown }).data === "string") {
    const rec = out as { data: string; mime?: string; filename?: string; bytes?: number };
    const mime = rec.mime ?? result.mime ?? "";
    if (mime.startsWith("image/") || rec.data.startsWith("data:image")) {
      return (
        <div className="card p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={rec.data} alt={rec.filename ?? "result"} className="max-h-[420px] w-auto rounded-lg" />
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span className="text-muted">{rec.filename ?? "result"}</span>
            <a href={rec.data} download={rec.filename ?? "result"} className="text-primary hover:underline">
              下载
            </a>
            {rec.bytes ? <span className="text-muted">{rec.bytes} bytes</span> : null}
          </div>
        </div>
      );
    }
    if (mime === "application/pdf" || rec.data.startsWith("data:application/pdf")) {
      return (
        <div className="card p-3 text-sm">
          <p className="mb-2 text-fs">
            PDF 已生成（{rec.bytes ? `${rec.bytes} bytes` : "—"}）
          </p>
          <a
            href={rec.data}
            download={rec.filename ?? "output.pdf"}
            className="btn btn-primary text-xs"
          >
            下载 PDF
          </a>
        </div>
      );
    }
    // base64 通用文件
    return (
      <div className="card p-3 text-sm">
        <p className="mb-2 text-fg">文件已生成（{rec.bytes ? `${rec.bytes} bytes` : "—"}）</p>
        <a href={rec.data} download={rec.filename ?? "output.bin"} className="btn btn-primary text-xs">
          下载
        </a>
      </div>
    );
  }

  // 文本类
  if (out && typeof out === "object" && "text" in out && typeof (out as { text: unknown }).text === "string") {
    const rec = out as { text: string; chars?: unknown; matches?: unknown; added?: unknown; removed?: unknown };
    return (
      <div className="card p-3">
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all text-xs text-fg">
          {rec.text}
        </pre>
        <div className="mt-2 flex gap-3 text-xs text-muted">
          {typeof rec.chars === "number" ? <span>{rec.chars} 字符</span> : null}
          {typeof rec.matches === "number" ? <span>{rec.matches} 处匹配</span> : null}
          {typeof rec.added === "number" ? (
            <span>
              +{rec.added} / -{typeof rec.removed === "number" ? rec.removed : 0}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  if (out && typeof out === "object" && "html" in out && typeof (out as { html: unknown }).html === "string") {
    const rec = out as { html: string };
    return (
      <div className="card p-3">
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap text-xs text-fg">{rec.html}</pre>
      </div>
    );
  }

  if (out && typeof out === "object" && "json" in out) {
    const rec = out as { json: string };
    return (
      <div className="card p-3">
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap text-xs text-fg">{rec.json}</pre>
      </div>
    );
  }

  if (out && typeof out === "object" && "csv" in out) {
    const rec = out as { csv: string };
    return (
      <div className="card p-3">
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap text-xs text-fg">{rec.csv}</pre>
      </div>
    );
  }

  if (out && typeof out === "object" && "markdown" in out) {
    const rec = out as { markdown: string };
    return (
      <div className="card p-3">
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap text-xs text-fg">{rec.markdown}</pre>
      </div>
    );
  }

  if (out && typeof out === "object" && "sql" in out) {
    const rec = out as { sql: string };
    return (
      <div className="card p-3">
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap text-xs text-fg">{rec.sql}</pre>
      </div>
    );
  }

  if (out && typeof out === "object" && "diff" in out) {
    const rec = out as { diff: string; added: number; removed: number };
    return (
      <div className="card p-3">
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap text-xs text-fg">{rec.diff}</pre>
        <p className="mt-2 text-xs text-muted">
          +{rec.added} / -{rec.removed}
        </p>
      </div>
    );
  }

  return (
    <div className="card p-3">
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap text-xs text-fg">
        {JSON.stringify(out, null, 2)}
      </pre>
    </div>
  );
}

export function EngineForm({
  engine,
  onResult,
  onError,
}: {
  engine: ToolEngineMeta;
  onResult: (r: ToolRunOutput) => void;
  onError: (m: string) => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of engine.fields) init[f.name] = f.default ?? (f.type === "boolean" ? false : "");
    return init;
  });
  const [running, setRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function readFiles(files: FileList | null): Promise<string> {
    if (!files || !files.length) return "";
    const parts: string[] = [];
    for (const file of Array.from(files)) {
      const buf = await file.arrayBuffer();
      const base64 = bufferToBase64(new Uint8Array(buf));
      parts.push(`data:${file.type || "application/octet-stream"};base64,${base64}`);
    }
    return parts.join("\n");
  }

  function bufferToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function submit() {
    setRunning(true);
    onError("");
    try {
      const input: Record<string, unknown> = { ...values };
      for (const f of engine.fields) {
        if (f.type === "file") {
          const v = input[f.name];
          if (typeof v === "string" && v.startsWith("data:")) continue;
          const files = fileRef.current?.files ?? null;
          input[f.name] = await readFiles(files);
        }
      }
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ engine: engine.name, input }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: ToolRunOutput;
        error?: string;
      };
      if (!json.ok || !json.data) onError(json.error ?? "执行失败");
      else onResult(json.data);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card p-3">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-fg">{engine.name}</h3>
        <p className="mt-0.5 text-xs text-muted">{engine.description}</p>
      </div>
      <div className="space-y-2">
        {engine.fields.map((f) => (
          <div key={f.name}>
            <label className="mb-1 block text-xs text-muted">
              {f.label}
              {f.required ? <span className="ml-1 text-err">*</span> : null}
            </label>
            {f.type === "textarea" ? (
              <textarea
                value={String(values[f.name] ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                placeholder={f.placeholder}
                rows={4}
                className="input w-full text-xs"
              />
            ) : f.type === "select" ? (
              <select
                value={String(values[f.name] ?? f.default ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className="input w-full text-xs"
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "boolean" ? (
              <label className="flex items-center gap-2 text-xs text-fg">
                <input
                  type="checkbox"
                  checked={Boolean(values[f.name])}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))}
                />
                启用
              </label>
            ) : f.type === "file" ? (
              <input
                ref={fileRef}
                type="file"
                multiple={f.multiple}
                className="block w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-surface file:px-2 file:py-1 file:text-xs file:text-fg"
              />
            ) : (
              <input
                type={f.type === "number" ? "number" : "text"}
                value={String(values[f.name] ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                placeholder={f.placeholder}
                className="input w-full text-xs"
              />
            )}
            {f.help ? <p className="mt-1 text-[11px] text-muted">{f.help}</p> : null}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => void submit()} disabled={running} className="btn btn-primary mt-3 w-full text-xs">
        {running ? "执行中…" : "运行"}
      </button>
    </div>
  );
}
