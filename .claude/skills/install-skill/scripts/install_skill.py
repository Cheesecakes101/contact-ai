#!/usr/bin/env python3
"""
Install Claude skills without using any Claude usage.

    python install_skill.py path/to/skill-folder-or.zip [more ...]   # Claude app (claude.ai)
    python install_skill.py motion.zip --code                         # also into Claude Code (~/.claude/skills)
    python install_skill.py motion.zip --code-only                    # only Claude Code, no browser
    python install_skill.py motion.zip --replace                      # update: delete the old "motion" first
    python install_skill.py motion.zip --via browser                  # use a browser instead of the desktop app
    python install_skill.py --login                                   # browser only: sign in once and save the session
    python install_skill.py --forget                                  # forget learned buttons

How the Claude app part works. On Windows (default): it drives the Claude desktop
app through Windows UI Automation, using the app's existing sign-in; see
desktop_app.py (needs: pip install pywinauto pynput). Elsewhere, or with
--via browser: it opens Edge/Chrome with its own saved profile (you sign
in once by hand), goes to Customize -> Skills -> + -> Create skill -> Upload a skill,
and hands the ZIP to the file picker. Buttons are found by their labels, not screen
positions. If a button can't be found (Anthropic changed the page), it asks you to
click it once in the window and remembers your click for next time.

Needs: pip install playwright. It uses Microsoft Edge if you have it, otherwise
Google Chrome (pick one with --browser edge|chrome). If you have neither, also run:
python -m playwright install chromium
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import time
import zipfile
from pathlib import Path

HOME_DIR = Path(os.environ.get("SKILL_INSTALLER_HOME", Path.home() / ".claude-skill-installer"))
PROFILE_DIR = HOME_DIR / "browser-profile"
LEARNED_FILE = HOME_DIR / "learned-buttons.json"
LEARNED_APP_FILE = HOME_DIR / "learned-app-buttons.json"
CLAUDE_CODE_SKILLS = Path.home() / ".claude" / "skills"
BASE_URL = os.environ.get("SKILL_INSTALLER_URL", "https://claude.ai/")

# Each step lists ways to find its button, tried in order. Learned clicks are tried first.
# "optional" steps are skipped when the next step's button is already showing.
NAV_STEPS = [
    {"key": "customize", "label": "Customize", "optional": True, "find": [
        ("role", "link", "Customize"), ("role", "button", "Customize"), ("text", "Customize")]},
    {"key": "skills", "label": "Skills", "optional": True, "find": [
        ("role", "tab", "Skills"), ("role", "link", "Skills"), ("role", "button", "Skills"), ("text", "Skills")]},
]
UPLOAD_STEPS = [
    {"key": "add", "label": "+ (add skill)", "optional": True, "find": [
        ("role", "button", "+"), ("aria", "Add skill"), ("aria", "Add"), ("aria", "New skill"), ("aria", "Create")]},
    {"key": "create", "label": "Create skill", "optional": True, "find": [
        ("role", "menuitem", "Create skill"), ("role", "button", "Create skill"), ("text", "Create skill")]},
    {"key": "upload", "label": "Upload a skill", "optional": False, "find": [
        ("role", "menuitem", "Upload a skill"), ("role", "button", "Upload a skill"), ("text", "Upload a skill"),
        ("role", "menuitem", "Upload skill"), ("role", "button", "Upload skill")]},
]
# Deleting an existing skill (only with --replace). "{name}" is filled in with the skill's name.
DELETE_STEPS = [
    {"key": "open_existing", "label": "the existing skill", "optional": False, "find": [
        ("role", "link", "{name}"), ("role", "button", "{name}"), ("text", "{name}")]},
    {"key": "more", "label": "the skill's ... (more options) menu", "optional": True, "find": [
        ("aria", "More options"), ("aria", "Options"), ("aria", "More"), ("aria", "Skill options"),
        ("role", "button", "..."), ("role", "button", "\u2026")]},
    {"key": "delete", "label": "Delete", "optional": False, "find": [
        ("role", "menuitem", "Delete"), ("role", "menuitem", "Delete skill"), ("role", "button", "Delete skill"),
        ("role", "button", "Delete"), ("role", "menuitem", "Remove"), ("role", "button", "Remove")]},
]
CONFIRM_BUTTONS = ["Upload", "Upload skill", "Save", "Create", "Add", "Done"]

# Records what you click while teaching, so the button can be found again later.
RECORDER_JS = r"""
(() => {
  if (window.__skillRecorder) return; window.__skillRecorder = true;
  document.addEventListener('click', (e) => {
    if (e.target.matches && e.target.matches('input[type=file]')) return;  // the page opening its file picker, not a person
    const el = e.target.closest('button,a,[role=button],[role=menuitem],[role=tab],[role=link],[role=option],label') || e.target;
    const text = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ');
    const info = {
      tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '',
      aria: el.getAttribute('aria-label') || '', testid: el.getAttribute('data-testid') || '',
      href: el.getAttribute('href') || '', text: text.length <= 60 ? text : '',
    };
    if (window.__recordClick) window.__recordClick(info);
  }, true);
})();
"""


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


# ---------- packaging ----------

def read_skill_name(skill_md: str) -> str:
    m = re.match(r"^---\s*\n(.*?)\n---", skill_md, re.S)
    if not m:
        raise SystemExit("SKILL.md has no frontmatter (--- name: ... ---).")
    nm = re.search(r"^name:\s*['\"]?([^'\"\n]+?)['\"]?\s*$", m.group(1), re.M)
    if not nm:
        raise SystemExit("SKILL.md frontmatter has no name:.")
    return nm.group(1).strip()


def prepare(path_str: str, workdir: Path) -> tuple[str, Path, Path]:
    """Return (skill name, zip ready for upload, unpacked folder)."""
    path = Path(path_str).expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"Not found: {path}")
    unpacked = workdir / "unpacked"
    if path.is_dir():
        if not (path / "SKILL.md").exists():
            raise SystemExit(f"{path} has no SKILL.md")
        name = read_skill_name((path / "SKILL.md").read_text(encoding="utf-8"))
        src = path
    else:
        with zipfile.ZipFile(path) as z:
            for member in z.namelist():  # refuse paths that escape the folder
                if member.startswith("/") or ".." in Path(member).parts:
                    raise SystemExit(f"Unsafe path in zip: {member}")
            z.extractall(unpacked)
        found = list(unpacked.rglob("SKILL.md"))
        if len(found) != 1:
            raise SystemExit(f"Expected exactly one SKILL.md in {path.name}, found {len(found)}.")
        src = found[0].parent
        name = read_skill_name(found[0].read_text(encoding="utf-8"))

    # Claude expects a zip holding one folder named exactly like the skill.
    staged = workdir / "staged" / name
    shutil.copytree(src, staged, ignore=shutil.ignore_patterns("out", "__pycache__", ".DS_Store", "node_modules"))
    zip_path = workdir / f"{name}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(staged.rglob("*")):
            z.write(f, f.relative_to(staged.parent))
    return name, zip_path, staged


def install_claude_code(name: str, folder: Path, force: bool) -> None:
    dest = CLAUDE_CODE_SKILLS / name
    if dest.exists():
        if not force:
            log(f"Claude Code: {dest} already exists (use --force to replace).")
            return
        shutil.rmtree(dest)
    CLAUDE_CODE_SKILLS.mkdir(parents=True, exist_ok=True)
    shutil.copytree(folder, dest)
    log(f"Claude Code: installed to {dest}")


# ---------- browser ----------

def load_learned() -> dict:
    try:
        return json.loads(LEARNED_FILE.read_text())
    except Exception:
        return {}


def save_learned(data: dict) -> None:
    HOME_DIR.mkdir(parents=True, exist_ok=True)
    LEARNED_FILE.write_text(json.dumps(data, indent=2))


def locators_for(page, step: dict, learned: dict, name: str = ""):
    out = []
    rec = learned.get(step["key"])
    if step["key"] == "open_existing":
        rec = None  # learned text would be another skill's name
    if rec:
        if rec.get("testid"):
            out.append(page.get_by_test_id(rec["testid"]))
        if rec.get("aria"):
            out.append(page.locator(f'[aria-label="{rec["aria"]}"]'))
        if rec.get("href") and not rec["href"].startswith("#"):
            out.append(page.locator(f'a[href="{rec["href"]}"]'))
        if rec.get("text"):
            if rec.get("role"):
                out.append(page.get_by_role(rec["role"], name=rec["text"], exact=True))
            out.append(page.get_by_text(rec["text"], exact=True))
    for kind, *args in step["find"]:
        args = [a.replace("{name}", name) for a in args]
        if kind == "role":
            out.append(page.get_by_role(args[0], name=args[1], exact=True))
        elif kind == "aria":
            out.append(page.locator(f'[aria-label="{args[0]}" i]'))
        elif kind == "text":
            out.append(page.get_by_text(args[0], exact=True))
    return out


def visible(page, step, learned, name=""):
    for loc in locators_for(page, step, learned, name):
        try:
            first = loc.first
            if first.is_visible():
                return first
        except Exception:
            pass
    return None


def wait_visible(page, step, learned, seconds: float, name=""):
    end = time.time() + seconds
    while time.time() < end:
        el = visible(page, step, learned, name)
        if el:
            return el
        page.wait_for_timeout(250)
    return None


def teach(page, step: dict, learned: dict, clicks: list) -> None:
    """Ask the person to click the button themselves, and remember it."""
    clicks.clear()
    print(f"\n  >>> I can't find \"{step['label']}\". Please click it in the browser window. "
          f"I'll remember it for next time.", flush=True)
    end = time.time() + 300
    while time.time() < end and not clicks:
        page.wait_for_timeout(200)
    if not clicks:
        raise RuntimeError(f"Timed out waiting for a click on \"{step['label']}\".")
    learned[step["key"]] = clicks[0]
    save_learned(learned)
    log(f"Learned \"{step['label']}\": {clicks[0]}")


def ensure_logged_in(page) -> None:
    page.goto(BASE_URL, wait_until="domcontentloaded")
    page.wait_for_timeout(1500)
    if "/login" in page.url or "/signup" in page.url:
        print("\n  >>> Please sign in to Claude in the browser window. I'll continue once you're in.", flush=True)
        end = time.time() + 600
        while time.time() < end and ("/login" in page.url or "/signup" in page.url or "/magic-link" in page.url):
            page.wait_for_timeout(1000)
        if "/login" in page.url:
            raise RuntimeError("Timed out waiting for sign-in.")
        page.wait_for_timeout(2000)
        log("Signed in. The session is saved, so you won't need to do this again.")


BROWSERS = {"edge": "msedge", "chrome": "chrome", "chromium": None}


def open_browser(p, headless: bool, choice: str):
    """Open the installer's own browser window: Edge, then Chrome, then bundled Chromium."""
    exe = os.environ.get("SKILL_INSTALLER_BROWSER")
    order = [choice] if choice != "auto" else ["edge", "chrome", "chromium"]
    errors = []
    for name in order:
        profile = PROFILE_DIR.with_name(f"{PROFILE_DIR.name}-{name}")  # each browser keeps its own sign-in
        profile.mkdir(parents=True, exist_ok=True)
        kwargs = dict(user_data_dir=str(profile), headless=headless, viewport={"width": 1280, "height": 860},
                      accept_downloads=False)
        try:
            if exe:
                return p.chromium.launch_persistent_context(executable_path=exe, **kwargs)
            if BROWSERS[name]:
                kwargs["channel"] = BROWSERS[name]
            ctx = p.chromium.launch_persistent_context(**kwargs)
            log(f"using {name}")
            return ctx
        except Exception as e:
            errors.append(f"{name}: {str(e).splitlines()[0]}")
    raise SystemExit("Couldn't open a browser.\n  " + "\n  ".join(errors) +
                     "\nInstall Microsoft Edge or Google Chrome, or run: python -m playwright install chromium")


