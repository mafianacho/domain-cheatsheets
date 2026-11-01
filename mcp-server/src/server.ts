// MCP server definition shared by the stdio and HTTP entry points.
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type Cheatsheet, type Term, OVERVIEW_START, OVERVIEW_END, searchTerms, findTerm } from "./cheatsheets.js";

export const SERVER_NAME = "domain-cheatsheets";
export const SERVER_VERSION = "0.1.0";

export interface ServerOptions {
  /** Base for links to sheets, e.g. https://github.com/<org>/<repo>/blob/main/ */
  pageBase?: string;
  /** Base for raw image files, e.g. https://raw.githubusercontent.com/<org>/<repo>/main/ */
  rawBase?: string;
}

const DEFAULT_PAGE_BASE = "https://github.com/mafianacho/domain-cheatsheets/blob/main/";
const DEFAULT_RAW_BASE = "https://raw.githubusercontent.com/mafianacho/domain-cheatsheets/main/";

const INSTRUCTIONS = `Domain Cheatsheets is a dictionary of domain vocabulary (UI, motion, 3D, law, fashion, construction, accounting, ...).
Use it to sync up with the user before doing work in a field they (or you) don't know well:
1. list_domains or search_terms to find the right sheet and terms.
2. Restate the user's request with the sheet's exact terms, and ask the term's "확인 질문" when information is missing.
3. Then do the work using those terms. Professional sheets (law, accounting, construction) are references, not professional advice.`;

