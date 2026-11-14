/* 引擎冒烟测试：直接调用 run()，不经过 HTTP。 */
import { TOOL_ENGINES } from "../src/lib/toolbox/registry";

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function main() {
  let pass = 0;
  let fail = 0;
  const results: string[] = [];

  for (const e of TOOL_ENGINES) {
    const input: Record<string, unknown> = {};
    // 为每个引擎填一个合理的最小输入
    for (const f of e.fields ?? []) {
      const multi = (f as { multiple?: boolean }).multiple;
      switch (f.name) {
        case "file":
        case "files":
          input[f.name] = multi ? `data:image/png;base64,${PNG_1x1}` : `data:image/png;base64,${PNG_1x1}`;
          break;
        case "input":
        case "text":
        case "left":
          input[f.name] = '{"a":1,"b":[1,2,3]}';
          break;
        case "right":
          input[f.name] = '{"a":2,"b":[1,2,3]}';
          break;
        case "goal":
          input[f.name] = "写一篇产品周报";
          break;
        case "ranges":
          input[f.name] = "1-2";
          break;
        case "apiKey":
          input[f.name] = "";
          break;
        case "label":
          input[f.name] = "DRAFT";
          break;
        case "pattern":
          input[f.name] = "a";
          break;
        case "replacement":
          input[f.name] = "b";
          break;
        default:
          input[f.name] = f.default ?? (f.type === "boolean" ? false : "");
      }
    }
    try {
      const r = await e.run(input);
      const status = r.ok ? "OK " : "ERR";
      if (r.ok) pass += 1;
      else fail += 1;
      const detail = r.ok
        ? `${r.mime ?? "-"} ${r.filename ?? "-"}`
        : (r.error ?? "").slice(0, 90);
      results.push(`${status} ${e.name.padEnd(28)} ${detail}`);
    } catch (err) {
      fail += 1;
      results.push(`THROW ${e.name.padEnd(28)} ${err instanceof Error ? err.message.slice(0, 90) : String(err)}`);
    }
  }

  console.log(results.join("\n"));
  console.log(`\n引擎总数 ${TOOL_ENGINES.length}｜ok=${pass} fail=${fail}`);
  const byCat: Record<string, string[]> = {};
  for (const e of TOOL_ENGINES) {
    (byCat[e.category] ??= []).push(e.name);
  }
  for (const [c, list] of Object.entries(byCat)) {
    console.log(`${c} (${list.length}): ${list.join(", ")}`);
  }
}

void main();
