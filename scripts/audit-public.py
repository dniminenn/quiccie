#!/usr/bin/env python3
"""Check tracked source for common private data. Inspect images separately."""
import argparse
import pathlib
import re
import struct
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]


def audit(denylist=None):
    terms = []
    if denylist:
        terms = [s.strip().lower() for s in pathlib.Path(denylist).read_text().splitlines() if s.strip()]
    paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    errors = []
    patterns = [
        re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
        re.compile(rb'gh[pousr]_[A-Za-z0-9]{30,}'),
        re.compile(rb'AKIA[A-Z0-9]{16}'),
    ]
    blocked = {'.db', '.apk', '.aab', '.jks', '.keystore', '.pem', '.key', '.bundle', '.p12', '.pfx', '.db-wal', '.db-shm'}
    for name in filter(None, paths):
        path = ROOT / name
        if path.is_symlink():
            errors.append(f'{name}: symbolic links require a separate review')
            continue
        if not path.exists():
            continue  # A pending deletion is not a release file.
        parts = pathlib.PurePosixPath(name).parts
        if any(p in {'.private', 'data', 'backups', 'node_modules', 'test-results', 'playwright-report'} for p in parts) or path.suffix in blocked or path.name in {'.env', 'local.properties'} or (path.name.startswith('.env.') and path.name != '.env.example'):
            errors.append(f'{name}: private file type or location')
        data = path.read_bytes()
        if any(p.search(data) for p in patterns):
            errors.append(f'{name}: possible secret')
        text = (name + '\n').encode() + data
        if any(t.encode() in text.lower() for t in terms):
            errors.append(f'{name}: private denylist match')
        if data.startswith(b'\x89PNG\r\n\x1a\n'):
            pos = 8
            while pos + 12 <= len(data):
                length = struct.unpack('>I', data[pos:pos+4])[0]
                kind = data[pos+4:pos+8]
                if kind in {b'tEXt', b'zTXt', b'iTXt', b'eXIf'}:
                    errors.append(f'{name}: image metadata requires removal')
                pos += length + 12
    return errors


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--denylist', help='Private file with one literal term per line')
    args = parser.parse_args()
    failures = audit(args.denylist)
    for failure in failures:
        print(failure)
    if failures:
        raise SystemExit(1)
    print('Tracked source checks passed. Review image pixels and hosting metadata separately.')
