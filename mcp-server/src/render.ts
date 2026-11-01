// Generated sections: the per-sheet "한눈에 보기" grid and the README domain index.
import { type Cheatsheet, OVERVIEW_START, OVERVIEW_END } from "./cheatsheets.js";

export const INDEX_START = "<!-- index:start -->";
export const INDEX_END = "<!-- index:end -->";

export const GROUP_LABELS: Record<string, string> = {
  tech: "기술 · 디자인",
  profession: "전문 분야",
};

const GRID_COLUMNS = 3;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text for HTML cells: drop markdown emphasis/code/link syntax. */
export function plain(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*`]/g, "")
    .trim();
}

export function renderOverview(sheet: Cheatsheet): string {
  const out: string[] = [OVERVIEW_START, "<!-- 이 구역은 자동 생성됩니다. 직접 고치지 말고 `cd mcp-server && npm run generate`를 실행하세요. -->", ""];
  for (const category of sheet.categories) {
    const terms = sheet.terms.filter((t) => t.category === category);
    out.push(`**${category}** (${terms.length})`, "", "<table>");
    for (let i = 0; i < terms.length; i += GRID_COLUMNS) {
      out.push("<tr>");
      for (const t of terms.slice(i, i + GRID_COLUMNS)) {
        const [primary, ...rest] = t.names;
        const img = t.image ? `<a href="#${t.anchor}"><img src="${esc(t.image)}" alt="${esc(primary!)}" width="100%"></a><br>` : "";
        const sub = rest.length ? ` <sub>${esc(rest.join(" · "))}</sub>` : "";
        out.push(
          `<td width="${Math.floor(100 / GRID_COLUMNS)}%" valign="top">${img}<b><a href="#${t.anchor}">${esc(primary!)}</a></b>${sub}<br><sub>${esc(plain(t.definition))}</sub></td>`,
        );
      }
      out.push("</tr>");
    }
    out.push("</table>", "");
  }
  out.push(OVERVIEW_END);
  return out.join("\n");
}

export function replaceBetween(src: string, start: string, end: string, replacement: string, file: string): string {
  const s = src.indexOf(start);
  const e = src.indexOf(end);
  if (s === -1 || e === -1 || e < s) throw new Error(`${file}: missing ${start} ... ${end} markers`);
  return src.slice(0, s) + replacement + src.slice(e + end.length);
}

export function applyOverview(sheet: Cheatsheet): string {
  return replaceBetween(sheet.markdown, OVERVIEW_START, OVERVIEW_END, renderOverview(sheet), sheet.file);
}

export function renderIndex(sheets: Cheatsheet[]): string {
  const groups = new Map<string, Cheatsheet[]>();
  for (const s of sheets) {
    const g = s.tags[0] ?? "etc";
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }
  const order = [...Object.keys(GROUP_LABELS), ...[...groups.keys()].filter((g) => !(g in GROUP_LABELS)).sort()];
  const total = sheets.reduce((n, s) => n + s.terms.length, 0);
  const out: string[] = [INDEX_START, "<!-- 이 구역은 자동 생성됩니다. `cd mcp-server && npm run generate` -->", "", `도메인 ${sheets.length}개 · 용어 ${total}개`, ""];
  for (const g of order) {
    const list = groups.get(g);
    if (!list) continue;
    out.push(`### ${GROUP_LABELS[g] ?? g}`, "", "| 도메인 | 이럴 때 펼쳐 보세요 | 용어 |", "|---|---|---:|");
    for (const s of list) {
      out.push(`| [${s.title} · ${s.titleEn}](cheatsheets/${s.id}.md) | ${plain(s.summary).replace(/\|/g, "\\|")} | ${s.terms.length} |`);
    }
    out.push("");
  }
  out.push(INDEX_END);
  return out.join("\n");
}
