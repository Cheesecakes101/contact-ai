"""
Upload a skill through the Claude desktop app on Windows.

It finds the app's buttons by name through Windows UI Automation (the system
screen readers use), so it works with the app's existing sign-in: no browser,
no captcha. The mouse moves on its own while it runs; don't touch it.

Needs: pip install pywinauto pynput
"""
from __future__ import annotations

import ctypes
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

KIND_TO_UIA = {"button": "Button", "link": "Hyperlink", "menuitem": "MenuItem", "tab": "TabItem"}
CONFIRM_BUTTONS = ["Upload", "Upload skill", "Save", "Create"]
PROBLEM_RE = re.compile(r"(already exists|failed|error|invalid|too large|doesn.t match|not allowed)", re.I)


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


# ---------- real Windows backend ----------

def _exe_of_pid(pid: int) -> str:
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    h = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not h:
        return ""
    try:
        buf = ctypes.create_unicode_buffer(32768)
        size = ctypes.c_ulong(len(buf))
        ok = ctypes.windll.kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size))
        return buf.value if ok else ""
    finally:
        ctypes.windll.kernel32.CloseHandle(h)


def _find_claude_exe() -> str | None:
    local = os.environ.get("LOCALAPPDATA", "")
    for p in [Path(local) / "AnthropicClaude" / "claude.exe", Path(local) / "Programs" / "Claude" / "Claude.exe"]:
        if p.exists():
            return str(p)
    return None


class WindowsUI:
    """Talks to the Claude desktop app through pywinauto (UI Automation)."""

    def __init__(self):
        try:
            from pywinauto import Desktop
        except ImportError:
            raise SystemExit("pywinauto is missing. Run: pip install pywinauto pynput")
        self.Desktop = Desktop
        self.win = None

    def _claude_windows(self):
        out = []
        for w in self.Desktop(backend="uia").windows():
            try:
                exe = os.path.basename(_exe_of_pid(w.process_id())).lower()
                if exe == "claude.exe" and w.is_visible() and "claude" in w.window_text().lower():
                    out.append(w)
            except Exception:
                pass
        return out

    def connect(self) -> None:
        wins = self._claude_windows()
        if not wins:
            exe = _find_claude_exe()
            if not exe:
                raise RuntimeError("Open the Claude desktop app and sign in, then run this again.")
            log("starting the Claude app")
            subprocess.Popen([exe])
            end = time.time() + 30
            while time.time() < end and not wins:
                time.sleep(1)
                wins = self._claude_windows()
            if not wins:
                raise RuntimeError("The Claude app didn't open a window. Open it yourself, then run this again.")
            time.sleep(4)
        self.win = wins[0]
        try:
            if self.win.is_minimized():
                self.win.restore()
        except Exception:
            pass
        self.win.set_focus()
        # Chromium-based apps build their accessibility tree on first request; give it a moment.
        for _ in range(10):
            if len(self.win.descendants()) > 30:
                break
            time.sleep(0.5)
        if len(self.win.descendants()) <= 30:
            raise RuntimeError(
                "Windows can't see the Claude app's buttons. Quit Claude fully (also from the tray icon), "
                "then start it with:  \"%s\" --force-renderer-accessibility" % (_find_claude_exe() or "claude.exe"))
        log("connected to the Claude app")

    def find(self, title: str = "", kind: str | None = None, auto_id: str = "", contains: bool = False):
        kw = {}
        if auto_id:
            kw["auto_id"] = auto_id
        elif contains:
            kw["title_re"] = ".*" + re.escape(title) + ".*"
        else:
            kw["title"] = title
        if kind:
            kw["control_type"] = KIND_TO_UIA.get(kind, kind)
        spec = self.win.child_window(found_index=0, **kw)
        try:
            if spec.exists(timeout=0):
                el = spec.wrapper_object()
                if el.is_visible():
                    return el
        except Exception:
            pass
        return None

    def click(self, el) -> None:
        self.win.set_focus()
        el.click_input()

    def texts(self) -> list[str]:
        out = []
        for d in self.win.descendants():
            try:
                t = d.window_text()
                if t:
                    out.append(t)
            except Exception:
                pass
        return out

    def file_dialog_open(self) -> bool:
        return self.Desktop(backend="uia").window(class_name="#32770", found_index=0).exists(timeout=0)

    def fill_file_dialog(self, path: str, timeout: float = 10) -> bool:
        dlg = self.Desktop(backend="uia").window(class_name="#32770", found_index=0)
        if not dlg.exists(timeout=timeout):
            return False
        dlg.set_focus()
        # 1148 is the "File name" box and 1 the Open button, in every Windows language.
        name_box = dlg.child_window(auto_id="1148", control_type="Edit")
        name_box.set_edit_text(path)
        time.sleep(0.3)
        open_btn = dlg.child_window(auto_id="1", control_type="Button")
        if open_btn.exists(timeout=1):
            open_btn.click_input()
        else:
            name_box.type_keys("{ENTER}")
        end = time.time() + 5
        while time.time() < end and dlg.exists(timeout=0):
            time.sleep(0.2)
        return not dlg.exists(timeout=0)

    def wait_for_person_click(self, seconds: float = 300) -> dict | None:
        """Wait for one left click and describe the element under it."""
        try:
            from pynput import mouse
        except ImportError:
            raise SystemExit("pynput is missing. Run: pip install pywinauto pynput")
        spot = {}

        def on_click(x, y, button, pressed):
            if pressed and button == mouse.Button.left:
                spot["xy"] = (x, y)
                return False
        with mouse.Listener(on_click=on_click) as listener:
            listener.join(seconds)
        if "xy" not in spot:
            return None
        info = self.Desktop(backend="uia").from_point(*spot["xy"]).element_info
        return {"title": info.name or "", "kind": info.control_type or "", "auto_id": info.automation_id or ""}

    def sleep(self, s: float) -> None:
        time.sleep(s)


