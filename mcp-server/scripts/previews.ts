// Builds one animated GIF per cheatsheet (assets/previews/<id>.gif) for the README table.
// Each frame is one term card: its illustration (or a text card when it has none) plus its names.
// Needs a Chromium/Chrome binary: CHROME_BIN, or chromium / google-chrome on PATH, or Playwright's headless shell.
// Usage: node dist/scripts/previews.js [sheet-id]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";
import gifenc from "gifenc";
import { defaultRepoRoot, loadCheatsheets, type Cheatsheet, type Term } from "../src/cheatsheets.js";
import { plain } from "../src/render.js";

export const FRAME_W = 320;
export const FRAME_H = 240;
const TERM_DELAY_MS = 1100;
const TITLE_DELAY_MS = 1800;

function findChrome(): string {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    try {
      return execFileSync("which", [name], { encoding: "utf8" }).trim();
    } catch {
      /* next */
    }
  }
  const pw = join(homedir(), ".cache", "ms-playwright");
  if (existsSync(pw)) {
    for (const dir of readdirSync(pw).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse()) {
      const bin = join(pw, dir, "chrome-headless-shell-linux64", "chrome-headless-shell");
      if (existsSync(bin)) return bin;
    }
  }
  throw new Error("Chrome not found: set CHROME_BIN");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function svgDataUri(root: string, sheet: Cheatsheet, image: string): string {
  const file = resolve(root, "cheatsheets", image);
  return `data:image/svg+xml;base64,${readFileSync(file).toString("base64")}`;
}

function termFrame(root: string, sheet: Cheatsheet, t: Term): string {
  const [primary, ...rest] = t.names;
  const art = t.image
    ? `<img src="${svgDataUri(root, sheet, t.image)}" width="320" height="200">`
    : `<div class="text"><div class="cat">${esc(t.category)}</div><div class="big">${esc(primary!)}</div><div class="def">${esc(plain(t.definition))}</div></div>`;
  return `<div class="f">${art}<div class="cap"><b>${esc(primary!)}</b>${rest.length ? ` <span>${esc(rest.join(" · "))}</span>` : ""}</div></div>`;
}

function titleFrame(sheet: Cheatsheet): string {
  return `<div class="f title"><div class="k">Domain Cheatsheets</div><div class="t">${esc(sheet.title)}</div><div class="e">${esc(sheet.titleEn)}</div><div class="n">용어 ${sheet.terms.length}개 · ${esc(sheet.categories.map((c) => c.split(" · ")[0]).join(" / "))}</div></div>`;
}

function page(frames: string[]): string {
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{word-break:keep-all;overflow-wrap:anywhere;background:#0f172a;width:${FRAME_W}px;font-family:system-ui,"Noto Sans CJK KR","Noto Sans KR",sans-serif;color:#e2e8f0}
.f{width:${FRAME_W}px;height:${FRAME_H}px;overflow:hidden;background:#0f172a;position:relative}
.f img{display:block}
.cap{height:40px;padding:0 14px;display:flex;align-items:center;gap:6px;background:#1e293b;border-top:2px solid #f59e0b;font-size:14px;white-space:nowrap;overflow:hidden}
.cap span{color:#94a3b8;font-size:12px}
.text{height:200px;padding:18px 18px 0;display:flex;flex-direction:column;gap:8px}
.text .cat{font-size:11px;color:#38bdf8}
.text .big{font-size:22px;font-weight:700;color:#f59e0b;line-height:1.2}
.text .def{font-size:13px;line-height:1.5;color:#cbd5e1;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.title{display:flex;flex-direction:column;justify-content:center;padding:0 24px;gap:6px;border:2px solid #334155;border-radius:12px}
.title .k{font-size:11px;letter-spacing:.08em;color:#38bdf8;text-transform:uppercase}
.title .t{font-size:30px;font-weight:800;color:#f59e0b}
.title .e{font-size:15px;color:#e2e8f0}
.title .n{font-size:12px;color:#94a3b8;margin-top:6px}
</style>${frames.join("")}`;
}

/** Renders all frames of one sheet in a single tall screenshot and slices it. */
function renderFrames(chrome: string, html: string, count: number, work: string): Buffer[] {
  const htmlFile = join(work, "frames.html");
  const pngFile = join(work, "frames.png");
  writeFileSync(htmlFile, html);
  execFileSync(
    chrome,
    ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-prefers-reduced-motion", "--force-device-scale-factor=1",
      `--window-size=${FRAME_W},${FRAME_H * count}`, `--screenshot=${pngFile}`, `file://${htmlFile}`],
    { stdio: "ignore" },
  );
  const png = PNG.sync.read(readFileSync(pngFile));
  if (png.width < FRAME_W || png.height < FRAME_H * count) throw new Error(`screenshot too small: ${png.width}x${png.height}`);
  const frames: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    const out = Buffer.alloc(FRAME_W * FRAME_H * 4);
    for (let y = 0; y < FRAME_H; y++) {
      const src = ((i * FRAME_H + y) * png.width) * 4;
      png.data.copy(out, y * FRAME_W * 4, src, src + FRAME_W * 4);
    }
    frames.push(out);
  }
  return frames;
}

export function encodeGif(frames: Buffer[], delays: number[]): Uint8Array {
  const { GIFEncoder, quantize, applyPalette } = gifenc;
  const gif = GIFEncoder();
  frames.forEach((rgba, i) => {
    const data = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.length);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), FRAME_W, FRAME_H, { palette, delay: delays[i], repeat: 0 });
  });
  gif.finish();
  return gif.bytes();
}

const isMain = process.argv[1]?.endsWith("previews.js");
if (isMain) {
  const root = defaultRepoRoot();
  const only = process.argv[2];
  const chrome = findChrome();
  const outDir = join(root, "assets", "previews");
  mkdirSync(outDir, { recursive: true });
  const work = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "previews-"));
  for (const sheet of loadCheatsheets(root).filter((s) => !only || s.id === only)) {
    const frames = [titleFrame(sheet), ...sheet.terms.map((t) => termFrame(root, sheet, t))];
    const rgba = renderFrames(chrome, page(frames), frames.length, work);
    const bytes = encodeGif(rgba, [TITLE_DELAY_MS, ...sheet.terms.map(() => TERM_DELAY_MS)]);
    writeFileSync(join(outDir, `${sheet.id}.gif`), bytes);
    console.log(`assets/previews/${sheet.id}.gif  ${frames.length} frames  ${(bytes.length / 1024).toFixed(0)} KB`);
  }
}
