// CI gate: every sheet parses, local images/links resolve, generated sections are current.
// Usage: node dist/scripts/check.js [sheet-id]   (with an id, only that sheet and its assets are checked)
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { defaultRepoRoot, loadCheatsheets, parseCheatsheet, normalize, type Cheatsheet } from "../src/cheatsheets.js";
import { applyOverview, renderIndex, replaceBetween, previewPath, INDEX_START, INDEX_END } from "../src/render.js";
import { GIF_W, GIF_H, GIF_MAX_BYTES } from "./gifs.js";

const root = defaultRepoRoot();
const only = process.argv[2];
const errors: string[] = [];

let sheets: Cheatsheet[];
try {
  sheets = only
    ? [parseCheatsheet(readFileSync(join(root, "cheatsheets", `${only}.md`), "utf8"), `cheatsheets/${only}.md`)]
    : loadCheatsheets(root);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
}

const YOUTUBE = /^https:\/\/(www\.)?(youtube\.com\/(watch\?v=|playlist\?list=)|youtu\.be\/)[\w-]+/;

function checkLinks(file: string, raw: string) {
  const text = raw.replace(/^```[\s\S]*?^```/gm, ""); // examples in fenced code are not links
  const targets = [
    ...[...text.matchAll(/<img\s[^>]*src="([^"]+)"/g)].map((m) => m[1]!),
    ...[...text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]!),
  ];
  for (const target of targets) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split("#")[0]!);
    const abs = resolve(dirname(join(root, file)), path);
    if (relative(root, abs).startsWith("..")) errors.push(`${file}: link escapes the repo: ${target}`);
    else if (!existsSync(abs)) errors.push(`${file}: broken link ${target}`);
  }
}

const usedAssets = new Set<string>();
for (const sheet of sheets) {
  if (sheet.id !== sheet.file.replace(/^cheatsheets\/|\.md$/g, "")) errors.push(`${sheet.file}: id must match the file name`);
  if (applyOverview(sheet) !== sheet.markdown) errors.push(`${sheet.file}: overview is stale — run 'npm run generate'`);
  checkLinks(sheet.file, sheet.markdown);
  if (sheet.video && !YOUTUBE.test(sheet.video)) errors.push(`${sheet.file}: video must be a YouTube URL`);
  for (const t of sheet.terms) {
    if (t.video && !YOUTUBE.test(t.video)) errors.push(`${sheet.file}: term ${t.id} video must be a YouTube URL`);
    if (t.image) {
      if (!t.image.startsWith(`../assets/${sheet.id}/`)) errors.push(`${sheet.file}: term ${t.id} image must live in assets/${sheet.id}/`);
      const abs = resolve(root, "cheatsheets", t.image);
      usedAssets.add(abs);
      if (t.image.endsWith(".gif")) {
        const src = abs.replace(/\.gif$/, ".svg");
        usedAssets.add(src);
        if (!existsSync(src)) errors.push(`${sheet.file}: term ${t.id} GIF needs its source ${relative(root, src)} (built by 'npm run gifs')`);
        if (existsSync(abs)) {
          const gif = readFileSync(abs);
          if (gif.subarray(0, 6).toString("latin1") !== "GIF89a" || gif.readUInt16LE(6) !== GIF_W || gif.readUInt16LE(8) !== GIF_H) errors.push(`${relative(root, abs)}: must be a ${GIF_W}x${GIF_H} GIF89a`);
          if (gif.length > GIF_MAX_BYTES) errors.push(`${relative(root, abs)}: ${(gif.length / 1024).toFixed(0)} KB is over the ${GIF_MAX_BYTES / 1024} KB budget`);
        }
      } else if (!t.image.endsWith(".svg")) errors.push(`${sheet.file}: term ${t.id} image must be .svg or .gif`);
    }
  }
}

// Numbers, deadlines and statute articles in professional (korea-tagged) sheets need 근거 + 검증일.
export const CLAIM = /\d[\d,.]*\s?(%|년|개월|일|주|시간|원|만\s?원|억|㎡)|제\s?\d+\s?조/;
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // KST date
for (const sheet of sheets) {
  for (const t of sheet.terms) {
    const where = `${sheet.file}: term ${t.id}`;
    if (sheet.tags.includes("korea") && !t.canonical) {
      const claimText = [t.definition, t.when ?? "", t.confusedWith ?? ""].join(" ");
      if (CLAIM.test(claimText) && !t.source) errors.push(`${where} states a number/deadline/article ('${CLAIM.exec(claimText)![0]}') — add '- **근거**:' and '- **검증일**:'`);
    }
    if (t.source && !/\]\(https:\/\/[^)\s]+\)/.test(t.source)) errors.push(`${where}: 근거 needs at least one [name](https://...) link`);
    if (t.source && /\]\(http:\/\//.test(t.source)) errors.push(`${where}: 근거 links must be https`);
    if (t.verified && t.verified > today) errors.push(`${where}: 검증일 ${t.verified} is in the future`);
  }
}