export function createServer(sheets: Cheatsheet[], opts: ServerOptions = {}): McpServer {
  const pageBase = opts.pageBase ?? process.env.CHEATSHEETS_PAGE_BASE ?? DEFAULT_PAGE_BASE;
  const rawBase = opts.rawBase ?? process.env.CHEATSHEETS_RAW_BASE ?? DEFAULT_RAW_BASE;
  const byId = new Map(sheets.map((s) => [s.id, s]));
  const ids = () => sheets.map((s) => s.id).join(", ");

  const pageUrl = (s: Cheatsheet, t?: Term) => `${pageBase}cheatsheets/${s.id}.md${t ? `#${encodeURIComponent(t.anchor)}` : ""}`;
  const imageUrl = (img: string) => (/^https?:/.test(img) ? img : rawBase + img.replace(/^\.\.\//, ""));

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });

  const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
  const fail = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });
  const unknownDomain = (d: string) => fail(`Unknown domain '${d}'. Available: ${ids()}`);

  const termBrief = (s: Cheatsheet, t: Term) =>
    [`- **${t.names.join(" · ")}** (\`${s.id}/${t.id}\`, ${t.category})`, `  - 정의: ${t.definition}`, `  - AI에게 이렇게: ${t.prompt}`].join("\n");

  const termDetail = (s: Cheatsheet, t: Term) => {
    const lines = [`## ${t.names.join(" · ")}`, "", `- domain: ${s.id} (${s.title} · ${s.titleEn})`, `- id: ${t.id}`, `- category: ${t.category}`, `- 정의: ${t.definition}`, `- AI에게 이렇게: ${t.prompt}`];
    if (t.when) lines.push(`- 언제: ${t.when}`);
    if (t.confusedWith) lines.push(`- 헷갈림: ${t.confusedWith}`);
    if (t.related.length) lines.push(`- 관련: ${t.related.join(", ")}`);
    if (t.confirm) lines.push(`- 확인 질문: ${t.confirm}`);
    if (t.image) lines.push(`- image: ${imageUrl(t.image)}`);
    if (t.video) lines.push(`- video: ${t.video}`);
    lines.push(`- page: ${pageUrl(s, t)}`);
    return lines.join("\n");
  };

  /** Sheet markdown for agents: no front matter, no generated HTML grid, absolute image URLs. */
  const agentMarkdown = (s: Cheatsheet, category?: string) => {
    let body = s.markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
    const a = body.indexOf(OVERVIEW_START);
    const b = body.indexOf(OVERVIEW_END);
    if (a !== -1 && b > a) body = body.slice(0, a) + `(그림 목록은 ${pageUrl(s)} 참고)` + body.slice(b + OVERVIEW_END.length);
    body = body.replace(/(src="|\]\()\.\.\/(assets\/[^")\s]+)/g, (_m, p, path) => `${p}${rawBase}${path}`);
    if (category) {
      const parts = body.split(/^(?=## )/m);
      const hit = parts.filter((p) => p.startsWith(`## ${category}`) || p.split("\n")[0]!.toLowerCase().includes(category.toLowerCase()));
      body = `# ${s.title} · ${s.titleEn}\n\n${hit.join("")}`;
    }
    return `<!-- source: ${pageUrl(s)} · license: Apache-2.0 -->\n${body.trim()}\n`;
  };

  server.registerTool(
    "list_domains",
    {
      title: "List domains",
      description: "List every cheatsheet domain with its summary, categories and term count. Start here when you don't know which domain fits the user's task.",
      inputSchema: { tag: z.string().optional().describe("Filter by tag, e.g. 'tech', 'profession', 'design', 'korea'") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tag }) => {
      const list = sheets.filter((s) => !tag || s.tags.includes(tag));
      if (!list.length) return text(`No domain has tag '${tag}'. Tags in use: ${[...new Set(sheets.flatMap((s) => s.tags))].sort().join(", ")}`);
      return text(
        list
          .map(
            (s) =>
              `- **${s.id}** — ${s.title} · ${s.titleEn}: ${s.summary}\n  - terms: ${s.terms.length} · categories: ${s.categories.join(" / ")} · tags: ${s.tags.join(", ")}\n  - page: ${pageUrl(s)} · preview: ${rawBase}assets/previews/${s.id}.gif`,
          )
          .join("\n"),
      );
    },
  );

  server.registerTool(
    "search_terms",
    {
      title: "Search terms",
      description:
        "Search term names, definitions and example requests across all domains (Korean or English). Use it to map a user's vague words (e.g. '위에서 크게 나오는 화면', 'contract cancel') to the exact term.",
      inputSchema: {
        query: z.string().min(1).max(200).describe("Words to look for"),
        domain: z.string().optional().describe("Limit to one domain id (see list_domains)"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, domain, limit }) => {
      if (domain && !byId.has(domain)) return unknownDomain(domain);
      const hits = searchTerms(sheets, query, { domain, limit: limit ?? 10 });
      if (!hits.length) return text(`No term matched '${query}'. Try other words, English/Korean names, or list_domains.`);
      return text(hits.map((h) => termBrief(byId.get(h.domain)!, h.term)).join("\n"));
    },
  );

  server.registerTool(
    "get_term",
    {
      title: "Get term",
      description: "Full card for one term: definition, example request, when to use, easily confused terms, related terms, the question to confirm with the user, image and page links.",
      inputSchema: {
        domain: z.string().describe("Domain id, e.g. 'ui-design'"),
        term: z.string().describe("Term id or any of its names, e.g. 'hero-section' or '히어로 섹션'"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ domain, term }) => {
      const s = byId.get(domain);
      if (!s) return unknownDomain(domain);
      const t = findTerm(s, term);
      if (!t) {
        const near = searchTerms(sheets, term, { domain, limit: 5 }).map((h) => h.term.id);
        return fail(`No term '${term}' in ${domain}.${near.length ? ` Did you mean: ${near.join(", ")}?` : ""}`);
      }
      return text(termDetail(s, t));
    },
  );

  server.registerTool(
    "get_cheatsheet",
    {
      title: "Get cheatsheet",
      description: "Return a whole cheatsheet (or one category of it) as markdown so you can share vocabulary with the user before starting the task.",
      inputSchema: {
        domain: z.string().describe("Domain id, e.g. 'law'"),
        category: z.string().optional().describe("Optional category name (Korean or English part), e.g. 'Layout' or '계약'"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ domain, category }) => {
      const s = byId.get(domain);
      if (!s) return unknownDomain(domain);
      if (category && !s.categories.some((c) => c.toLowerCase().includes(category.toLowerCase()))) {
        return fail(`No category '${category}' in ${domain}. Categories: ${s.categories.join(" / ")}`);
      }
      return text(agentMarkdown(s, category));
    },
  );

  server.registerResource(
    "cheatsheet",
    new ResourceTemplate("cheatsheet://{domain}", {
      list: async () => ({
        resources: sheets.map((s) => ({ uri: `cheatsheet://${s.id}`, name: `${s.title} · ${s.titleEn}`, description: s.summary, mimeType: "text/markdown" })),
      }),
      complete: { domain: (v) => sheets.map((s) => s.id).filter((id) => id.startsWith(v)) },
    }),
    { title: "Cheatsheet", description: "A whole domain cheatsheet as markdown", mimeType: "text/markdown" },
    async (uri, { domain }) => {
      const s = byId.get(String(domain));
      if (!s) throw new Error(`Unknown domain '${domain}'. Available: ${ids()}`);
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: agentMarkdown(s) }] };
    },
  );

  server.registerPrompt(
    "sync_up",
    {
      title: "Sync up on a domain",
      description: "Before working in an unfamiliar domain: restate the task with the cheatsheet's terms and confirm missing details with the user.",
      argsSchema: {
        domain: z.string().describe("Domain id, e.g. 'ui-design'"),
        task: z.string().describe("What the user wants, in their own words"),
      },
    },
    ({ domain, task }) => {
      const s = byId.get(domain);
      const sheet = s ? agentMarkdown(s) : `(unknown domain '${domain}'; available: ${ids()})`;
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "아래 치트시트의 용어로 내 요청을 다시 정리해 줘.",
                "1) 내 말에 해당하는 용어를 골라 '이렇게 이해했어요' 형태로 요약하고,",
                "2) 정보가 빠진 부분은 각 용어의 '확인 질문'을 참고해 한 번에 묻고,",
                "3) 내가 확인하면 그 용어 그대로 작업을 시작해.",
                "",
                `내 요청: ${task}`,
                "",
                "---",
                sheet,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );

  return server;
}