def run_steps(page, steps: list, learned: dict, clicks: list, name: str = "") -> None:
    for i, step in enumerate(steps):
        el = wait_visible(page, step, learned, 3 if step["optional"] else 6, name)
        if el is None and step["optional"]:
            # Skip if a later step's button is already on screen.
            if any(visible(page, later, learned, name) for later in steps[i + 1:]):
                log(f"skip {step['label']} (not needed)")
                continue
        if el is None:
            teach(page, step, learned, clicks)
            page.wait_for_timeout(800)
        else:
            el.click()
            log(f"clicked {step['label']}")
            page.wait_for_timeout(700)


def skill_listed(page, name: str) -> bool:
    try:
        return page.get_by_text(name, exact=True).first.is_visible()
    except Exception:
        return False


def delete_existing(page, name: str, learned: dict, clicks: list) -> None:
    log(f"\"{name}\" is already installed; deleting it first (--replace)")
    run_steps(page, DELETE_STEPS, learned, clicks, name)
    # Confirm only if the dialog names this exact skill; otherwise ask in the terminal.
    page.wait_for_timeout(600)
    dialogs = page.get_by_role("dialog")
    if dialogs.count() == 0 or not dialogs.last.is_visible():
        raise RuntimeError("No delete confirmation appeared.")
    dialog = dialogs.last
    text = dialog.inner_text()
    if not re.search(rf"\b{re.escape(name)}\b", text):
        print(f"\n  The delete dialog doesn't mention \"{name}\":\n    {text.strip()[:200]}", flush=True)
        if not sys.stdin.isatty() or input("  Delete anyway? [y/N] ").strip().lower() != "y":
            raise RuntimeError("Stopped before deleting, to be safe. Delete the old skill by hand and run again.")
    btn = None
    for label in ["Delete", "Delete skill", "Remove", "Yes, delete"]:
        b = dialog.get_by_role("button", name=label, exact=True)
        if b.count() and b.first.is_visible():
            btn = b.first
            break
    if btn is None:
        raise RuntimeError("Couldn't find the button that confirms the delete.")
    btn.click()
    log("confirmed delete")
    end = time.time() + 20
    while time.time() < end and skill_listed(page, name):
        page.wait_for_timeout(300)
    if skill_listed(page, name):
        raise RuntimeError(f"\"{name}\" still shows after deleting.")
    log(f"old \"{name}\" deleted")


