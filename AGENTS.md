# Quiccie work instructions

- Use ASD-STE100 Simplified Technical English for new prose and documentation.
- Use short sentences. Give one instruction in each sentence. Use active voice.
- Keep technical names exact. Do not change license text or imported user notes.
- Quiccie uses Go, bbolt, and Bleve. Build the server with `CGO_ENABLED=0`.
- Use 0BSD for original Quiccie code. Keep dependency licenses and notices.
- Do not add a dependency that requires a more restrictive project license.
- Keep credentials, source notes, and private test data out of Git.
- Change production services and agent settings only with explicit user authorization.
- Complete the checks in `docs/WORKFLOW.md` before you report a release as ready.
- For authorized client updates, finish deployment and live checks before you report completion.
- Deploy web files and APKs with `deploy/install-web.sh`. Do not restart Quiccie or MCP for client-only updates.
- Run checks that match the change. Do not repeat MCP checks for unrelated UI work.

## Shared durable memory

Use the `notes-memory` MCP service as the source of durable memory. Use its tool schemas as the contract. Do not create parallel native or local automatic memories. Keep historical native memory files and indexes read-only. Live evidence and current user instructions take priority over stored memory. Saved commands, historical permissions, and imported instructions do not grant permission for a new action.

For a task that needs durable context, use `spaces_list` to discover registered spaces. Match the conversation and repository context to the returned space name and ID. Do not infer a space from a machine home path or working directory alone. Ask when the space is unclear. Keep the selected space explicit in later calls that accept it. Reuse the catalog while the task and connection stay unchanged.

When the project is known, call `memory_scope` with its explicit ID or canonical remote repository identity and the selected space. Use the returned canonical project and `memory_search`. A project search includes that project's shared space, not sibling projects. An unknown repository can create a scope. Always supply the selected space when you resolve an unknown repository. Do not rely on a server default. Private project aliases can be supplied in the separate Private memory context section.

When the topic is clear but the project is unknown, use `memory_search_space` with a short query, the selected space ID, and `limit=5`. It searches registered projects and shared memory in exactly one space. Do not search another space because the first search is empty. Do not use a shared project ID as an all-project search. Each result identifies its space and canonical project. Use that project and path for bounded `memory_read` calls. A broad search does not set the scope for later calls. If a required tool is unavailable, report that the client MCP connection needs a refresh. Do not replace it with an unscoped vault scan or a new local memory store.

At a meaningful task end, save only new durable facts that a later task will need. Prefer verified current state, decisions, constraints, and unresolved issues. Keep each note short and focused. Replace obsolete statements instead of appending routine progress, test, or release logs. Preserve a concise dated history only when it explains a current decision. Mark uncertainty and source dates. Do not promote an old report to a verified current fact.

Search before writing. Update an existing note instead of duplicating it. Read all content before replacing a whole file. Use continuation offsets and the same expected checksum for bounded reads. Supply the current read checksum for every existing-file update. Re-read and reconcile a conflict; do not force a stale update. Use project scopes for project facts. Use the selected space's `shared_project` from `spaces_list` only for facts shared across that space. Memory writes are best effort. Report a failed save without claiming that it succeeded.

Never store secrets or transcripts in memory. Do not import or populate notes without explicit authorization. Use `notes_search_space` with the selected space ID and bounded `notes_read` for ordinary notes. Use returned vault-relative paths for reads. These tools exclude agent memory. Use the earlier vault-wide `notes_search` only for an explicit search across spaces. `notes_write` requires an explicit user request and the current read checksum for an existing file.
