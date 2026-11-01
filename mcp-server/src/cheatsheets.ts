// Parser for the domain-cheatsheets markdown format.
// The format is documented in docs/FORMAT.md. Keep the two in sync.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

export interface Term {
  id: string;
  names: string[];
  category: string;
  definition: string;
  prompt: string;
  when?: string;
  confusedWith?: string;
  related: string[];
  confirm?: string;
  video?: string;
  image?: string;
  /** Markdown links to the legal/official basis of numbers, deadlines and articles. */
  source?: string;
  /** YYYY-MM-DD the basis was last checked. */
  verified?: string;
  /** For a cross-reference entry: markdown link to the canonical term in another sheet. */
  canonical?: string;
  /** Parsed `canonical`: target sheet id and heading anchor. */
  canonicalRef?: { domain: string; anchor: string };
  anchor: string;
}

export interface Cheatsheet {
  id: string;
  title: string;
  titleEn: string;
  summary: string;
  tags: string[];
  updated: string;
  video?: string;
  categories: string[];
  terms: Term[];
  markdown: string;
  file: string;
}

export class FormatError extends Error {}

const FIELD_LABELS: Record<string, keyof Term> = {
  "정의": "definition",
  "AI에게 이렇게": "prompt",
  "언제": "when",
  "헷갈림": "confusedWith",
  "관련": "related",
  "확인 질문": "confirm",
  "영상": "video",
  "근거": "source",
  "검증일": "verified",
  "원본": "canonical",
};

/** Fields allowed on a cross-reference entry (one that points at the canonical term in another sheet). */
export const REFERENCE_FIELDS = ["정의", "원본"] as const;

export const REQUIRED_FIELDS = ["정의", "AI에게 이렇게"] as const;
export const REQUIRED_META = ["id", "title", "title_en", "summary", "tags", "updated"] as const;
export const OVERVIEW_START = "<!-- overview:start -->";
export const OVERVIEW_END = "<!-- overview:end -->";

const here = dirname(fileURLToPath(import.meta.url));

/** Repo root: CHEATSHEETS_ROOT env, else two levels above dist/src (or src). */
export function defaultRepoRoot(): string {
  if (process.env.CHEATSHEETS_ROOT) return resolve(process.env.CHEATSHEETS_ROOT);
  let dir = here;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "cheatsheets")) && existsSync(join(dir, "LICENSE"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("cheatsheets directory not found; set CHEATSHEETS_ROOT");
}

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

/** Minimal front matter: `key: value` and `key: [a, b]` only. */
export function parseFrontMatter(src: string): { meta: Record<string, string | string[]>; body: string; bodyLine: number } {
  const lines = src.split("\n");
  if (lines[0]?.trim() !== "---") throw new FormatError("front matter must start on line 1 with ---");
  const meta: Record<string, string | string[]> = {};
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "---") break;
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const m = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!m) throw new FormatError(`front matter line ${i + 1} is not 'key: value'`);
    const key = m[1]!;
    const raw = m[2]!.trim();
    if (raw.startsWith("[")) {
      if (!raw.endsWith("]")) throw new FormatError(`front matter list '${key}' must close on the same line`);
      const inner = raw.slice(1, -1).trim();
      meta[key] = inner ? inner.split(",").map(unquote).filter(Boolean) : [];
    } else {
      meta[key] = unquote(raw);
    }
  }
  if (i >= lines.length) throw new FormatError("front matter is not closed with ---");
  return { meta, body: lines.slice(i + 1).join("\n"), bodyLine: i + 2 };
}