def upload_one(page, name: str, zip_path: Path, learned: dict, clicks: list, replace: bool) -> bool:
    print(f"\nClaude app: installing \"{name}\"", flush=True)
    page.goto(BASE_URL, wait_until="domcontentloaded")
    page.wait_for_timeout(1500)
    run_steps(page, NAV_STEPS, learned, clicks)
    page.wait_for_timeout(1000)
    if skill_listed(page, name):
        if not replace:
            print(f"\n  \"{name}\" is already installed. Run again with --replace to update it.", flush=True)
            return False
        delete_existing(page, name, learned, clicks)

    chooser_used = {"done": False}

    def on_chooser(fc):
        fc.set_files(str(zip_path))
        chooser_used["done"] = True
    page.on("filechooser", on_chooser)

    try:
        run_steps(page, UPLOAD_STEPS, learned, clicks)

        # The file picker may open straight away, or the page may show a drop area instead.
        end = time.time() + 5
        while time.time() < end and not chooser_used["done"]:
            page.wait_for_timeout(200)
        if not chooser_used["done"]:
            inputs = page.locator('input[type="file"]')
            if inputs.count() == 0:
                print("\n  >>> Click the button that picks a file. I'll supply the ZIP.", flush=True)
                end = time.time() + 300
                while time.time() < end and not chooser_used["done"]:
                    page.wait_for_timeout(200)
            else:
                inputs.last.set_input_files(str(zip_path))
                chooser_used["done"] = True
        if not chooser_used["done"]:
            raise RuntimeError("Couldn't hand the ZIP to the page.")
        log(f"selected {zip_path.name}")

        return confirm(page, name)
    finally:
        page.remove_listener("filechooser", on_chooser)


