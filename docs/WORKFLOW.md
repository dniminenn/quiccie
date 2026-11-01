# Development workflow

Use short sentences and ASD-STE100 Simplified Technical English for new prose.
Keep imported note text and dependency license text unchanged.
Keep credentials, real notes, private registries, and signing keys out of Git.

## Build

1. Run `npm --prefix web ci`.
2. Run `npm --prefix web run build`.
3. Run `CGO_ENABLED=0 go build -trimpath -buildvcs=false -o dist/quiccie ./cmd/quiccie`.
4. Copy the clean web build to the Android asset directory.
5. Build Android with Java 17 and Android SDK 35.

## Check a change

Run checks that match the change.
Use synthetic data for automated tests and screenshots.
Run Go tests for storage, search, server, or MCP changes.
Use browser tests for navigation, editing, offline recovery, and scope filters.
Use an emulator for Android tests. Do not select a physical device automatically.
Do not repeat MCP checks for unrelated interface changes.

Before a client release, check desktop and phone layouts in both themes.
Check keyboard use, small screens, scroll retention, and Android system bar clearance.
Check that a failed save keeps the user's edit available.
Check that switching space does not show results from the previous space.

## Agent instructions

Update the portable policy in `agent-integration/memory-instructions.md`.
Keep private aliases in the installer user's private context file.
Run the installer tests before applying a policy change.
Apply and check the policy on each intended host.
Do not replace existing MCP connections.

## Release

Follow [the release checklist](RELEASE.md).
A source release does not authorize deployment to an existing server.
Keep public examples separate from private deployment settings.
Use the client installer for web and APK updates.
Confirm live behaviour before reporting an authorized deployment as complete.
