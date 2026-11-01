// Builds term GIFs from their animated SVG sources.
// A term whose image is `../assets/<sheet>/<term>.gif` must have `<term>.svg` next to it (the editable source).
// The SVG's CSS animations (and SMIL, if any) are sampled at FPS with headless Chrome and encoded with gifenc.
// Usage: node dist/scripts/gifs.js [sheet-id] [term-id]
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";
import gifenc from "gifenc";
import { defaultRepoRoot, loadCheatsheets, parseCheatsheet } from "../src/cheatsheets.js";
import { findChrome } from "./previews.js";

export const GIF_W = 320;
export const GIF_H = 200;
export const FPS = 10;
export const MAX_SECONDS = 6;
/** Size budget per term GIF; check.ts enforces it so pages stay light on GitHub. */
export const GIF_MAX_BYTES = 400 * 1024;

/** Page that inlines `count` copies of the SVG and freezes copy i at time i/FPS (seconds). */
function framePage(svg: string, count: number | null): string {
  const body = count === null ? `<div class="f">${svg}</div>` : Array.from({ length: count }, () => `<div class="f">${svg}</div>`).join("");
  return `<!doctype html><meta charset="utf-8"><style>*{margin:0}body{background:#0f172a;width:${GIF_W}px}.f{width:${GIF_W}px;height:${GIF_H}px;overflow:hidden}.f>svg{display:block;width:${GIF_W}px;height:${GIF_H}px}</style>${body}
<script>
const frames=[...document.querySelectorAll('.f')];
${count === null ? `
// probe: one loop length in ms (max over animations of delay + duration x (alternate ? 2 : 1))
let loop=0;
for (const a of frames[0].getAnimations({subtree:true})) {
  const t=a.effect.getTiming();
  const d=(typeof t.duration==='number'?t.duration:0)*(String(t.direction).includes('alternate')?2:1);
  loop=Math.max(loop,(t.delay||0)+d);
}
const smil=frames[0].querySelector('animate,animateTransform,animateMotion,set');
document.title='LOOP:'+Math.round(loop)+':'+(smil?1:0);
` : `
frames.forEach((f,i)=>{
  const t=i*${1000 / FPS};
  for (const a of f.getAnimations({subtree:true})) { a.pause(); a.currentTime=t; }
  const s=f.querySelector('svg'); if (s && s.pauseAnimations) { s.pauseAnimations(); s.setCurrentTime(t/1000); }
});
`}
</script>`;
}

function chromeDump(chrome: string, htmlFile: string): string {
  return execFileSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--dump-dom", `file://${htmlFile}`], { encoding: "utf8" });
}

export function loopMs(chrome: string, svg: string, work: string): number {
  const f = join(work, "probe.html");
  writeFileSync(f, framePage(svg, null));
  const m = /<title>LOOP:(\d+):(\d)<\/title>/.exec(chromeDump(chrome, f));
  if (!m) throw new Error("could not measure animation length");
  const ms = Number(m[1]);
  if (ms === 0 && m[2] === "1") return 3000; // SMIL only: sample 3 s
  return ms;
}

function renderFrames(chrome: string, svg: string, count: number, work: string): Buffer[] {
  const htmlFile = join(work, "frames.html");
  const pngFile = join(work, "frames.png");
  writeFileSync(htmlFile, framePage(svg, count));
  execFileSync(
    chrome,
    ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--virtual-time-budget=2000",
      `--window-size=${GIF_W},${GIF_H * count}`, `--screenshot=${pngFile}`, `file://${htmlFile}`],
    { stdio: "ignore" },
  );
  const png = PNG.sync.read(readFileSync(pngFile));
  if (png.height < GIF_H * count) throw new Error(`screenshot too small: ${png.width}x${png.height}`);
  return Array.from({ length: count }, (_, i) => {
    const out = Buffer.alloc(GIF_W * GIF_H * 4);
    for (let y = 0; y < GIF_H; y++) {
      const src = ((i * GIF_H + y) * png.width) * 4;
      png.data.copy(out, y * GIF_W * 4, src, src + GIF_W * 4);
    }
    return out;
  });
}

/** Encodes frames; identical consecutive frames are merged into one longer frame. */
export function encodeFrames(frames: Buffer[], frameMs: number): Uint8Array {
  const { GIFEncoder, quantize, applyPalette } = gifenc;
  const merged: { rgba: Buffer; ms: number }[] = [];
  for (const f of frames) {
    const last = merged[merged.length - 1];
    if (last && last.rgba.equals(f)) last.ms += frameMs;
    else merged.push({ rgba: f, ms: frameMs });
  }
  // one shared palette keeps colours stable between frames and the file small
  const all = Buffer.concat(merged.map((m) => m.rgba));
  const palette = quantize(new Uint8Array(all.buffer, all.byteOffset, all.length), 128);
  const gif = GIFEncoder();
  for (const m of merged) {
    const data = new Uint8Array(m.rgba.buffer, m.rgba.byteOffset, m.rgba.length);
    gif.writeFrame(applyPalette(data, palette), GIF_W, GIF_H, { palette, delay: m.ms, repeat: 0 });
  }
  gif.finish();
  return gif.bytes();
}

export function buildGif(chrome: string, svgPath: string, work: string): { bytes: Uint8Array; frames: number; ms: number } {
  const svg = readFileSync(svgPath, "utf8").replace(/<\?xml[^>]*>/, "");
  if (!/viewBox="0 0 320 200"/.test(svg)) throw new Error(`${svgPath}: viewBox must be 0 0 320 200`);
  const loop = Math.min(MAX_SECONDS * 1000, Math.max(1000, loopMs(chrome, svg, work) || 2000));
  const count = Math.max(2, Math.round((loop / 1000) * FPS));
  const frames = renderFrames(chrome, svg, count, work);
  return { bytes: encodeFrames(frames, 1000 / FPS), frames: count, ms: loop };
}

const isMain = process.argv[1]?.endsWith("gifs.js");
if (isMain) {
  const root = defaultRepoRoot();
  const [onlySheet, onlyTerm] = process.argv.slice(2);
  const chrome = findChrome();
  const work = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "gifs-"));
  let built = 0;
  // with a sheet id only that file is parsed, so half-written sheets of parallel writers do not break the build
  const sheets = onlySheet ? [parseCheatsheet(readFileSync(join(root, "cheatsheets", `${onlySheet}.md`), "utf8"), `cheatsheets/${onlySheet}.md`)] : loadCheatsheets(root);
  for (const sheet of sheets) {
    for (const t of sheet.terms) {
      if (!t.image?.endsWith(".gif") || (onlyTerm && t.id !== onlyTerm)) continue;
      const gifPath = resolve(root, "cheatsheets", t.image);
      const svgPath = gifPath.replace(/\.gif$/, ".svg");
      if (!existsSync(svgPath)) throw new Error(`${t.image}: source ${svgPath.slice(root.length + 1)} is missing`);
      const { bytes, frames, ms } = buildGif(chrome, svgPath, work);
      writeFileSync(gifPath, bytes);
      built++;
      const kb = bytes.length / 1024;
      console.log(`${gifPath.slice(root.length + 1)}  ${frames} frames  ${(ms / 1000).toFixed(1)}s  ${kb.toFixed(0)} KB${bytes.length > GIF_MAX_BYTES ? "  ✗ over budget" : ""}`);
    }
  }
  console.log(`${built} gif(s) built`);
}
