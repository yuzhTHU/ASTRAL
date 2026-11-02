# ASTRAL decoupled deployment

Only Next.js is public. Harness has no published port, database credentials, browser cookies,
or knowledge of user passwords. Its service token is a deployment credential, not a user token.
Use a reverse proxy with HTTPS in production; set APP_ORIGIN to the public origin and COOKIE_SECURE=true.

## Compose (PostgreSQL)

Set DB_PASSWORD, HARNESS_SERVICE_TOKEN (at least 24 random characters), and
CREDENTIAL_MASTER_KEY (32 random bytes encoded as base64). Do not commit their values.

```sh
docker compose up --build -d
docker compose exec -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='a-long-unique-password' web npm run admin:create
```

The initial registration mode is open. The first registered user is always an ordinary user.
An administrator can switch to invitation-only or administrator-created accounts in the UI.
Invitations expire after seven days and are consumed atomically. Password changes and account
disabling revoke existing login sessions. No email provider is required.

Volumes `harness-data` and `web-database` are separate. Historical Python WebUI directories
are neither mounted nor migrated. Back up both volumes and the credential master key.
Losing the master key requires users/administrators to replace their stored API keys.

## Per-user workspace storage

The local filesystem backend groups every user's sessions in one directory:

```text
<harness-root>/
├── tool-defaults.json
├── agent-tool-configurations.json
├── discovery-tasks.json
└── users/
    └── <user-namespace-key>/
        └── <harness-session-id>/
            ├── metadata.json
            ├── snapshot.json
            ├── workspace/
            └── runs/
```

With Compose, the root is `/data/harness-v2` in the `harness-data` volume. Next.js supplies its
stable user ID as `tags.user_ref`; the local backend uses that as an immutable storage namespace.
It remains an opaque association, not Harness user authentication. Next.js continues to authorize
every request. Changing `user_ref` on an existing session is rejected; other tags can be updated
while retaining the owner. Calls without a user reference use the `local` namespace.

Canonical lowercase IDs (including Next.js UUIDs) are readable directory names. Other references
use a `~`-prefixed SHA-256 key, preventing traversal, case aliases and Windows device-name issues.
The original namespace is recorded in metadata. Sessions under the same user still have independent
workspaces; the three agents within one session share its workspace.

`sr_harness.storage.WorkspaceStorage` owns allocation, discovery, atomic metadata/snapshot I/O and
export enumeration. `LocalDiskWorkspaceStorage` is the first implementation. Python callers can
inject a backend with `LocalHarnessService(root, storage=backend)`; HTTP and scientific operations
do not calculate storage paths. Global tool settings remain outside user directories.

This contract expects mounted filesystem paths, preserving the existing Workspace sandbox. A future
PVC backend will own per-user claim provisioning, mounting and session discovery, returning the same
`SessionLocation` structure. This release does not provision PVCs or introduce multi-Pod execution.

On startup, the local backend automatically moves existing **decoupled Harness** directories from
`<root>/<session-id>` into the owner directory. Session IDs, Web mappings, files, snapshots and run
artifacts are retained; persisted custom evaluator paths are rebased. Migration uses a same-filesystem
rename, is repeatable, and refuses conflicting destinations rather than merging or overwriting them.
Stop the old Harness before starting the new version and back up its volume first. Historical Python
WebUI directories are outside this migration. Keep the root on the same filesystem during migration;
moving data between different filesystems or into future PVCs requires a separate transfer step.

## Administrator-managed scientific samples

Administrators open **Account settings → Sample tasks**, or `/admin/discovery-tasks`.
The separate page supports creation, editing, deletion, enable/disable, and immediate up/down
ordering. It edits all task metadata, stage prompts, data-stage/reference file names, paper links,
citations and Markdown/LaTeX card summaries. The workbench keeps its original picker and loading
workflow, displays only enabled tasks, and uses the stored order. `{inputs}` in the preparation
prompt expands to the mounted input basenames; other braces are preserved literally.

Harness owns `<harness-root>/discovery-tasks.json`; Next.js authorizes administrators and records
mutations in its audit log. No Web database schema change is needed. Local Python and HTTP clients
use the same catalog service. All writes require the current catalog revision; stale writes fail
with `409 discovery_conflict` instead of overwriting another administrator's changes.

On Harness startup, versioned JSON migrations under `src/sr_harness/service/migrations/` are
applied atomically once. `0001_discovery_tasks.json` contains the seven existing studies, all
**disabled with empty data locations**. This is a Harness catalog data migration, independent of
the Web database migrations. Restarting never resets edits or recreates deleted seed tasks.

