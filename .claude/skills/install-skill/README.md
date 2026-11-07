# install-skill

A skill plus a Python script that installs Claude skills for you.

- **Claude app**: clicks Customize → Skills → + → Create skill → Upload a skill and fills in the file picker.
  On Windows it drives the **Claude desktop app** itself, using the app's sign-in, so there's no browser
  and no captcha (`pip install pywinauto pynput`). Elsewhere, or with `--via browser`, it uses Edge or Chrome
  (`pip install playwright`). Skills you add here show up in claude.ai and the phone app too.
- **Claude Code**: copies the skill into `~/.claude/skills/`.

Ask Claude Code on your laptop to "install this skill", or run the script yourself
(no Claude usage):

```bash
pip install pywinauto pynput
```

```bash
python3 scripts/install_skill.py ~/Downloads/some-skill.zip --code
```

```bash
python3 scripts/install_skill.py ~/Downloads/motion-skill.zip --replace
```

- Keep the Claude desktop app open and signed in, and don't touch the mouse while it runs.
- `--via browser` uses a browser instead, and `--login` signs in to it once.
- `--code` also installs into Claude Code.
- `--replace` updates a skill you already have.

It uses Microsoft Edge, or Chrome if there's no Edge (`--browser edge|chrome` to choose). On Windows, type `python` instead of `python3`.

Buttons are found by their labels. If Anthropic changes the page, the script asks you
to click the button once and remembers it (`--forget` clears this). With `--replace`,
it only confirms a delete if the dialog names that exact skill.

Tests: `python test/test_desktop_app.py` checks the desktop-app steps against a pretend app (runs anywhere).
`test/mock-claude.html` is a stand-in page for browser mode:

```bash
SKILL_INSTALLER_URL="file://$PWD/test/mock-claude.html?existing=motion" python3 scripts/install_skill.py ../motion --replace
```
