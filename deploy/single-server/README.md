# Single-server deployment

Runs one shared Harness, Next.js and a separate PostgreSQL 17 container alongside
the existing AgentEconomist installation. It does not create administrator users.
Registration keeps the application's default policy; public registrations create
ordinary users.

Copy `compose.yaml` to `/data/astral/compose.yaml`, generate a root-readable-only
`/data/astral/.env` from `.env.example`, and load the three Linux amd64 images.
Generate fresh database/service credentials and a base64-encoded 32-byte encryption
master key. Never copy local deployment credentials or databases to this server.
Pin the image tags in `.env` to the release being deployed.

Create `/data/pgsql`, `/data/astral/harness-data` and `/data/astral/samples`.
The Harness data directory must be writable by container UID/GID 1000:1000.
PostgreSQL initializes its data directory on first startup. Next.js applies its
PostgreSQL schema automatically before serving requests.

```sh
cd /data/astral
docker compose up -d --wait --wait-timeout 180
docker compose ps
```

Only Web is published, at `127.0.0.1:3000`. PostgreSQL and Harness have no host
ports. Shared sample data is mounted read-only at `/samples`. Initial tasks have
empty data locations and are disabled. Back up `/data/pgsql`, Harness data, samples
and the encryption master key. Do not replace `.env` when restarting or upgrading.

Install `nginx.conf` as the enabled site and `astrodiscovery.conf` in
`/etc/nginx/conf.d/` after backing up the existing nginx configuration.
It keeps port 80, routes the explicitly configured hostnames, and rejects all
other hosts. The existing TLS gateway can continue to reach AgentEconomist on
8080: install `legacy-host-guard.cjs` at `/data/astral/legacy-host-guard.cjs` and
`agenteconomist-host-guard.conf` as a drop-in for `agenteconomist-frontend.service`.
It runs the existing Next.js build with the existing environment and rejects
nonmatching Host headers on both ordinary and WebSocket upgrade requests. Test a
candidate with `LEGACY_PORT=8081 LEGACY_BIND=127.0.0.1` before restarting the old
frontend. To roll back, remove only that drop-in, reload systemd and restart the
frontend. Validate nginx with `nginx -t` before restarting it. Requests with manually
supplied matching Host headers still match: virtual hosting is not authentication.

The public origin is `https://astral.thuai4s.ai`, with `COOKIE_SECURE=true`.
`https://astrodiscovery.thuai4s.ai` is also accepted. The local nginx normalizes only
that exact HTTPS Origin to the canonical origin for Web's existing CSRF validation;
missing, HTTP and unrelated origins retain their original values and are rejected
by Web. Login cookies remain host-only, so the two domains have separate logins.
An upstream nginx in the same private network terminates TLS and forwards to this
server's HTTP port 80, preserving the requested public Host and browser's Origin.
The domain does not need to resolve to this server's public IP. This deployment
does not provision TLS certificates or expose port 443.
`upstream-nginx.example.conf` shows the location to merge into that existing TLS
server, using this machine's private address `172.16.96.14` as the origin. The
upstream configuration is provided for review and is not installed on this host.

Initial resource limits suit a 4-vCPU/7-GiB host already running other services:
Web 768 MiB, PostgreSQL 512 MiB, Harness 3 GiB/2 CPUs, two simultaneous Agent tasks
globally and one per user. Adjust after measuring scientific workloads.