Set `ASTRAL_SAMPLE_DATA_ROOT` to a dedicated shared sample directory mounted in the Harness
container. If absent, it defaults to `ASTRAL_PROJECT_ROOT/data` (or the project's `data` directory).
Each data location explicitly names a file or directory inside that root; relative paths resolve
against it, absolute paths are allowed within it, and resolved symlinks cannot escape it. Reference
file names are documentation only and never imply an automatic mount. There are no task-name
special cases or automatic dataset discovery. Configure data paths, then enable the task; enabling
requires nonempty, readable data. The paths are Harness/container paths, not browser or Next.js paths.

For per-user PVCs, mount the user PVC at the corresponding `users/<user-namespace-key>` path and
mount the shared dataset volume at a fixed path such as `/samples`, with `readOnly: true`.
Set `ASTRAL_SAMPLE_DATA_ROOT=/samples` and retain the same mount path in every executing container
across restarts. Next.js does not mount either volume. Use storage supporting the required
multi-node access when scheduling workers across nodes.

For a local Compose bind mount, add an override such as:

```yaml
services:
  harness:
    environment:
      ASTRAL_SAMPLE_DATA_ROOT: /samples
    volumes:
      - ./data/samples:/samples:ro
```

Then an administrator can enter `Gaia/Chen/observations.csv`, or the equivalent absolute
`/samples/Gaia/Chen/observations.csv`, as a task's data location.

Deleting a task does not delete its raw files or existing sessions. Loaded sessions pin a catalog
version and their drafted prompts. Harness retains trusted historical definitions so task edits,
disablement and deletion do not redirect existing session links on restart. Keep historical dataset
paths/files available as well. Older snapshots without a catalog revision keep their prompts, but
their source mounts cannot be reconstructed from the now-disabled seeds; new tasks must be configured
and loaded in a new session. Back up the catalog together with the user workspace volume(s).

## Local development (SQLite)

Harness scientific file access and sandbox execution require Linux. Use Linux/WSL2 or Docker
for the Harness; Web development and transport-only tests also work on Windows.

```sh
pip install -e '.[dev]'
export HARNESS_SERVICE_TOKEN='replace-with-a-random-service-token'
astral serve --root ./harness-data --host 127.0.0.1 --port 8000
cd web
npm ci
# Copy .env.example to .env.local, set the token, encryption key and origin.
npm run db:migrate
npm run dev
```

Scripts load .env.local and .env using Next.js environment loading. Existing shell variables
take precedence. Run the admin creation command with temporary ADMIN_USERNAME/ADMIN_PASSWORD.

## MySQL and PostgreSQL outside Compose

Set DB_DIALECT=mysql and DATABASE_URL=mysql://user:password@host:3306/astral,
or DB_DIALECT=postgresql and DATABASE_URL=postgresql://user:password@host:5432/astral.
Create an empty database and run `npm run db:migrate` before starting Web. SQLite uses
DB_DIALECT=sqlite and a libsql file URL. Dialect-specific migrations represent the same logical
schema; switching an existing database's dialect does not migrate its records.

The ORM repository stores typed entities in a versioned envelope. Unique database keys enforce
usernames and token uniqueness; transactions and compare-and-swap protect invitation consumption
and contested updates. Run the repository integration suite against all three supported drivers.

## Contracts and validation

```sh
python scripts/export_harness_openapi.py
cd web
npm run api:generate
npm run typecheck
npm test
npm run build
npm run test:e2e
```

For Windows development, run the scientific sandbox tests in WSL2 with Docker.
The helper copies source onto the container's native Linux filesystem before
dropping to the application UID; do not run Landlock tests on a Windows bind mount.
The optional playground package and retired deployment tests are excluded.

```sh
docker build -t astral-harness:decoupling-test .
docker build -t astral-web:decoupling-test web
docker run --rm --user 0 -v "$PWD:/repo:ro" -w /repo --entrypoint python astral-harness:decoupling-test scripts/test_linux_container.py
python3 scripts/verify_databases.py
python3 scripts/verify_compose.py
```

These verification scripts create uniquely named test resources and remove only
their own containers, networks and volumes. Compose verification binds a temporary
loopback port and covers accounts, registration, credential encryption, ownership,
streamed upload/download, export and archive against the real production services.

The Harness starts long-running work asynchronously. A 504 does not cancel a thread; retain
the command's idempotency key and inspect state before retrying. Agent concurrency defaults to
8 globally and 2 per `user_ref`, including paused tasks. Tags are correlation data only;
Next.js authorizes every access, including file transfer, events and exports.

Model configuration selects a complete endpoint/key/model pair. Personal failures never retry
using a shared account. Secrets are encrypted in the Web database, sent only over the trusted
internal HTTP connection, held in Harness memory, and excluded from checkpoints and exports.
For a cross-host deployment, protect internal HTTP with TLS before exposing the service network.
Run one Harness process per data root; multi-worker or multi-node scheduling is outside this release.
