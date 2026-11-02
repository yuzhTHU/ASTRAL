// Keep the existing gateway -> :8080 route while accepting only its public Host.
// Uses the existing Next.js build and dependencies; no rebuild or proxy buffer.
"use strict";
const { createServer } = require("node:http");
const { createRequire } = require("node:module");
const { join } = require("node:path");

process.env.NODE_ENV = "production";
const project = process.env.LEGACY_PROJECT_DIR || "/data/AgentEconomist-main/frontend";
const port = Number(process.env.LEGACY_PORT || 8080);
const hostname = process.env.LEGACY_BIND || "0.0.0.0";
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Invalid legacy service port");
}
const next = createRequire(join(project, "package.json"))("next");
const allowed = (request) =>
  typeof request.headers.host === "string" &&
  /^agenteconomist\.fiblab\.net(?::[0-9]{1,5})?$/i.test(request.headers.host);

const server = createServer();
// Next installs its own upgrade listener lazily. Guard both events before any
// listener runs, including that listener, without modifying global Node classes.
const emit = server.emit;
server.emit = function (event, ...args) {
  if ((event === "request" || event === "upgrade") && !allowed(args[0])) {
    if (event === "request") {
      args[1].writeHead(403, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        connection: "close",
      });
      args[1].end("Forbidden Host\n");
    } else {
      args[1].end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    }
    return true;
  }
  return emit.call(this, event, ...args);
};

const app = next({ dev: false, dir: project, hostname, port, httpServer: server });
app.prepare().then(() => {
  const handle = app.getRequestHandler();
  server.on("request", (request, response) => {
    Promise.resolve(handle(request, response)).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
      console.error("Legacy request failed");
    });
  });
  server.listen(port, hostname, () => console.log(`Legacy Host guard ready on port ${port}`));
}).catch(() => {
  console.error("Legacy frontend startup failed");
  process.exit(1);
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    try { await app.close(); } finally { process.exit(0); }
  });
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