// Cross-references must point at an existing, non-reference term; the same term may not be defined twice.
if (!only) {
  const byId = new Map(sheets.map((s) => [s.id, s]));
  const owners = new Map<string, string>();
  for (const sheet of sheets) {
    for (const t of sheet.terms) {
      if (t.canonicalRef) {
        const target = byId.get(t.canonicalRef.domain)?.terms.find((x) => x.anchor === t.canonicalRef!.anchor);
        if (!target) errors.push(`${sheet.file}: term ${t.id} 원본 points at a missing term (${t.canonical})`);
        else if (target.canonical) errors.push(`${sheet.file}: term ${t.id} 원본 points at another cross-reference`);
        continue;
      }
      for (const n of t.names) {
        const key = normalize(n);
        const prev = owners.get(key);
        if (prev && !prev.startsWith(`${sheet.id}/`)) errors.push(`term name '${n}' is defined in both ${prev} and ${sheet.id}/${t.id} — keep one and make the other a 원본 cross-reference`);
        owners.set(key, `${sheet.id}/${t.id}`);
      }
    }
  }
}

const PREVIEWS = "previews";
if (!only) {
  const dir = join(root, "assets", PREVIEWS);
  const files = existsSync(dir) ? readdirSync(dir) : [];
  for (const s of sheets) if (!files.includes(`${s.id}.gif`)) errors.push(`${previewPath(s.id)}: missing — run 'npm run previews'`);
  for (const f of files) if (!sheets.some((s) => `${s.id}.gif` === f)) errors.push(`assets/${PREVIEWS}/${f}: no cheatsheet with this id`);
}

const assetDirs = only ? (existsSync(join(root, "assets", only)) ? [only] : []) : readdirSync(join(root, "assets")).filter((d) => d !== PREVIEWS);
for (const dir of assetDirs) {
  const full = join(root, "assets", dir);
  const sheet = sheets.find((s) => s.id === dir);
  if (!sheet) {
    errors.push(`assets/${dir}: no cheatsheet with this id`);
    continue;
  }
  for (const f of readdirSync(full)) {
    const abs = join(full, f);
    if (!usedAssets.has(abs) && !sheet.markdown.includes(`assets/${dir}/${f}`)) errors.push(`assets/${dir}/${f}: not referenced by ${sheet.file}`);
    if (f.endsWith(".svg")) {
      const svg = readFileSync(abs, "utf8");
      if (/<script|\son\w+\s*=|<foreignObject|(?:xlink:)?href\s*=\s*"(?!#)/i.test(svg)) errors.push(`assets/${dir}/${f}: SVG must not contain scripts, event handlers, foreignObject or external links`);
      if (/animation\s*:/.test(svg) && !svg.includes("prefers-reduced-motion")) errors.push(`assets/${dir}/${f}: animated SVG needs a prefers-reduced-motion rule (see docs/MEDIA.md)`);
      if (!/viewBox="0 0 320 200"/.test(svg)) errors.push(`assets/${dir}/${f}: SVG must use viewBox="0 0 320 200"`);
    }
  }
}

if (!only) {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  if (replaceBetween(readme, INDEX_START, INDEX_END, renderIndex(sheets), "README.md") !== readme) errors.push("README.md: domain index is stale — run 'npm run generate'");
  for (const f of ["README.md", "CONTRIBUTING.md", "docs/FORMAT.md", "docs/MEDIA.md", "mcp-server/README.md"]) {
    if (existsSync(join(root, f))) checkLinks(f, readFileSync(join(root, f), "utf8"));
  }
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  console.error(`\n${errors.length} problem(s)`);
  process.exit(1);
}
const total = sheets.reduce((n, s) => n + s.terms.length, 0);
console.log(`✓ ${sheets.length} sheet(s), ${total} terms, ${sheets.reduce((n, s) => n + s.terms.filter((t) => t.image?.endsWith(".svg")).length, 0)} svg + ${sheets.reduce((n, s) => n + s.terms.filter((t) => t.image?.endsWith(".gif")).length, 0)} gif images — all checks passed`);
