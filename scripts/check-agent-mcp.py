#!/usr/bin/env python3
"""Check configured agent MCP connections without changing settings or notes."""
import argparse
import json
import os
from pathlib import Path
import select
import re
import subprocess
import time
import tomllib

CONFIGS = {
    'codex': ('.codex/config.toml', 'mcp_servers'),
    'claude': ('.claude.json', 'mcpServers'),
}


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

def agent_configs(home, extra=None):
    configs = dict(CONFIGS)
    for profile in claude_profiles(home, extra):
        configs[profile.removeprefix('.')] = (profile + '/.claude.json', 'mcpServers')
    return configs


def read_config(home, agent, configs=None):
    relative, key = (configs or agent_configs(home))[agent]
    path = home / relative
    if not path.exists():
        return None
    text = path.read_text()
    data = tomllib.loads(text) if path.suffix == '.toml' else json.loads(text)
    return data.get(key, {}).get('notes-memory')


class Connection:
    def __init__(self, config):
        command = config.get('command')
        args = config.get('args', [])
        if not isinstance(command, str) or not command:
            raise ValueError('The check requires a command-based MCP connection.')
        if not isinstance(args, list) or not all(isinstance(arg, str) for arg in args):
            raise ValueError('MCP command arguments must be a list of strings.')
        configured_env = config.get('env', {})
        if not isinstance(configured_env, dict) or not all(
                isinstance(k, str) and isinstance(v, str) for k, v in configured_env.items()):
            raise ValueError('MCP environment entries must be strings.')
        environment = os.environ.copy()
        environment.update(configured_env)
        cwd = config.get('cwd')
        if cwd is not None:
            cwd = str(Path(cwd).expanduser())
        self.process = subprocess.Popen(
            [command, *args], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, env=environment, cwd=cwd)
        self.pending = b''
        self.sequence = 0

    def notify(self, method):
        self.process.stdin.write((json.dumps({'jsonrpc': '2.0', 'method': method}) + '\n').encode())
        self.process.stdin.flush()

    def call(self, method, params):
        self.sequence += 1
        self.process.stdin.write((json.dumps({
            'jsonrpc': '2.0', 'id': self.sequence, 'method': method, 'params': params,
        }) + '\n').encode())
        self.process.stdin.flush()
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            if b'\n' in self.pending:
                line, self.pending = self.pending.split(b'\n', 1)
                reply = json.loads(line)
                if reply.get('id') == self.sequence:
                    if 'error' in reply:
                        raise RuntimeError('The MCP server returned a protocol error.')
                    return reply['result']
            elif select.select([self.process.stdout], [], [], 1)[0]:
                chunk = os.read(self.process.stdout.fileno(), 65536)
                if not chunk:
                    raise RuntimeError('The MCP connection closed before its response.')
                self.pending += chunk
                if len(self.pending) > 4 * 1024 * 1024:
                    raise RuntimeError('The MCP response exceeds the check limit.')
        raise RuntimeError('The MCP response timed out.')

    def close(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.process.stdin.close()
        self.process.stdout.close()


def tool_data(result):
    if result.get('isError'):
        raise RuntimeError('The MCP tool returned an error.')
    data = result.get('structuredContent')
    if data is None:
        blocks = [block['text'] for block in result.get('content', []) if block.get('type') == 'text']
        if not blocks:
            raise RuntimeError('The MCP tool returned no structured data.')
        data = json.loads(blocks[0])
    if not isinstance(data, dict):
        raise RuntimeError('The MCP tool returned an invalid data object.')
    return data


def check_connection(config, requested_spaces=None):
    connection = Connection(config)
    try:
        connection.call('initialize', {
            'protocolVersion': '2024-11-05', 'capabilities': {},
            'clientInfo': {'name': 'quiccie-check', 'version': '2'},
        })
        connection.notify('notifications/initialized')
        names = {tool['name'] for tool in connection.call('tools/list', {})['tools']}
        if not {'memory_search_space', 'spaces_list', 'notes_search_space'} <= names:
            raise RuntimeError('A required space tool is missing.')
        catalog = tool_data(connection.call('tools/call', {'name': 'spaces_list', 'arguments': {}}))
        spaces = catalog.get('spaces', [])
        if not spaces or not all(isinstance(space, dict) and isinstance(space.get('id'), str)
                                 and space['id'] and isinstance(space.get('shared_project'), str)
                                 and space['shared_project'] for space in spaces):
            raise RuntimeError('The space catalog is invalid or empty.')
        registered = {space['id'] for space in spaces}
        selected = set(requested_spaces) if requested_spaces else registered
        if not selected <= registered:
            raise ValueError('A requested space is not in the catalog.')
        for space in sorted(selected):
            data = tool_data(connection.call('tools/call', {
                'name': 'memory_search_space',
                'arguments': {'query': 'deployment', 'space': space, 'limit': 3},
            }))
            hits = data.get('results')
            if data.get('space') != space or not isinstance(hits, list) or len(hits) > 3:
                raise RuntimeError('A search response has an invalid scope or size.')
            if not all(isinstance(hit, dict) and hit.get('space') == space
                       and isinstance(hit.get('project'), str) and hit['project'] for hit in hits):
                raise RuntimeError('A search result does not identify its space and project.')
        return len(selected)
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home', type=Path, default=Path.home())
    parser.add_argument('--agent', action='append', help='Require codex, claude, or a configured profile name.')
    parser.add_argument('--claude-profile', action='append', help='Additional home-relative Claude profile directory.')
    parser.add_argument('--space', action='append')
    args = parser.parse_args()
    configs = agent_configs(args.home, args.claude_profile)
    if args.agent and not set(args.agent) <= set(configs):
        parser.error('An agent name is not in the configured profile list.')
    checked = 0
    for agent in args.agent or configs:
        config = read_config(args.home, agent, configs)
        if config is None:
            if args.agent or agent not in CONFIGS:
                raise ValueError('A required agent has no notes-memory configuration.')
            print('SKIP: ' + agent + ': no notes-memory configuration.')
            continue
        count = check_connection(config, args.space)
        checked += 1
        print(f'PASS: {agent}: configured command, tool discovery, {count} registered spaces.')
    if not checked:
        raise ValueError('No configured notes-memory connection was found.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError) as error:
        raise SystemExit(str(error))
    except (OSError, KeyError, TypeError) as error:
        # Do not print a configured command, environment, or server output.
        raise SystemExit('The connection check failed: ' + type(error).__name__)
