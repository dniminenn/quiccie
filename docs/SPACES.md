# Spaces

A space contains notes, projects, and shared agent memory.
Personal and Work are built in.
You can add spaces such as Side gig, Study, or a client name.

## Browser

Use the Space selector above the library.
Select the plus button to add a space.
Enter its name and ID, then select Create space.
The ID uses lowercase letters, digits, and hyphens.
The ID stays fixed.
The name can contain spaces.

Use Notes or Memory to select a content kind. Use Browse for Folders and Projects.
The space selection applies to files, search, recent items, and new notes.
Projects shows projects for the selected content kind and space.
Select All spaces only when you want a combined view.
Select one space before you create a note.

## Android

Use the Space button above the library.
Select Add space, or open Settings and select Add space.
Use the Notes and Memory navigation buttons to select the content kind.
The app keeps the space list and selection on the device.
An APK with the same application ID and signing key can update an existing installation.

## Offline use

An existing space remains available offline.
New notes and edits use the existing offline sync queue.
Creating a space requires a connection to the server.
This gives each space one shared ID across clients.
A repeated create request with the same ID and name is safe.
The catalog is refreshed during sync.

## Storage and compatibility

Personal keeps its existing paths.
New installations use `Work/` for the built-in Work space.
An existing installation can retain its own prefix through its registered catalog.
New spaces use `Spaces/<space-id>/`.
Their shared memory uses `Spaces/<space-id>/Agent Memory/global/`.
Their project memory uses `Spaces/<space-id>/Agent Memory/projects/<project-id>/`.
Adding a space does not move existing notes.
Use a server build that supports spaces for recovery.
Earlier builds do not preserve the custom-space catalog during project registration.
The catalog and shared project are saved in one database transaction.
The current UI adds and selects spaces. It does not delete them or change their IDs.

Spaces organize one account's data. They are not separate user permissions.
Clients still sync the account's notes for offline use.
Search filters apply before the server's result limit.
An empty search does not expand to another space.

## Agents

Call `spaces_list` to get the registered IDs and shared projects.
Use `memory_scope` for a known project or repository.
Use `memory_search_space` when the space is clear but the project is unknown.
Use `notes_search_space` for ordinary notes in that space.
Each memory hit identifies the canonical project for its next read.
Ordinary-note paths remain relative to the full vault.
The seven original tool schemas remain unchanged.
The earlier `notes_search` remains a combined ordinary-note search.
Use it only when the user requests a search across spaces.

The shared memory project for a new space is `space-<space-id>`.
Use the `shared_project` field from `spaces_list` instead of constructing this name.
Register a project's remote repository with an explicit space through `memory_scope`.
Do not use a local directory as the repository identity.

See [agent integration](../agent-integration/README.md) to update existing instructions.
