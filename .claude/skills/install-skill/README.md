# install-skill

A skill plus a Python script that installs Claude skills for you.

- **Claude app** (claude.ai, which is also where the desktop and phone apps get skills): opens its own Edge window (or Chrome) and clicks
  Customize → Skills → + → Create skill → Upload a skill, then hands over the ZIP.
- **Claude Code**: copies the skill into `~/.claude/skills/`.

Ask Claude Code on your laptop to "install this skill", or run the script yourself
(no Claude usage):

```bash
pip install playwright
```

```bash
python3 scripts/install_skill.py --login
```

```bash
python3 scripts/install_skill.py ~/Downloads/some-skill.zip --code
```

```bash
python3 scripts/install_skill.py ~/Downloads/motion-skill.zip --replace
```

- `--login` signs in once. The session is saved in `~/.claude-skill-installer/`.
- `--code` also installs into Claude Code.
- `--replace` updates a skill you already have.

It uses Microsoft Edge, or Chrome if there's no Edge (`--browser edge|chrome` to choose). On Windows, type `python` instead of `python3`.

Buttons are found by their labels. If Anthropic changes the page, the script asks you
to click the button once and remembers it (`--forget` clears this). With `--replace`,
it only confirms a delete if the dialog names that exact skill.

`test/mock-claude.html` is a stand-in for the skills page, used for testing:

```bash
SKILL_INSTALLER_URL="file://$PWD/test/mock-claude.html?existing=motion" python3 scripts/install_skill.py ../motion --replace
```
