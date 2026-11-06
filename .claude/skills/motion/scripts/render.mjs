#!/usr/bin/env node
// Render a motion scene to video by stepping its clock frame by frame in headless
// Chromium and piping screenshots into ffmpeg.
//
//   node motion/render.mjs motion/scenes/contact-ai-intro.html            -> motion/out/contact-ai-intro.mp4
//   node motion/render.mjs <scene> --out clip.gif                         -> GIF (also .webm, .mp4)
//   node motion/render.mjs <scene> --still 3.5                            -> PNG of the frame at 3.5s
//   node motion/render.mjs <scene> --stills 0.5,2,4.2                     -> several PNGs, for checking key moments
//   options: --fps 60  --scale 2 (2x pixels)  --from 2 --to 5 (render a slice)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
  else positional.push(argv[i]);
}
const scenePath = positional[0];
if (!scenePath || !fs.existsSync(scenePath)) {
  console.error('Usage: node motion/render.mjs <scene.html> [--out file.mp4|.gif|.webm] [--still t | --stills a,b,c] [--fps n] [--scale n] [--from s] [--to s]');
  process.exit(1);
}

async function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  try { return await import('playwright'); } catch {}
  console.error('Playwright is missing. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const name = path.basename(scenePath, path.extname(scenePath));
const outDir = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(outDir, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const probe = await browser.newPage();
const url = pathToFileURL(path.resolve(scenePath)).href + '?render=1';
await probe.goto(url);
await probe.waitForFunction(() => window.__motion);
const meta = await probe.evaluate(async () => {
  await window.__motion.ready;
  const { width, height, fps, duration } = window.__motion;
  return { width, height, fps, duration };
});
await probe.close();

const scale = Number(opt.scale || 1);
const page = await browser.newPage({ viewport: { width: meta.width, height: meta.height }, deviceScaleFactor: scale });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.evaluate(() => window.__motion.ready);
const shoot = async (t) => {
  await page.evaluate((t) => window.__motion.seek(t), t);
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: meta.width, height: meta.height } });
};

if (opt.still || opt.stills) {
  const times = String(opt.still ?? opt.stills).split(',').map(Number);
  for (const t of times) {
    const out = times.length === 1 && opt.out ? opt.out : path.join(outDir, `${name}@${t.toFixed(2)}s.png`);
    fs.writeFileSync(out, await shoot(t));
    console.log(out);
  }
} else {
  const fps = Number(opt.fps || meta.fps);
  const from = Number(opt.from || 0);
  const to = Math.min(Number(opt.to || meta.duration), meta.duration);
  const frames = Math.round((to - from) * fps);
  const out = opt.out || path.join(outDir, `${name}.mp4`);
  const ext = path.extname(out).toLowerCase();
  const even = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  const encode = {
    '.mp4': ['-vf', even, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart'],
    '.webm': ['-vf', even, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-pix_fmt', 'yuv420p'],
    '.gif': ['-vf', 'fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse'],
  }[ext];
  if (!encode) { console.error(`Unsupported output type ${ext}. Use .mp4, .webm or .gif`); process.exit(1); }

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-', ...encode, out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    const buf = await shoot(from + i / fps);
    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
    if (i % fps === 0 || i === frames - 1) process.stdout.write(`\rframe ${i + 1}/${frames}`);
  }
  ff.stdin.end();
  const [code] = await once(ff, 'close');
  process.stdout.write('\n');
  if (code !== 0) { console.error('ffmpeg failed'); process.exit(1); }
  console.log(`${out}  (${meta.width * scale}x${meta.height * scale}, ${fps}fps, ${(to - from).toFixed(2)}s, rendered in ${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

await browser.close();
if (errors.length) { console.error('Page errors:\n' + errors.join('\n')); process.exit(1); }
