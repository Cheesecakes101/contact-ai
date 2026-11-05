---
name: motion
description: Make short animations and motion graphics (product promos, explainers, animated titles, charts, UI demos) as code and export them to MP4, GIF, WebM or PNG stills. Use when the user asks for an animation, motion graphic, animated video, intro, promo clip, or to animate text, charts, shapes or UI. Not for realistic footage or people; this draws with HTML/CSS/SVG/canvas.
---

# Motion: animations as code

Every animation is one HTML file in `motion/scenes/`. It describes how the
frame looks at time `t` (seconds) through `render(t)`. The same file plays in
a browser with a scrubber, and `motion/render.mjs` steps the clock frame by
frame in headless Chromium and pipes the frames into ffmpeg.

Needs: Node 18+, ffmpeg, and Playwright with Chromium
(`npm i -D playwright && npx playwright install chromium` if it is missing).

## Workflow

1. **Plan the shots first.** Write a short shot list with timings before coding:
   e.g. `0–2.5s title · 2.4–6.5s feature A · 6.3–9.6s feature B · 9.5–11s end card`.
   Overlap shots by ~0.2s so crossfades don't dip to an empty frame.
2. **Copy the template:** `cp motion/scenes/_template.html motion/scenes/<name>.html`.
   `motion/scenes/contact-ai-intro.html` is a full worked example.
3. **Lay out everything in HTML/CSS at its final position**, then animate it
   *from* offsets in `render(t)`. Use absolute positioning on a fixed canvas
   (default 1920×1080, 30fps).
4. **Check stills at the key moments before rendering video**, then look at them:
   ```bash
   node motion/render.mjs motion/scenes/<name>.html --stills 1,3.5,6,9
   ```
   Look for clipping, overflow, text too small, things overlapping, and empty
   frames during transitions. Fix, then re-check.
5. **Render:**
   ```bash
   node motion/render.mjs motion/scenes/<name>.html                      # motion/out/<name>.mp4
   node motion/render.mjs motion/scenes/<name>.html --out motion/out/<name>.gif
   ```
   Options: `--fps 60`, `--scale 2` (4K from a 1080p scene), `--from 2 --to 5` (a slice).
   For a vertical clip, set `width: 1080, height: 1920` in the scene.
6. **Show the result.** Send the MP4/GIF to the user. Renders go to `motion/out/`,
   which is gitignored; commit scenes, not videos.

## Writing a scene

```html
<link rel="stylesheet" href="../lib/motion.css">
<div id="scene"> ...your elements... </div>
<script src="../lib/motion.js"></script>
<script>
  const { tween, progress, envelope, typed, ease, style, random } = Motion;
  Motion.mount({
    width: 1920, height: 1080, fps: 30, duration: 8,
    root: document.getElementById('scene'),
    render(t) {
      style(title, { o: progress(t, 0.2, 0.8), y: tween(t, 0.2, 1.0, 60, 0, ease.outQuint) });
    },
  });
</script>
```

Helpers on `window.Motion`:

| helper | what it returns |
| --- | --- |
| `progress(t, start, end, ease?)` | 0→1 between start and end (clamped) |
| `tween(t, start, end, from, to, ease?)` | a value moving from→to (default `ease.outCubic`) |
| `envelope(t, start, end, fadeIn, fadeOut)` | 0→1→0, for a shot's visibility |
| `typed(text, t, start, cps)` | the part of `text` typed so far |
| `style(el, {o, x, y, s, sx, sy, r, blur, origin})` | sets opacity, transform and blur in one call |
| `random(seed)` | a seeded random generator |
| `ease.*` | linear, in/out/inOut Quad, Cubic, Quint, Expo, outBack, outElastic |

### Rules (renders break without these)

- **`render(t)` must be a pure function of `t`.** No CSS `transition`/`animation`
  (motion.css turns them off), no `setTimeout`, `Date.now()` or `Math.random()`.
  Loops and wobble come from `Math.sin(t * k)`; randomness from `random(seed)`.
- Set state for *every* element on *every* frame, including after it has
  finished animating, because frames render in any order.
- Only use local or installed fonts and inline SVG. Remote assets may not load
  in the renderer. Inter and JetBrains Mono are good defaults.
- Keep text inside a ~100px safe margin.

## Making it look good

- One idea per shot. Hold each finished state for at least ~0.8s so people can read it.
- Enter with ease-out (`outQuint`, `outCubic`), leave with ease-in (`inCubic`),
  move between two states with in-out. Use `outBack` for small pops (chips, icons), not big cards.
- Stagger groups by 0.08–0.25s instead of animating them all at once.
- Combine opacity with a small move (20–80px) or slight blur/scale; avoid large slides and spins.
- Big type: 120–170px titles, 36–48px body at 1080p. Fewer words than you think.
- Keep the colours few and match the product's palette (for this app see
  `src/app/globals.css`: ink `#1b1a17`, paper `#faf8f4`, accent `#4f46e5`).
- A slow drifting background (blurred blobs, gradient) keeps static moments alive.
- Preview by opening the HTML in a browser: space plays and pauses, arrow keys step frames,
  `?t=4.2` opens paused at that time.
