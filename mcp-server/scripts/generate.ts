// Regenerates the overview grids in cheatsheets/*.md and the domain index in README.md.
// Usage: node dist/scripts/generate.js [sheet-id]   (with an id, only that sheet's overview)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultRepoRoot, loadCheatsheets, parseCheatsheet } from "../src/cheatsheets.js";
import { applyOverview, renderIndex, replaceBetween, INDEX_START, INDEX_END } from "../src/render.js";

const root = defaultRepoRoot();
const only = process.argv[2];
const sheets = only
  ? [parseCheatsheet(readFileSync(join(root, "cheatsheets", `${only}.md`), "utf8"), `cheatsheets/${only}.md`)]
  : loadCheatsheets(root);
let changed = 0;
for (const sheet of sheets) {
  const next = applyOverview(sheet);
  if (next !== sheet.markdown) {
    writeFileSync(join(root, sheet.file), next);
    changed++;
    console.log(`updated ${sheet.file}`);
  }
}
if (!only) {
  const readmePath = join(root, "README.md");
  const readme = readFileSync(readmePath, "utf8");
  const nextReadme = replaceBetween(readme, INDEX_START, INDEX_END, renderIndex(sheets), "README.md");
  if (nextReadme !== readme) {
    writeFileSync(readmePath, nextReadme);
    changed++;
    console.log("updated README.md");
  }
}
console.log(`${sheets.length} sheet(s), ${changed} file(s) changed`);