# ---------- the steps (backend-independent, so they can be tested) ----------

class AppInstaller:
    def __init__(self, ui, learned_file: Path, nav, upload, delete):
        self.ui, self.learned_file = ui, learned_file
        self.nav, self.upload, self.delete = nav, upload, delete
        try:
            self.learned = json.loads(learned_file.read_text())
        except Exception:
            self.learned = {}

    def _save(self):
        self.learned_file.parent.mkdir(parents=True, exist_ok=True)
        self.learned_file.write_text(json.dumps(self.learned, indent=2))

    def locate(self, step: dict, name: str = ""):
        rec = self.learned.get(step["key"]) if step["key"] != "open_existing" else None
        if rec:
            el = self.ui.find(rec.get("title", ""), rec.get("kind") or None, rec.get("auto_id", ""))
            if el:
                return el
        for kind, *args in step["find"]:
            args = [a.replace("{name}", name) for a in args]
            if kind == "role":
                el = self.ui.find(args[1], args[0])
            else:  # "aria" and "text" are both just names to UI Automation
                el = self.ui.find(args[0])
            if el:
                return el
        return None

    def wait_locate(self, step, seconds, name=""):
        end = time.time() + seconds
        while True:
            el = self.locate(step, name)
            if el or time.time() >= end:
                return el
            self.ui.sleep(0.4)

    def teach(self, step):
        print(f"\n  >>> I can't find \"{step['label']}\" in the Claude app. Please click it yourself. "
              f"I'll remember it for next time.", flush=True)
        rec = self.ui.wait_for_person_click()
        if not rec:
            raise RuntimeError(f"Timed out waiting for a click on \"{step['label']}\".")
        if rec.get("title") or rec.get("auto_id"):
            self.learned[step["key"]] = rec
            self._save()
            log(f"Learned \"{step['label']}\": {rec}")

    def run_steps(self, steps, name=""):
        for i, step in enumerate(steps):
            el = self.wait_locate(step, 3 if step["optional"] else 6, name)
            if el is None and step["optional"] and any(self.locate(s, name) for s in steps[i + 1:]):
                log(f"skip {step['label']} (not needed)")
                continue
            if el is None:
                self.teach(step)
            else:
                self.ui.click(el)
                log(f"clicked {step['label']}")
            self.ui.sleep(0.9)

    def listed(self, name: str) -> bool:
        return self.ui.find(name) is not None

    def delete_existing(self, name: str) -> None:
        log(f"\"{name}\" is already installed; deleting it first (--replace)")
        self.run_steps(self.delete, name)
        self.ui.sleep(0.8)
        texts = self.ui.texts()
        named = any(name in t and re.search(r"delet|remov", t, re.I) for t in texts)
        if not named:
            print(f"\n  The delete confirmation doesn't mention \"{name}\".", flush=True)
            if not sys.stdin.isatty() or input("  Delete anyway? [y/N] ").strip().lower() != "y":
                raise RuntimeError("Stopped before deleting, to be safe. Delete the old skill by hand and run again.")
        btn = None
        for label in ["Delete", "Delete skill", "Remove", "Yes, delete"]:
            btn = self.ui.find(label, "button")
            if btn:
                break
        if not btn:
            raise RuntimeError("Couldn't find the button that confirms the delete.")
        self.ui.click(btn)
        log("confirmed delete")
        end = time.time() + 20
        while time.time() < end and self.listed(name):
            self.ui.sleep(0.5)
        if self.listed(name):
            raise RuntimeError(f"\"{name}\" still shows after deleting.")
        log(f"old \"{name}\" deleted")

    def install(self, name: str, zip_path: Path, replace: bool) -> bool:
        print(f"\nClaude app: installing \"{name}\"", flush=True)
        self.run_steps(self.nav)
        self.ui.sleep(1.2)
        if self.listed(name):
            if not replace:
                print(f"\n  \"{name}\" is already installed. Run again with --replace to update it.", flush=True)
                return False
            self.delete_existing(name)
            self.run_steps(self.nav)  # back to the skills list if deleting moved elsewhere

        before = set(self.ui.texts())  # so old text (e.g. another skill's description) isn't read as an error
        self.run_steps(self.upload)
        if self.ui.fill_file_dialog(str(zip_path)):
            log(f"selected {zip_path.name}")
        else:
            print(f"\n  >>> Couldn't fill in the file picker. Pick this file yourself:\n      {zip_path}", flush=True)
            end = time.time() + 300
            while time.time() < end and not self.ui.file_dialog_open():
                self.ui.sleep(0.5)
            while time.time() < end and self.ui.file_dialog_open():
                self.ui.sleep(0.5)
        return self.confirm(name, before)

    def confirm(self, name: str, before: set) -> bool:
        end = time.time() + 90
        clicked = False
        while time.time() < end:
            self.ui.sleep(1.5)
            pending = None
            for label in CONFIRM_BUTTONS:
                pending = self.ui.find(label, "button")
                if pending:
                    break
            texts = self.ui.texts()
            problem = next((t for t in texts if t not in before and PROBLEM_RE.search(t) and len(t) < 200), None)
            if problem and pending:
                print(f"\n  The app says: \"{problem}\"\n  Finish or cancel in the Claude app.", flush=True)
                return False
            if not pending and name in texts:
                log(f"\"{name}\" now shows in your skills.")
                return True
            if pending and not clicked:
                self.ui.click(pending)
                clicked = True
                log("clicked confirm")
        print("\n  I couldn't confirm it finished. Check the Claude app.", flush=True)
        return False


def run(jobs, replace: bool, learned_file: Path, nav, upload, delete, ui=None) -> int:
    if ui is None:
        if sys.platform != "win32":
            raise SystemExit("Driving the desktop app only works on Windows. Use --via browser.")
        ui = WindowsUI()
        print("\nUsing the Claude desktop app. Don't touch the mouse or keyboard until it's done.", flush=True)
        ui.connect()
    inst = AppInstaller(ui, learned_file, nav, upload, delete)
    failures = 0
    for name, zip_path in jobs:
        try:
            if not inst.install(name, zip_path, replace):
                failures += 1
        except Exception as e:
            failures += 1
            print(f"\n  Couldn't install \"{name}\": {e}", flush=True)
    return failures
