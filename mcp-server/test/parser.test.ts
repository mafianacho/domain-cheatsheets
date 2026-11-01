import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCheatsheet, githubAnchor, slugify, searchTerms, findTerm, FormatError, loadCheatsheets } from "../src/cheatsheets.js";
import { renderOverview, applyOverview, renderIndex } from "../src/render.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "../../test/fixtures/repo");
const sample = readFileSync(join(fixtureRoot, "cheatsheets/sample.md"), "utf8");

test("parses front matter, categories and terms", () => {
  const s = parseCheatsheet(sample, "sample.md");
  assert.equal(s.id, "sample");
  assert.deepEqual(s.tags, ["tech", "test"]);
  assert.equal(s.video, "https://youtu.be/abcdefghijk");
  assert.deepEqual(s.categories, ["레이아웃 · Layout", "계약 · Contracts"]);
  assert.deepEqual(s.terms.map((t) => t.id), ["hero-section", "bento-grid", "termination"]);
  const hero = s.terms[0]!;
  assert.deepEqual(hero.names, ["Hero Section", "히어로 섹션"]);
  assert.equal(hero.image, "../assets/sample/hero-section.svg");
  assert.deepEqual(hero.related, ["CTA", "Above the Fold"]);
  assert.equal(hero.confirm, "배경은 이미지인가요 단색인가요?");
  assert.equal(s.terms[2]!.video, "https://youtu.be/abcdefghijk?t=30");
});

test("term id comes from the English name even when Korean is first", () => {
  const t = parseCheatsheet(sample).terms.find((x) => x.names[0] === "해지")!;
  assert.equal(t.id, "termination");
});

test("github anchors match GitHub's slugger for our headings", () => {
  assert.equal(githubAnchor("Hero Section · 히어로 섹션"), "hero-section--히어로-섹션");
  assert.equal(githubAnchor("Modal / Dialog · 모달"), "modal--dialog--모달");
  assert.equal(githubAnchor("Ease-in-out · 이즈 인 아웃"), "ease-in-out--이즈-인-아웃");
  assert.equal(slugify("Modal / Dialog"), "modal-dialog");
  assert.equal(slugify("Frame Rate (FPS)"), "frame-rate-fps");
});

const broken = (mutate: (s: string) => string, re: RegExp) => assert.throws(() => parseCheatsheet(mutate(sample), "x.md"), (e: unknown) => e instanceof FormatError && re.test((e as Error).message));

test("rejects missing required fields, unknown fields, Korean-only headings, duplicates", () => {
  broken((s) => s.replace('- **AI에게 이렇게**: "기능 소개를 벤토 그리드로 배치해줘"\n', ""), /missing '- \*\*AI에게 이렇게\*\*:'/);
  broken((s) => s.replace("- **헷갈림**:", "- **메모**:"), /unknown field '메모'/);
  broken((s) => s.replace("### Bento Grid · 벤토 그리드", "### 벤토 그리드"), /needs one English name/);
  broken((s) => s.replace("### Bento Grid · 벤토 그리드", "### Hero Section · 다른 이름"), /duplicate term id 'hero-section'/);
  broken((s) => s.replace("updated: 2026-11-01", "updated: yesterday"), /YYYY-MM-DD/);
  broken((s) => s.replace("tags: [tech, test]\n", ""), /'tags' is required/);
  broken((s) => s.replace("<!-- overview:end -->", ""), /start\/end pair/);
});

test("overview grid links every term and is idempotent", () => {
  const s = parseCheatsheet(sample);
  const grid = renderOverview(s);
  for (const t of s.terms) assert.ok(grid.includes(`href="#${t.anchor}"`), t.id);
  assert.ok(grid.includes('src="../assets/sample/hero-section.svg"'));
  const once = applyOverview(s);
  assert.equal(applyOverview(parseCheatsheet(once)), once);
  assert.deepEqual(parseCheatsheet(once).terms, s.terms.map((t) => ({ ...t })));
});

test("README index lists sheets with term counts", () => {
  const idx = renderIndex([parseCheatsheet(sample)]);
  assert.match(idx, /\| \[샘플 · Sample\]\(cheatsheets\/sample\.md\) \| 시험용 시트 \| 3 \|/);
});

test("search ranks exact names first and handles Korean and spacing", () => {
  const sheets = [parseCheatsheet(sample)];
  assert.equal(searchTerms(sheets, "히어로섹션")[0]!.term.id, "hero-section");
  assert.equal(searchTerms(sheets, "bento")[0]!.term.id, "bento-grid");
  assert.equal(searchTerms(sheets, "도시락")[0]!.term.id, "bento-grid");
  assert.equal(searchTerms(sheets, "zzzz").length, 0);
  assert.equal(findTerm(sheets[0]!, "히어로 섹션")!.id, "hero-section");
  assert.equal(findTerm(sheets[0]!, "termination")!.names[0], "해지");
});

test("the real repository content parses", () => {
  const sheets = loadCheatsheets(resolve(here, "../../.."));
  assert.ok(sheets.length >= 1);
  for (const s of sheets) assert.ok(s.terms.length > 0, s.id);
});
