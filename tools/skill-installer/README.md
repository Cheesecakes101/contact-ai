# Skill installer

Installs Claude skills for you, without using Claude usage.

- **Claude app** (claude.ai, which is also where the desktop and phone apps get skills): opens Chrome and clicks
  Customize → Skills → + → Create skill → Upload a skill, then hands over the ZIP.
- **Claude Code**: copies the skill into `~/.claude/skills/` (with `--code`).

## One-time setup

```bash
pip install playwright
```

If you don't have Google Chrome, also run `python -m playwright install chromium`.

```bash
python install_skill.py --login
```

A Chrome window opens. Sign in to Claude there once. The session is saved in
`~/.claude-skill-installer/`, so later runs skip sign-in. The script never sees your password.

## Installing skills

```bash
python install_skill.py ~/Downloads/motion-skill.zip
```

- Pass a `.zip` or a skill folder. Several at once works too.
- `--code` also installs into Claude Code, and `--code-only` skips the browser.
- `--force` replaces an existing Claude Code copy.

## When Anthropic changes the page

Buttons are found by their labels, not by screen position. If one can't be found,
the script asks you to click it once in the window and remembers your click in
`~/.claude-skill-installer/learned-buttons.json`. `--forget` clears what it learned.

If something else goes wrong, it saves a screenshot to `~/.claude-skill-installer/`
and leaves the window open so you can finish by hand.

`test/mock-claude.html` is a stand-in for the skills page, used for testing.
