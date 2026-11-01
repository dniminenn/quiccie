# Public release checklist

Keep the repository private until the release owner approves publication.

1. Run the tests listed in [validation](VALIDATION.md).
2. Build from a clean checkout. Use `-trimpath -buildvcs=false` for Go release binaries.
3. Generate screenshots from the synthetic demo. Inspect each image.
4. Run `python3 scripts/audit-public.py`.
5. Use `--denylist /private/path/to/terms.txt` for an owner-specific privacy check.
6. Check Git author and committer identity, branches, tags, and commit history.
7. Review repository descriptions, issues, pull requests, logs, releases, and workflow artifacts on the hosting service.
8. Generate dependency notices with `scripts/licenses.py` and the Android `licenseArtifacts` task.
9. Include the original license and dependency notices with binary releases.
10. Run `python3 scripts/export-public.py` to create the source archive.
11. Inspect the archive listing before publication.

The source exporter uses the current Git commit.
It does not copy the working directory or `.git`.
Never publish `.private`, databases, real notes, private registries, signing keys,
keystores, local SDK paths, browser profiles, traces, or private audit reports.
Do not ship the Gradle artifact-path inventory.

A history rewrite does not guarantee that a hosting service erases old objects or caches.
For a previously sensitive repository, use a fresh public repository from the sanitized source
or obtain confirmation that retained data has been removed before changing visibility.
Keep the old private repository private during that process.
The hosting account name and public profile remain visible to repository visitors.

A source audit cannot prove the absence of all sensitive information.
Review release artifacts separately. Inspect image pixels as well as metadata.
Keep legitimate upstream author attribution and license text.
