# ASTRAL Web

Next.js App Router, React and TypeScript. Browser requests terminate at Next.js; only the
server-side Harness client knows the internal service URL and token. User ownership lives in
the Web database. Harness tags correlate execution sessions with users, without authorizing them.
The backend supplies the stable user ID in `tags.user_ref`; Harness stores session files below
`<harness-root>/users/<user-id>/<harness-session-id>/`. Storage allocation is abstracted in Python,
with a local disk backend today and a per-user mounted-volume/PVC adapter reserved for later.
See [workspace storage and migration](../deploy/decoupled/README.md#per-user-workspace-storage).

Administrators manage scientific samples on `/admin/discovery-tasks`, linked from account settings.
The Ant Design administration console at `/admin` provides accounts/registration, sample tasks,
shared models and tool configuration. Samples and shared models use grouped editor drawers;
account creation and password resets use validated dialogs. The standalone `/tools` page remains
available to ordinary users in read-only mode. Ant Design uses the official App Router SSR registry
and a dedicated theme provider; no global reset stylesheet is imported into the research workbench.
The workbench gear opens `/admin` directly for administrators and the account/model dialog for
ordinary users. The username menu in both the workbench and administration header includes Logout,
which revokes the current login session and returns to the sign-in page.
Task definitions, order, enabled state and explicit input locations are stored by Harness; the original
workbench picker displays enabled tasks. The seven original studies are seeded once by a Harness
catalog migration, with empty locations and disabled by default. See
[sample management and shared data mounts](../deploy/decoupled/README.md#administrator-managed-scientific-samples).

## Run

1. Copy `.env.example` to `.env.local`; configure the service token and a base64 32-byte
   `CREDENTIAL_MASTER_KEY`. Use a distinct master key from the Harness service token.
2. Start the Python API separately with `astral serve --root ./harness-data` on Linux.
3. Run `npm ci`, `npm run db:migrate`, then `npm run dev`.
4. Create an administrator with `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the command environment
   using `npm run admin:create`. Public registration always creates ordinary users.

SQLite is the local default. Set DB_DIALECT to mysql or postgresql with the corresponding
DATABASE_URL to use another driver. Apply that dialect's migration before starting the app.
The root Compose stack defaults to PostgreSQL. See [deployment](../deploy/decoupled/README.md).

## Boundaries

- `src/app` and `src/components`: React workbench, account and administration UI.
- `src/components/research`: original `main` workbench layout and interaction controllers,
  mounted and disposed by React. See its README for the migration boundary and reference commit.
- `src/server`: authentication, ownership, encrypted model storage, ORM repository and HTTP client.
- `src/lib/harness-schema.d.ts`: generated from the checked-in OpenAPI contract.
- `src/lib/scientific-routes.ts`: generated allowlist; credentials and user tags have no browser proxy.
- `migrations`: equivalent SQLite, MySQL and PostgreSQL schemas.

Shared defaults and personal model configurations are complete endpoint/key/model pairs. They
are never mixed, and a failed personal configuration never retries using a shared paid account.
Secrets are encrypted in the Web database, never returned by read APIs, and supplied only to the
selected Harness agent at an execution boundary. HTTPS origins always receive Secure cookies.

## Verify

```sh
npm run api:generate
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`npm run build` also prepares public/static assets for `.next/standalone/server.js`.
The browser suite uses the real Next.js backend and a test-only remote Harness double;
Python service tests independently exercise the real Harness HTTP adapter. Linux CI additionally
runs the actual scientific workspace/search workflow. MySQL/PostgreSQL integration jobs use
real database service containers. No test requires a paid model API.

The restored workbench is based on `origin/main` at `1ee6cff`, including observational
evaluators/tools/skills and the large-event timeline fix. Browser tests compare the original
and migrated panel geometry at desktop and mobile widths and exercise the original three-stage
workflow. Account/model management lives in a dialog; each Agent's original settings surface
selects complete encrypted model profiles instead of handling raw provider credentials.

## Tool runtime configuration

Open **Account settings → Tools** (or `/tools`). The page opens global defaults: administrators
configure each tool once for all sessions and agents, and optionally override a tool for a specific
Agent type (Data preparation, Evaluator, Search). These overrides apply across all research sessions.
Ordinary users can read the shared settings; only administrators may change or test them.
The form schema, validation and persistence belong to Harness; Next.js handles authorization. No database
migration is needed. Existing workbench panels and the research workflow are unchanged.

`web_fetch` defaults to 20 seconds and `web_search` to 15 seconds. Both support direct access
or an HTTP/HTTPS proxy, with a timeout between 0.1 and 120 seconds. Direct mode ignores process
and model proxy environment variables. Proxy URLs containing credentials are rejected; SOCKS
and authenticated proxies are outside this initial scope. The proxy address must be reachable
**from Harness**, so `localhost` means the Harness container, not the browser's machine.

Configuration resolves in this order: **Agent override → global default → built-in default**.
Tool configuration has no research-session scope. Existing and new sessions use the same Agent-type
settings and inherit global defaults dynamically.
Overrides replace a complete tool configuration; they do not mix a proxy URL from another layer.
Partial CLI/API updates fill omitted fields from the current effective settings when saved.
An explicit override remains unchanged when an upstream default changes. Use **Inherit defaults**
to remove it and follow the global defaults again. Legacy files under individual session directories
are left in place but no longer loaded; they are not promoted into settings shared with other users.
A save takes effect on the next tool call;
an in-flight request retains its captured settings. Revision checks reject stale writes. The
Harness stores global defaults in `<harness-root>/tool-defaults.json` and overrides in
`<harness-root>/agent-tool-configurations.json`, outside the
scientific workspace and export. Settings are not model-visible invocation arguments.

The connection test uses the saved configuration and invokes the tool directly without an LLM.
For `web_fetch`, it returns connection status, elapsed time and text length, not page content.
Direct access requires every local DNS answer to be public. With an explicitly configured HTTP/HTTPS
proxy, mixed local DNS answers are accepted when at least one address is public, preserving the
original proxy compatibility; the proxy resolves the target hostname. Private IP literals and
all-non-public DNS results remain rejected in both modes. Redirect rejection and bounded responses
remain in force. The existing
bounded HTTP pool still applies, so probes exceeding its service timeout may return HTTP 504
even if the configured network timeout is longer.

CLI clients use the same application service and records:

```sh
export HARNESS_SERVICE_TOKEN=your-internal-service-token
astral tool-config --url http://localhost:8000 catalog
astral tool-config --url http://localhost:8000 get web_fetch
printf '%s\n' '{"proxy_mode":"custom","proxy_url":"http://proxy:8888","timeout_seconds":10}' > fetch.json
astral tool-config --url http://localhost:8000 --global set web_fetch --file fetch.json --expected-revision 0
astral tool-config --url http://localhost:8000 --role data get web_fetch
astral tool-config --url http://localhost:8000 --role data set web_fetch --file fetch.json --expected-revision 0
astral tool-config --url http://localhost:8000 --role data reset web_fetch --expected-revision 1
astral tool-config --url http://localhost:8000 --role data test web_fetch --url-to-fetch https://example.com
```

Use `--root ./harness-data` instead of `--url` only when the Harness service is stopped.
Separate Harness roots/instances hold separate records. `web_search` supports the same commands
and settings; use `--query` for its connection test. `contracts/tool-catalog.json` is generated
from Harness alongside OpenAPI for test fixtures and contract drift checks.
