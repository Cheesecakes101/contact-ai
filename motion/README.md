# Motion

Animations made with code, exported to MP4/GIF. Separate from the app; nothing here is part of the Next.js build.

- `scenes/`: one HTML file per animation (`contact-ai-intro.html` is the example, `_template.html` is a starting point)
- `lib/`: the small runtime (timing, easing, preview player)
- `render.mjs`: renders a scene to video with headless Chromium + ffmpeg
- `out/`: renders (gitignored)

```bash
node motion/render.mjs motion/scenes/contact-ai-intro.html
```

Open a scene in a browser to preview it with a scrubber. In Claude Code, ask for an animation or run `/motion`; the skill in `.claude/skills/motion/SKILL.md` has the full guide.

Needs Node 18+, ffmpeg and Playwright (`npm i -D playwright && npx playwright install chromium`).