def confirm(page, name: str) -> bool:
    end = time.time() + 90
    clicked_confirm = False
    while time.time() < end:
        page.wait_for_timeout(700)
        body = page.locator("body").inner_text(timeout=5000)
        problem = re.search(r"(already exists|failed|error|invalid|too large|doesn.t match|not allowed)[^\n]{0,120}", body, re.I)
        dialogs = page.get_by_role("dialog")
        dialog_open = dialogs.count() > 0 and dialogs.last.is_visible()
        if problem and dialog_open:
            print(f"\n  The page says: \"{problem.group(0).strip()}\"", flush=True)
            print("  Finish or cancel in the browser window if you like; close it when you're done.", flush=True)
            return False
        if not dialog_open and re.search(rf"\b{re.escape(name)}\b", body):
            log(f"\"{name}\" now shows in your skills.")
            return True
        if dialog_open and not clicked_confirm:
            for label in CONFIRM_BUTTONS:
                btn = dialogs.last.get_by_role("button", name=label, exact=True)
                if btn.count() and btn.first.is_visible() and btn.first.is_enabled():
                    btn.first.click()
                    clicked_confirm = True
                    log(f"clicked {label}")
                    break
    print("\n  I couldn't confirm it finished. Check the browser window.", flush=True)
    return False


