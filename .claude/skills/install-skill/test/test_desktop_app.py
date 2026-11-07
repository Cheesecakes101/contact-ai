"""Tests the desktop-app steps against a pretend Claude app (runs anywhere: python test_desktop_app.py)."""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent / "scripts"


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


inst = load("install_skill")
app = load("desktop_app")
UIA = app.KIND_TO_UIA


class FakeClaudeApp:
    """Mimics the Customize > Skills pages as UI Automation would see them."""

    def __init__(self, existing=(), upload_label="Upload a skill", problem=None, extra_text=()):
        self.page, self.menu, self.dialog, self.detail = "home", None, None, None
        self.file_dialog, self.skills = False, list(existing)
        self.upload_label, self.problem, self.extra_text = upload_label, problem, list(extra_text)
        self.clicks = []

    def elements(self):
        e = [("Customize", "Hyperlink", self.go("customize"))]
        if self.page in ("customize", "skills"):
            e.append(("Skills", "TabItem", self.go("skills")))
        if self.page == "skills" and not self.detail:
            e += [("Skills", "Text", None), ("Add skill", "Button", lambda: self.set(menu="add"))]
            e += [(n, "Text", (lambda n=n: self.set(detail=n))) for n in self.skills]
            e += [(t, "Text", None) for t in self.extra_text]
        if self.detail:
            e += [(self.detail, "Text", None), ("More options", "Button", lambda: self.set(menu="more"))]
        if self.menu == "add":
            e += [("Create skill", "MenuItem", lambda: self.set(menu="create")), ("Write with Claude", "MenuItem", None)]
        if self.menu == "create":
            e.append((self.upload_label, "MenuItem", lambda: self.set(menu=None, file_dialog=True)))
        if self.menu == "more":
            e += [("Share", "MenuItem", None), ("Delete", "MenuItem", lambda: self.set(menu=None, dialog=("delete", self.detail)))]
        if self.dialog and self.dialog[0] == "delete":
            e += [(f"Delete {self.dialog[1]}? This can't be undone.", "Text", None), ("Cancel", "Button", None),
                  ("Delete", "Button", self.do_delete)]
        if self.dialog and self.dialog[0] == "upload":
            e += [(f"Selected {self.dialog[1]}", "Text", None), ("Cancel", "Button", None), ("Upload", "Button", self.do_upload)]
            if self.problem:
                e.append((self.problem, "Text", None))
        return e

    def go(self, page):
        return lambda: self.set(page=page, detail=None, menu=None)

    def set(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)

    def do_delete(self):
        self.skills.remove(self.dialog[1])
        self.dialog, self.detail = None, None

    def do_upload(self):
        if self.problem:
            return
        self.skills.append(self.dialog[1].removesuffix(".zip"))
        self.dialog = None

    # --- the WindowsUI interface ---
    def find(self, title="", kind=None, auto_id="", contains=False):
        want = UIA.get(kind, kind) if kind else None
        for el in self.elements():
            if el[0] == title and (want is None or el[1] == want):
                return el
        return None

    def click(self, el):
        self.clicks.append(el[0])
        if el[2]:
            el[2]()

    def texts(self):
        return [e[0] for e in self.elements()]

    def file_dialog_open(self):
        return self.file_dialog

    def fill_file_dialog(self, path, timeout=10):
        if not self.file_dialog:
            return False
        self.file_dialog, self.dialog = False, ("upload", Path(path).name)
        return True

    def wait_for_person_click(self, seconds=300):  # the "person" clicks the renamed button
        el = self.find(self.upload_label, "MenuItem")
        self.click(el)
        return {"title": el[0], "kind": el[1], "auto_id": ""}

    def sleep(self, s):
        pass


def run(fake, replace=False, learned=None):
    learned = learned or Path(tempfile.mkdtemp()) / "learned.json"
    failures = app.run([("motion", Path("C:/x/motion.zip"))], replace, learned,
                       inst.NAV_STEPS, inst.UPLOAD_STEPS, inst.DELETE_STEPS, ui=fake)
    return failures == 0, learned


def check(label, cond):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        check.failed = True


check.failed = False

f = FakeClaudeApp()
ok, _ = run(f)
check("fresh install", ok and f.skills == ["motion"])

f = FakeClaudeApp(existing=["motion"])
ok, _ = run(f)
check("already installed without --replace is refused", not ok and f.skills == ["motion"] and "Delete" not in f.clicks)

f = FakeClaudeApp(existing=["pdf", "motion"])
ok, _ = run(f, replace=True)
check("--replace deletes then uploads", ok and f.skills == ["pdf", "motion"] and "Delete" in f.clicks)

f = FakeClaudeApp(upload_label="Import from a file")
ok, learned = run(f)
check("renamed button: asks once and learns it", ok and json.loads(learned.read_text())["upload"]["title"] == "Import from a file")
f2 = FakeClaudeApp(upload_label="Import from a file")
f2.wait_for_person_click = lambda seconds=300: (_ for _ in ()).throw(AssertionError("asked again"))
ok, _ = run(f2, learned=learned)
check("renamed button: second run uses what it learned", ok and f2.skills == ["motion"])

f = FakeClaudeApp(problem="File too large (max 30 MB)")
ok, _ = run(f)
check("an error in the upload dialog is reported, not treated as success", not ok and "motion" not in f.skills)

f = FakeClaudeApp(extra_text=["Helps debug errors in your code"])
ok, _ = run(f)
check("old text mentioning 'error' doesn't cause a false alarm", ok and f.skills == ["motion"])

sys.exit(1 if check.failed else 0)
