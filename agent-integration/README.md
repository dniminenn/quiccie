# Agent memory instructions

Use this package to update an existing `notes-memory` MCP setup.
It supports Codex, Claude, and additional Claude profiles on each host.
It keeps existing connection commands, keys, and server names.
The instructions apply to each session. They do not depend on a skill trigger.

The server must expose `spaces_list`, `memory_search_space`, and `notes_search_space`.
Use the returned space names and IDs. Do not hard-code an owner's space IDs.
A memory search result includes the canonical project for the next read.
The existing tool schemas remain unchanged.

## Apply the instructions

Use Python 3.11 or later.
Run these commands from the Quiccie repository on each host:

```sh
python3 scripts/test-agent-memory.py
python3 scripts/update-agent-memory.py --apply
python3 scripts/update-agent-memory.py --check
python3 scripts/check-agent-mcp.py
```

The updater reads `agent-integration/memory-instructions.md`.
It replaces the `Shared durable memory` section in these files:

- `~/.codex/AGENTS.md`
- `~/.claude/CLAUDE.md`
- `CLAUDE.md` in each configured extra Claude profile directory

It keeps other instruction sections.
It sets `autoMemoryEnabled` to `false` in each selected Claude settings file.
It keeps other settings and historical memory files.
It saves each changed file under `~/.config/quiccie/agent-instruction-backups/` first.
The backup path includes the time of the change.
The updater refuses duplicate managed sections.

If the repository is on another host, copy the updater and its template.
Keep the `scripts/` and `agent-integration/` directories under one parent directory.
Run the updater as the agent user.
Use `--home PATH` only when you intend to update that home directory.

Start a new agent session to load the changed instructions.
Refresh its MCP connection to load the current tool list.
A successful connection check does not refresh an existing agent session.
Do not add a second MCP server.

## Additional Claude profiles

Codex and standard Claude are the defaults.
Keep extra profile names in `~/.config/quiccie/agent-profiles.json`:

```json
{"claude_profiles": [".claude-work"]}
```

Each entry is a directory under the agent user's home.
Use `.claude-NAME` with letters, digits, underscores, or hyphens in NAME.
Do not use an absolute path or a parent path.
Both the updater and the connection check read this private file by default.
The updater uses `CLAUDE.md` and `settings.json` in each profile directory.
The connection check uses `.claude.json` in each profile directory.
It requires a configured connection for each extra profile.
It names `.claude-work` as `claude-work` in check output and `--agent` options.

Use repeatable `--claude-profile DIR` to add a profile for one command.
Prefer the private profile file for repeatable host setup.
Keep profile names out of public examples when they identify an owner.

## Private project context

Keep personal project aliases and space mappings outside the public repository.
Put these instructions in `~/.config/quiccie/agent-context.md`.
The updater copies that text into a separate `Private memory context` section
in each agent instruction file. Both `--apply` and `--check` use this file.
Use plain text or Markdown without either managed section heading.
Do not include credentials or secrets.

Use `--private-context PATH` to select another local file.
The updater refuses a context file inside this repository.
If no context file exists, it keeps any existing private context section.
To remove that section's content, supply an empty context file and apply it.
Keep the context file and its backups private.

Before replacing an older owner-specific policy, copy its project mappings
into the private context file. The updater does not infer those mappings.
It does not change registered project IDs or move notes.

## Connection checks

The check reads each installed agent's existing MCP command.
It uses the configured environment and working directory when supplied.
It checks tool discovery, the space catalog, and bounded memory searches
in the registered spaces. It does not print note content or credentials.
It does not write notes or memory.

By default, the check skips agents without a configured `notes-memory` server.
Use `--agent codex`, `--agent claude`, or a configured profile name to require one agent.
Repeat `--agent` to require more than one agent.
Use `--space ID` to check only one registered space.
Repeat `--space` to check more than one space.
The check supports command-based MCP connections.
It reports an unsupported connection type without changing it.

For a corpus check, use a consistent database backup:

```sh
QUICCIE_CORPUS_DB=/absolute/path/to/backup.db go test ./internal/mcp -run TestMemoryCorpus -v
```

Do not point this check at the running server database.
