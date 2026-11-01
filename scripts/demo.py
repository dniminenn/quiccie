#!/usr/bin/env python3
"""Run Quiccie with temporary synthetic data on localhost."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PASSWORD = "quiccie-test-password"
NOTES = {
    "Home Lab/Overview/Service Map.md": """---
tags: [home, systems]
status: current
---
# Service Map

A small system should be easy to understand.
Keep each service independent. Keep a tested copy of its data.

## Services

| Service | Purpose | State |
| --- | --- | --- |
| Notes | Keep ideas and project records | Ready |
| Files | Store shared documents | Ready |
| Backup | Keep a second copy | Verified |

## Operating rules

- Keep the service map current.
- Test each change before release.

## Weekly checks

- [x] Test the latest backup.
- [x] Review available disk space.
- [ ] Update the service records.

> [!tip] Start with the map
> Follow the links before you change a service.

See [[Backup checklist]] for the next review.
""",
    "Home Lab/Operations/Backup checklist.md": "# Backup checklist\n\nKeep a copy that you can restore.\n\n1. Select a recent backup.\n2. Restore it to a test folder.\n3. Compare the file count.\n4. Record the result.\n",
    "Projects/Field Guide/Overview.md": "# Field Guide\n\nA place for useful observations.\n\n## This week\n\n- Collect three examples.\n- Test each instruction.\n- Publish the first draft.\n\n## Next step\n\nWrite one page that helps someone start.\n",
    "Projects/Field Guide/Research/Reading list.md": "# Reading list\n\nRead with a question in mind.\n\n- What does the reader need?\n- Which example explains the task?\n- What can we remove?\n",
    "Ideas/A quieter workspace.md": "# A quieter workspace\n\nGive each project a clear home.\nKeep reference notes near the work.\n\n## Small changes\n\n- Use short names.\n- Keep one inbox.\n- Review it each Friday.\n",
    "Journal/Week in review.md": "# Week in review\n\n## What worked\n\nShort notes made it easier to resume work.\n\n## What comes next\n\nFinish the field guide and test the backup plan.\n",
    "Work/Projects/Website/Launch plan.md": "# Launch plan\n\n## Before release\n\n- [x] Review the content.\n- [ ] Check keyboard navigation.\n- [ ] Test the small screen layout.\n\nKeep the release small and easy to verify.\n",
    "Agent Memory/global/Preferences.md": "# Preferences\n\nUse short instructions. Keep notes separate from agent memory.\n",
    "Agent Memory/projects/sample-project/services/Notes service.md": "# Notes service\n\nThis synthetic project uses one local test server.\n",
    "Work/Agent Memory/projects/sample-work/project/Release checks.md": "# Release checks\n\nRun the checks before release. Keep private data out of screenshots.\n",
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18090)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Use a port from 1024 to 65535.")
    with tempfile.TemporaryDirectory(prefix="quiccie-demo-") as tmp:
        work = Path(tmp)
        vault = work / "vault"
        for name, content in NOTES.items():
            target = vault / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
        registry = {"version": 1, "projects": {"global": {"space": "personal"}, "work": {"space": "work"}, "sample-project": {"space": "personal"}, "sample-work": {"space": "work"}}}
        (work / "registry.json").write_text(json.dumps(registry))
        binary = str(work / "quiccie")
        subprocess.run(["go", "build", "-o", binary, "./cmd/quiccie"], cwd=ROOT, env={**os.environ, "CGO_ENABLED": "0"}, check=True)
        password_hash = subprocess.check_output([binary, "-mode", "hash-password"], input=(PASSWORD + "\n").encode())
        (work / "password.hash").write_bytes(password_hash)
        (work / "password.hash").chmod(0o600)
        common = [binary, "-db", str(work / "demo.db")]
        subprocess.run(common + ["-mode", "import", "-vault", str(vault), "-registry", str(work / "registry.json")], check=True)
        print(f"Synthetic demo: http://127.0.0.1:{args.port}\nAccount: owner\nPassword: {PASSWORD}\nPress Ctrl+C to remove the temporary data.", flush=True)
        child = subprocess.Popen(common + ["-listen", f"127.0.0.1:{args.port}", "-mcp-listen", "127.0.0.1:0", "-password-hash-file", str(work / "password.hash"), "-web", str(ROOT / "web/dist")])
        def stop(signum, frame):
            child.terminate()
        signal.signal(signal.SIGINT, stop)
        signal.signal(signal.SIGTERM, stop)
        try:
            status = child.wait()
            if status:
                raise SystemExit(status)
        finally:
            if child.poll() is None:
                child.terminate()
                child.wait()

if __name__ == "__main__":
    main()
