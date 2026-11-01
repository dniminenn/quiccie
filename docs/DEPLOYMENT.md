# Deployment

Quiccie is a single-account service.
Run it on a private network or behind a TLS reverse proxy.
Spaces filter content. They do not provide separate user permissions.
All authenticated clients can sync the account's notes.

## Server

Build the browser assets first. Build the server with `CGO_ENABLED=0`.
Use `-trimpath -buildvcs=false` for a public binary.
Create a dedicated service account and a writable data directory.
Store the password hash in a file that only the service account can read.
Use `-username` to set the login name.

`deploy/quiccie.service` is an example systemd unit.
Set paths and resource limits for your host before use.
Keep the web and MCP listeners on loopback.
The MCP HTTP endpoint is intended for a local SSH bridge, not direct public access.

`deploy/nginx.conf` is a TLS proxy example for `notes.example.com`.
Replace the domain and certificate paths.
Set your network access policy before enabling the site.
Copy a clean web build to `/opt/quiccie/web/current`.
Retain previous hashed assets in `/opt/quiccie/web/assets` for open browser sessions.
An optional APK can be served from `/opt/quiccie/releases/quiccie.apk`.

## Agent access

Create a restricted SSH account for MCP.
Use the forced command in `deploy/sshd.conf` as a Match block in your host configuration.
Do not replace an existing SSH configuration without checking administrator access.
Use one authorized key per agent installation.
The bridge forwards each tool call to the local MCP service.
It permits client recovery after a backend restart.

Keep private addresses, keys, and agent profile names outside this repository.
See [agent integration](../agent-integration/README.md).

## Updates

Use `deploy/install-web.sh` for a client-only update.
Stage only the clean web build, reviewed proxy configuration, and optional APK.
This script keeps the backend process running.
It can reload nginx if the staged proxy configuration differs.
Do not stage the example configuration over a working private configuration.

`deploy/install-backend.sh` replaces the backend and saves a stopped database copy.
A backend update can interrupt an active request.
Test the release and a restore procedure before use.
Keep deployment backups private.

## Registry upgrades

Back up the database before changing its registry.
An older installation can have custom space IDs and path prefixes.
Export its current space catalog before upgrading.
Provide those entries in `space_catalog` in the registry supplied with `-registry`.
Keep each existing ID, prefix, and shared project unchanged.
Do not replace an existing private registry with the public defaults.

The public Android application ID is `app.quiccie.android`.
A package with another application ID is a separate installation.
Keep the previous app until all of its pending edits have synced.
Connect the new app to the same server and download the notes before retiring it.