/** GitHub-style heading anchor (github-slugger compatible for our headings). */
export function githubAnchor(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ASCII_NAME = /^[\x20-\x7e]+$/;

function stripOverview(body: string): string {
  const s = body.indexOf(OVERVIEW_START);
  const e = body.indexOf(OVERVIEW_END);
  if (s === -1 && e === -1) return body;
  if (s === -1 || e === -1 || e < s) throw new FormatError("overview markers must appear as a start/end pair");
  return body.slice(0, s) + body.slice(e + OVERVIEW_END.length);
}

export function parseCheatsheet(markdown: string, file = "<memory>"): Cheatsheet {
  const { meta, body } = parseFrontMatter(markdown);
  for (const k of REQUIRED_META) {
    const v = meta[k];
    if (v === undefined || (typeof v === "string" && !v) ) throw new FormatError(`${file}: front matter '${k}' is required`);
  }
  if (!Array.isArray(meta.tags)) throw new FormatError(`${file}: 'tags' must be a [list]`);
  const str = (k: string) => {
    const v = meta[k];
    if (typeof v !== "string") throw new FormatError(`${file}: '${k}' must be a string`);
    return v;
  };
  const updated = str("updated");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updated)) throw new FormatError(`${file}: 'updated' must be YYYY-MM-DD`);

  const terms: Term[] = [];
  const categories: string[] = [];
  let category = "";
  let current: Term | null = null;
  let inFence = false;

  const seenFields = new Set<string>();
  const finish = () => {
    if (!current) return;
    const label = current.names.join(" · ");
    if (current.canonical) {
      const m = /^\[[^\]]+\]\(([a-z0-9-]+)\.md#([^)\s]+)\)$/.exec(current.canonical);
      if (!m) throw new FormatError(`${file}: term '${label}' '- **원본**:' must be one link like [모션 디자인 · Stagger](motion-design.md#anchor)`);
      current.canonicalRef = { domain: m[1]!, anchor: decodeURIComponent(m[2]!) };
      const extra = [...seenFields].filter((f) => !(REFERENCE_FIELDS as readonly string[]).includes(f));
      if (extra.length) throw new FormatError(`${file}: cross-reference term '${label}' may only have 정의 and 원본 (found: ${extra.join(", ")})`);
      if (current.image) throw new FormatError(`${file}: cross-reference term '${label}' must not have an image (the canonical term has it)`);
      if (!current.definition) throw new FormatError(`${file}: term '${label}' is missing '- **정의**:'`);
    } else {
      for (const req of REQUIRED_FIELDS) {
        const key = FIELD_LABELS[req]!;
        if (!current[key]) throw new FormatError(`${file}: term '${label}' is missing '- **${req}**:'`);
      }
    }
    if (current.verified !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(current.verified)) throw new FormatError(`${file}: term '${label}' 검증일 must be YYYY-MM-DD`);
    if ((current.source === undefined) !== (current.verified === undefined)) throw new FormatError(`${file}: term '${label}' needs both 근거 and 검증일`);
    terms.push(current);
    current = null;
    seenFields.clear();
  };

  for (const line of stripOverview(body).split("\n")) {
    if (line.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const h2 = /^## (.+)$/.exec(line);
    const h3 = /^### (.+)$/.exec(line);
    if (h2) {
      finish();
      category = h2[1]!.trim();
      continue;
    }
    if (h3) {
      finish();
      const heading = h3[1]!.trim();
      const names = heading.split(" · ").map((s) => s.trim()).filter(Boolean);
      const ascii = names.find((n) => ASCII_NAME.test(n));
      if (!ascii) throw new FormatError(`${file}: term heading '${heading}' needs one English name (e.g. '소멸시효 · Statute of Limitations')`);
      if (!category) throw new FormatError(`${file}: term '${heading}' must be under a '## category' heading`);
      if (!categories.includes(category)) categories.push(category);
      current = { id: slugify(ascii), names, category, definition: "", prompt: "", related: [], anchor: githubAnchor(heading) };
      continue;
    }
    if (!current) continue;
    const field = /^- \*\*(.+?)\*\*:\s*(.*)$/.exec(line);
    if (field) {
      const key = FIELD_LABELS[field[1]!];
      if (key) seenFields.add(field[1]!);
      if (!key) throw new FormatError(`${file}: unknown field '${field[1]}' in term '${current.names[0]}' (allowed: ${Object.keys(FIELD_LABELS).join(", ")})`);
      const value = field[2]!.trim();
      if (key === "related") current.related = value.split(",").map((s) => s.trim()).filter(Boolean);
      else (current as unknown as Record<string, string>)[key] = value;
      continue;
    }
    const img = /<img\s[^>]*src="([^"]+)"/.exec(line) ?? /!\[[^\]]*\]\(([^)\s]+)\)/.exec(line);
    if (img && !current.image) current.image = img[1];
  }
  finish();

  const id = str("id");
  const seen = new Set<string>();
  for (const t of terms) {
    if (seen.has(t.id)) throw new FormatError(`${file}: duplicate term id '${t.id}'`);
    seen.add(t.id);
  }
  if (terms.length === 0) throw new FormatError(`${file}: no terms found`);

  return {
    id,
    title: str("title"),
    titleEn: str("title_en"),
    summary: str("summary"),
    tags: meta.tags as string[],
    updated,
    video: typeof meta.video === "string" && meta.video ? meta.video : undefined,
    categories,
    terms,
    markdown,
    file,
  };
}

export function loadCheatsheets(root = defaultRepoRoot()): Cheatsheet[] {
  const dir = join(root, "cheatsheets");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_")).sort();
  const sheets = files.map((f) => {
    const sheet = parseCheatsheet(readFileSync(join(dir, f), "utf8"), `cheatsheets/${f}`);
    if (sheet.id !== basename(f, ".md")) throw new FormatError(`cheatsheets/${f}: id '${sheet.id}' must match the file name`);
    return sheet;
  });
  return sheets;
}

/** Normalize for search: lowercase, drop spaces and punctuation. */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_·.,/()'"`]+/g, "");
}

export interface SearchHit {
  domain: string;
  term: Term;
  score: number;
}

export function searchTerms(sheets: Cheatsheet[], query: string, opts: { domain?: string; limit?: number } = {}): SearchHit[] {
  const q = normalize(query);
  const words = query.toLowerCase().split(/\s+/).map(normalize).filter(Boolean);
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const sheet of sheets) {
    if (opts.domain && sheet.id !== opts.domain) continue;
    for (const term of sheet.terms) {
      if (term.canonical) continue; // cross-references point at a term that is already searchable
      let score = 0;
      const names = term.names.map(normalize);
      if (names.some((n) => n === q) || term.id === query.toLowerCase()) score += 100;
      else if (names.some((n) => n.includes(q))) score += 60;
      const text = normalize([term.definition, term.prompt, term.when ?? "", term.confusedWith ?? "", term.related.join(" "), term.category].join(" "));
      if (text.includes(q)) score += 20;
      for (const w of words) {
        if (names.some((n) => n.includes(w))) score += 10;
        else if (text.includes(w)) score += 4;
      }
      if (score > 0) hits.push({ domain: sheet.id, term, score });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain) || a.term.id.localeCompare(b.term.id));
  return hits.slice(0, opts.limit ?? 10);
}

/** Terms that are not cross-references. */
export const ownTerms = (s: Cheatsheet) => s.terms.filter((t) => !t.canonical);

export function findTerm(sheet: Cheatsheet, key: string): Term | undefined {
  const k = normalize(key);
  return sheet.terms.find((t) => t.id === key.toLowerCase() || t.names.some((n) => normalize(n) === k));
}
