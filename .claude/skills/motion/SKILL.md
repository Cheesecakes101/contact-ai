---
name: motion
description: Make short animations and motion graphics (product promos, explainers, animated titles, charts, UI demos, social clips) as code, in the person's own art style, and export them to MP4, GIF, WebM or PNG stills. Use when someone asks for an animation, motion graphic, animated video, intro, promo clip, or to animate text, charts, shapes, illustrations or UI. Not for realistic footage or people; this draws with HTML/CSS/SVG/canvas.
---

# Motion: animations as code, in their style

Every animation is one HTML file whose look at time `t` (seconds) comes from
`render(t)`. It plays in a browser with a scrubber, and `render.mjs` steps the
clock frame by frame in headless Chromium and pipes the frames into ffmpeg.

Files next to this SKILL.md:

- `lib/motion.js`, `lib/motion.css`: the runtime (timing, easing, preview player)
- `scripts/render.mjs`: the renderer
- `templates/scene.html`: a blank scene
- `templates/STYLE.md`: the style profile template
- `examples/contact-ai-intro.html`: a full worked example. **Learn the technique from it, not the look.**

## Step 0: understand their art style first (always)

The point of this skill is that the animations look like *the person's* work,
not a generic template. So, before planning or making any animation:

1. **Look for an existing style profile**: `motion/STYLE.md` in the project, or
   a style profile file the person attached. If one exists and is confirmed, read
   it, follow it, and go to "Making an animation". If the new request clearly calls for
   something different (a new brand, a client job), ask whether to use the
   profile or start a new one, and save the new one as `motion/styles/<name>.md`.
2. **If there is no profile, this is the first run, so do style discovery now.** Do
   it before anything else, even if the request is detailed. Tell them in one line
   that you'll learn their style first so the animation doesn't come out generic.
   Then do the rest of this section.
3. **Collect references.** Ask for whatever they have, all in one message:
   - their own past work: animations, illustrations, designs, screenshots, decks, posts
   - their brand: logo, brand guide, colours, fonts, website or social links
   - things made by others that they love, and one or two they dislike
   - in one sentence, how they would describe their style

   Also look for yourself, without being asked: in a codebase, check CSS/theme
   tokens, Tailwind config, fonts, logos and images in `public/` or `assets/`, and
   any existing scenes. Look at every image and video frame you are given (for a
   video, pull a few frames with ffmpeg and view them).
4. **Analyse the references concretely.** Pull out real values, not adjectives:
   exact hex colours, type families, weights, case and tracking, corner radius,
   line weight, flat or textured, density and whitespace, composition. For motion
   references, also note pace, easing feel, how shots change, and signature moves.
   If they say "I don't have anything", infer what you can from the project and
   the request, and say what you're assuming.
5. **Ask only what the references can't answer.** Keep it to 2–4 questions and use
   a question/choice tool if you have one. Usually: motion energy (calm,
   confident, playful, frantic), where it will be shown (which sets the aspect
   ratio), and anything to avoid.
6. **Write the profile** from `templates/STYLE.md` to `motion/STYLE.md`, with
   concrete values plus a Do / Don't list. Mark guesses under "Open questions".
7. **Prove it with a style frame.** Build a 3–4 second test scene in that style
   (their name or brand, one or two signature moves), render 2–3 stills, and show
   them along with a short summary of the profile. Ask "does this feel like you?"
   and iterate on the profile until they say yes. Then set `Status: confirmed`.
8. If they say "just make it" and skip discovery, don't block them. Draft the profile
   from whatever you can see, make the animation from it, and list the assumptions
   so they can correct them. Ask again for references next time.

**Saving the profile:** in a project or repository, `motion/STYLE.md` persists, so
tell them to commit it. In a chat with no persistent files (for example the
Claude app), give them the profile as a downloadable file. If memory is available,
save a short summary there too, and ask them to attach the file next time.

Every later scene follows the profile. If their feedback on a scene changes the
style ("less bouncy", "always use the grain"), update `motion/STYLE.md` as well.

## Making an animation