def run_browser(jobs: list[tuple[str, Path]], login_only: bool, headless: bool, replace: bool, browser: str) -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise SystemExit("Playwright is missing. Run: pip install playwright")

    learned = load_learned()
    clicks: list = []
    failures = 0
    with sync_playwright() as p:
        ctx = open_browser(p, headless, browser)
        ctx.expose_binding("__recordClick", lambda source, info: clicks.append(info))
        ctx.add_init_script(RECORDER_JS)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        ensure_logged_in(page)
        if login_only:
            log("Signed in and saved.")
        for name, zip_path in jobs:
            try:
                if not upload_one(page, name, zip_path, learned, clicks, replace):
                    failures += 1
            except Exception as e:  # keep going with the rest
                failures += 1
                shot = HOME_DIR / f"failed-{name}.png"
                try:
                    page.screenshot(path=str(shot))
                except Exception:
                    pass
                print(f"\n  Couldn't install \"{name}\": {e}\n  Screenshot: {shot}", flush=True)
        if failures and not headless:
            if sys.stdin.isatty():
                input("\n  Press Enter to close the browser... ")
            else:  # run by Claude or another program: wait for the person to close the window
                print("\n  Close the browser window when you're done.", flush=True)
                try:
                    page.wait_for_event("close", timeout=600_000)
                except Exception:
                    pass
        ctx.close()
    return failures


def load_desktop_app():
    """Load desktop_app.py from next to this file (works even with python -I)."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("desktop_app", Path(__file__).with_name("desktop_app.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    ap = argparse.ArgumentParser(description="Install Claude skills into the Claude app and/or Claude Code.")
    ap.add_argument("paths", nargs="*", help="skill folders or .zip files")
    ap.add_argument("--code", action="store_true", help="also install into Claude Code (~/.claude/skills)")
    ap.add_argument("--code-only", action="store_true", help="only install into Claude Code, skip the Claude app")
    ap.add_argument("--force", action="store_true", help="replace an existing Claude Code skill folder")
    ap.add_argument("--replace", action="store_true", help="update: delete a Claude app skill with the same name first")
    ap.add_argument("--login", action="store_true", help="sign in once and save the session")
    ap.add_argument("--via", choices=["app", "browser"], default="app" if sys.platform == "win32" else "browser",
                    help="install through the Claude desktop app (Windows, default there) or a browser")
    ap.add_argument("--browser", choices=["auto", "edge", "chrome", "chromium"], default="auto",
                    help="which browser to use (default: Edge, then Chrome, then Chromium)")
    ap.add_argument("--forget", action="store_true", help="forget learned buttons")
    ap.add_argument("--headless", action="store_true", help=argparse.SUPPRESS)  # for testing
    a = ap.parse_args()

    if a.forget:
        LEARNED_FILE.unlink(missing_ok=True)
        print("Forgot learned buttons.")
        if not a.paths:
            return
    if not a.paths and not a.login:
        ap.print_help()
        return

    with tempfile.TemporaryDirectory() as tmp:
        jobs = []
        for i, pth in enumerate(a.paths):
            wd = Path(tmp) / str(i)
            wd.mkdir()
            name, zip_path, folder = prepare(pth, wd)
            print(f"Ready: {name}  ({zip_path.stat().st_size // 1024} KB)")
            if a.code or a.code_only:
                install_claude_code(name, folder, a.force or a.replace)
            jobs.append((name, zip_path))
        failures = 0
        if not a.code_only and jobs and a.via == "app":
            failures = load_desktop_app().run(jobs, a.replace, LEARNED_APP_FILE, NAV_STEPS, UPLOAD_STEPS, DELETE_STEPS)
        elif not a.code_only and (jobs or a.login):
            failures = run_browser(jobs, a.login, a.headless, a.replace, a.browser)
    print("\nDone." if not failures else f"\nDone, with {failures} problem(s) above.")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
