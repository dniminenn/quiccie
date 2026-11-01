#!/usr/bin/env python3
"""Export committed source. Exclude local files and Git metadata."""
import argparse
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--denylist', help='Private terms file for the source audit')
args = parser.parse_args()
audit_args = ['--denylist', args.denylist] if args.denylist else []
subprocess.run([sys.executable, str(ROOT / 'scripts/audit-public.py'), *audit_args], cwd=ROOT, check=True)
changed = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=ROOT)
if changed.strip():
    raise SystemExit('Commit the reviewed source before export.')
output = ROOT / 'dist/quiccie-source.tar.gz'
output.parent.mkdir(exist_ok=True)
subprocess.run(['git', 'archive', '--format=tar.gz', '--prefix=quiccie/', '-o', str(output), 'HEAD'], cwd=ROOT, check=True)
print(output)
