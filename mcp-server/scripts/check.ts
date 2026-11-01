// CI gate: every sheet parses, local images/links resolve, generated sections are current.
// Usage: node dist/scripts/check.js [sheet-id]   (with an id, only that sheet and its assets are checked)
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { defaultRepoRoot, loadCheatsheets, parseCheatsheet, type Cheatsheet } from "../src/cheatsheets.js";
import { applyOverview, renderIndex, replaceBetween, previewPath, INDEX_START, INDEX_END } from "../src/render.js";

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

function checkLinks(file: string, text: string) {
  const targets = [
    ...[...text.matchAll(/<img\s[^>]*src="([^"]+)"/g)].map((m) => m[1]!),
    ...[...text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]!),
  ];
  for (const raw of targets) {
    if (/^(https?:|mailto:|#)/.test(raw)) continue;
    const path = decodeURIComponent(raw.split("#")[0]!);
    const abs = resolve(dirname(join(root, file)), path);
    if (relative(root, abs).startsWith("..")) errors.push(`${file}: link escapes the repo: ${raw}`);
    else if (!existsSync(abs)) errors.push(`${file}: broken link ${raw}`);
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
      usedAssets.add(resolve(root, "cheatsheets", t.image));
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
console.log(`✓ ${sheets.length} sheet(s), ${total} terms, ${usedAssets.size} images — all checks passed`);