1. **Set up the workspace once.** If `motion/lib/motion.js` doesn't exist in the
   project, copy `lib/` to `motion/lib/` and `scripts/render.mjs` to
   `motion/render.mjs`, and create `motion/scenes/` and `motion/out/`. Add
   `motion/out/` to `.gitignore` if there is one.
   This needs Node 18+, ffmpeg, and Playwright with Chromium
   (`npm i -D playwright && npx playwright install chromium` if missing).
2. **Plan the shots** against the style profile, with timings, before coding:
   e.g. `0–2.5s title · 2.4–6.5s feature A · 6.3–9.6s feature B · 9.5–11s end card`.
   Overlap shots by ~0.2s so crossfades don't dip to an empty frame. Tell them the plan in a few lines.
3. **Build the scene** from `templates/scene.html` into `motion/scenes/<name>.html`.
   Put the profile's colours, fonts and radii into CSS variables at the top.
   Lay everything out at its final position, then animate it *from* offsets in `render(t)`.
4. **Check stills at the key moments, and look at them**, before rendering video:
   ```bash
   node motion/render.mjs motion/scenes/<name>.html --stills 1,3.5,6,9
   ```
   Check for clipping, overflow, text that's too small, overlaps and empty transition frames,
   and ask yourself: *does this match STYLE.md, or did it drift towards generic?*
5. **Render:**
   ```bash
   node motion/render.mjs motion/scenes/<name>.html                         # motion/out/<name>.mp4
   node motion/render.mjs motion/scenes/<name>.html --out motion/out/<name>.gif
   ```
   Options: `--fps 60`, `--scale 2` (4K from a 1080p scene), `--from 2 --to 5`.
   For vertical, set `width: 1080, height: 1920` in the scene.
6. **Deliver** the MP4 (and GIF if useful). Commit scenes and STYLE.md, not renders.

**If rendering isn't possible here** (no browser or ffmpeg, and you can't install them),
still deliver the scene HTML. It plays in any browser (with `motion/lib/` beside
it), and the person can render it on their machine with the command above.

## Writing a scene

```html
<link rel="stylesheet" href="../lib/motion.css">
<div id="scene"> ...elements... </div>
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

| helper | what it returns |
| --- | --- |
| `progress(t, start, end, ease?)` | 0→1 between start and end (clamped) |
| `tween(t, start, end, from, to, ease?)` | a value moving from→to (default `ease.outCubic`) |
| `envelope(t, start, end, fadeIn, fadeOut)` | 0→1→0, for a shot's visibility |
| `typed(text, t, start, cps)` | the part of `text` typed so far |
| `style(el, {o, x, y, s, sx, sy, r, blur, origin})` | sets opacity, transform and blur in one call |
| `random(seed)` | a seeded random generator |
| `ease.*` | linear, in/out/inOut Quad, Cubic, Quint, Expo, outBack, outElastic |

Anything the browser can draw works: CSS, inline SVG (paths, masks, stroke-dashoffset for
line drawing), canvas, and SVG filters for grain or roughness. Pick whatever fits the style.

### Rules (renders break without these)

- **`render(t)` must be a pure function of `t`.** No CSS `transition`/`animation`
  (motion.css turns them off), no `setTimeout`, `Date.now()` or `Math.random()`.
  Wobble and loops come from `Math.sin(t * k)`; randomness from `random(seed)`.
  For hand-drawn "boil", step a seed: `random(Math.floor(t * 8))`.
- Set state for *every* element on *every* frame, because frames render in any order.
- Use fonts that are installed locally, or font files placed beside the scene and loaded
  with `@font-face`. Remote assets may not load in the renderer. If the person's
  font isn't available, ask for the file, or pick the closest local font and say so.
- Keep text inside the profile's safe margin (~100px at 1080p by default).

## Craft basics (the style profile wins when they conflict)

- One idea per shot. Hold each finished state for ≥0.8s so people can read it.
- Things enter with ease-out and leave with ease-in. Stagger groups by 0.08–0.25s.
- Fewer words than you think, set big enough to read on a phone.
- Even a still moment should have some motion: a slow drift, grain, or a breathing scale.
- Preview: open the HTML in a browser. Space plays and pauses, arrow keys step frames,
  and `?t=4.2` opens paused at that time.
