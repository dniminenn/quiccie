#!/usr/bin/env python3
"""Update the existing central-memory instructions. Keep MCP connections intact."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import stat
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TARGETS = ('.codex/AGENTS.md', '.claude/CLAUDE.md')
SETTINGS = ('.claude/settings.json',)

def claude_profiles(home, extra=None):
    path = home / '.config/quiccie/agent-profiles.json'
    data = json.loads(path.read_text()) if path.exists() else {}
    if not isinstance(data, dict) or not isinstance(data.get('claude_profiles', []), list):
        raise ValueError('The private profile file must contain a claude_profiles list.')
    profiles = []
    for profile in data.get('claude_profiles', []) + (extra or []):
        if not isinstance(profile, str) or not re.fullmatch(r'\.claude(?:-[A-Za-z0-9][A-Za-z0-9_-]*)?', profile):
            raise ValueError('Use a home-relative .claude or .claude-NAME profile directory.')
        if profile != '.claude' and profile not in profiles:
            profiles.append(profile)
    return profiles

def replace_section(text, block, title='Shared durable memory'):
    matches = list(re.finditer(r'^#{1,6} ' + re.escape(title) + r'[ \t]*$', text, re.M))
    if len(matches) > 1:
        raise ValueError('More than one ' + title + ' section. Resolve the duplicate first.')
    if not matches:
        return text.rstrip() + ('\n\n' if text.strip() else '') + block.strip() + '\n'
    start = matches[0]
    level = len(start.group().split()[0])
    end = re.search(r'^#{1,' + str(level) + r'}[ \t]+|^#{1,6} (?:Shared durable memory|Private memory context)[ \t]*$', text[start.end():], re.M)
    stop = start.end() + end.start() if end else len(text)
    heading = '#' * level + ' ' + title
    replacement = heading + '\n' + block.strip().partition('\n')[2].rstrip() + '\n'
    return text[:start.start()] + replacement + ('\n' if stop < len(text) else '') + text[stop:]

def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    target = path.resolve()
    mode = stat.S_IMODE(target.stat().st_mode) if target.exists() else 0o600
    fd, temporary = tempfile.mkstemp(prefix='.quiccie-', dir=target.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'w') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home', type=Path, default=Path.home())
    parser.add_argument('--claude-profile', action='append', help='Additional home-relative Claude profile directory.')
    parser.add_argument('--private-context', type=Path, help='Local alias instructions outside the repository.')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    profiles = claude_profiles(args.home, args.claude_profile)
    targets = TARGETS + tuple(profile + '/CLAUDE.md' for profile in profiles)
    settings = SETTINGS + tuple(profile + '/settings.json' for profile in profiles)
    block = (ROOT / 'agent-integration/memory-instructions.md').read_text()
    context_path = args.private_context or args.home / '.config/quiccie/agent-context.md'
    context = None
    if args.private_context is not None or context_path.exists():
        if context_path.resolve().is_relative_to(ROOT.resolve()):
            parser.error('Keep private context outside the repository.')
        context = context_path.read_text().strip()
        if re.search(r'^#{1,6} (?:Shared durable memory|Private memory context)[ \t]*$', context, re.M):
            parser.error('Private context must not contain a managed section heading.')
        context = '## Private memory context\n\n' + context + '\n'
    changes = []
    for relative in targets:
        path = args.home / relative
        old = path.read_text() if path.exists() else ''
        new = replace_section(old, block)
        if context is not None:
            new = replace_section(new, context, 'Private memory context')
        if old != new: changes.append((relative, path, new))
    for relative in settings:
        path = args.home / relative
        old = path.read_text() if path.exists() else '{}'
        data = json.loads(old)
        if data.get('autoMemoryEnabled') is not False:
            data['autoMemoryEnabled'] = False
            changes.append((relative, path, json.dumps(data, indent=2) + '\n'))
    if args.check:
        for relative, _, _ in changes: print('Needs update: ' + relative)
        if changes: raise SystemExit(1)
        print(f'PASS: {len(targets)} agent instruction blocks match; Claude automatic memory is disabled.')
        return
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = args.home / '.config/quiccie/agent-instruction-backups' / stamp
    for relative, path, new in changes:
        if path.exists():
            copy = backup / relative
            copy.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            shutil.copy2(path, copy)
            copy.chmod(0o600)
        atomic_write(path, new)
        print('Updated: ' + relative)
    print('MCP connection settings were not changed.')

if __name__ == '__main__': main()
