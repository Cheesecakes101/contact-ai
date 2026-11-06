# Motion

Animations made with code, exported to MP4/GIF. Separate from the app; nothing here is part of the Next.js build.

- `scenes/`: one HTML file per animation (`contact-ai-intro.html` is the example, `_template.html` is a starting point)
- `lib/`: the small runtime (timing, easing, preview player)
- `render.mjs`: renders a scene to video with headless Chromium + ffmpeg
- `out/`: renders (gitignored)

```bash
node motion/render.mjs motion/scenes/contact-ai-intro.html
```

Open a scene in a browser to preview it with a scrubber. In Claude Code, ask for an animation or run `/motion`. The skill lives in `.claude/skills/motion/` and is self-contained (runtime, renderer, templates); this folder is the workspace it sets up. On first use it learns your art style and saves it to `motion/STYLE.md`.

## Sharing the skill

- **Claude app (claude.ai / desktop):** zip the `.claude/skills/motion` folder (the zip must contain a `motion/` folder with `SKILL.md` inside), then go to Customize → Skills → + → Create skill → Upload a skill. To give it to others, open it there and click Share. On Team/Enterprise, an owner may need to turn on skill sharing first. Otherwise, send people the zip to upload themselves.
- **Claude Code:** anyone who clones this repo gets it automatically. To use it in every project, copy the folder to `~/.claude/skills/motion`.

Needs Node 18+, ffmpeg and Playwright (`npm i -D playwright && npx playwright install chromium`).
