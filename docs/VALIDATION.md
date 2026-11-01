# Validation

Use isolated data for tests. Never point a test at a live database.

## Automated checks

```sh
CGO_ENABLED=0 go test ./...
python3 scripts/test-agent-memory.py
node --test scripts/repair-import-types.test.mjs
npm --prefix web run build
```

Start each server in a separate terminal:

```sh
python3 scripts/demo.py
```

```sh
npm --prefix web run dev -- --port 18091
```

Then run `npm --prefix web test`.
The demo uses port 18090 and a temporary synthetic corpus.
The source-level tests use the Vite server on port 18091.
Use `QUICCIE_TEST_URL` and `QUICCIE_SOURCE_URL` to select other isolated test endpoints.
The tests pace logins to respect the server rate limit.

Android tests use the debug application and an emulator.
Set `ANDROID_SERIAL` to the intended emulator before invoking Gradle.
Use `connectedDebugAndroidTest` for the checks affected by the change.
The navigation tests cover scope, retained location, scroll position, and system bars.

## Private corpus checks

The optional corpus tests accept a consistent backup through `QUICCIE_CORPUS_DB`.
The rendering tools accept a vault copy through `QUICCIE_CORPUS`.
Keep input data and detailed reports outside the public source archive.
A successful synthetic test does not prove that every imported file is supported.

## Limits

Rich editing falls back to Markdown when it cannot preserve source structure.
The app is a pre-release single-account system.
Spaces are organizational filters, not tenant isolation.
Automated contrast checks cover selected text pairs, not full accessibility conformance.
