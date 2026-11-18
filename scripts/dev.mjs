#!/usr/bin/env node

/**
 * Runs the API and Vite dev server together with prefixed, coloured output.
 * Usage: npm run dev
 *
 * If the API is already running on the configured port (for example after an
 * earlier `npm run dev`), it is reused instead of being started twice. That
 * avoids the "port 5000 already in use" cascade that otherwise kills both
 * processes and leaves Vite on a different port.
 */

import { spawn, spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const apiPort = process.env.PORT || "5000";
const apiHealth = `http://localhost:${apiPort}/api/health`;

const WHITE = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

const children = [];
let shuttingDown = false;

function prefix(name, color, stream, chunk) {
  const text = chunk.toString().replace(/\s+$/, "");
  if (!text) return;
  for (const line of text.split(/\r?\n/)) {
    stream.write(`${color}[${name}]${WHITE} ${line}\n`);
  }
}

async function healthyApi() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(apiHealth, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const body = await response.json();
    return body?.service === "vision-api" ? body : null;
  } catch {
    return null;
  }
}

function spawnService(service) {
  const child = spawn(npm, service.args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: isWindows,
    env: process.env,
  });

  let reportedPort = false;

  child.stdout.on("data", (chunk) => prefix(service.name, service.color, process.stdout, chunk));
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    prefix(service.name, service.color, process.stderr, chunk);

    if (service.name === "api" && !reportedPort && /EADDRINUSE/.test(text)) {
      reportedPort = true;
      process.stderr.write(
        `${YELLOW}[api]${WHITE} Port ${apiPort} is already in use. ` +
          "Stop the other process, or set PORT to a free port and update web/vite.config.ts.\n",
      );
    }
  });

  child.on("error", (error) => {
    process.stderr.write(`${RED}[${service.name}]${WHITE} failed to start: ${error.message}\n`);
    shutdown(1);
  });

  child.on("exit", (code) => {
    if (shuttingDown) return;
    process.stderr.write(`${RED}[${service.name}]${WHITE} exited with code ${code ?? "null"}\n`);
    shutdown(code ?? 1);
  });

  children.push(child);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (isWindows) {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(code), 500);
}

const apiState = await healthyApi();
const reuseApi = process.argv.includes("--reuse") || process.env.VISION_REUSE_API === "1";

if (apiState && !reuseApi) {
  process.stderr.write(
    `${YELLOW}An API is already running on http://localhost:${apiPort}${WHITE}` +
      ` (face worker ${apiState.faceWorker?.ready ? "ready" : "warming up"}).\n` +
      `${YELLOW}It was started outside this terminal - often an orphan left by an earlier run.${WHITE}\n` +
      `${YELLOW}Run \`npm run stop\` and then \`npm run dev\` to start fresh.${WHITE}\n` +
      `${YELLOW}Or use \`npm run dev -- --reuse\` to start only the web client against it.${WHITE}\n`,
  );
  process.exit(1);
}

if (apiState) {
  process.stdout.write(
    `${YELLOW}Reusing the API already running on http://localhost:${apiPort}${WHITE}` +
      ` (face worker ${apiState.faceWorker?.ready ? "ready" : "warming up"}).\n`,
  );
  spawnService({ name: "web", color: MAGENTA, args: ["--prefix", "web", "run", "dev"] });
} else {
  spawnService({ name: "api", color: CYAN, args: ["--prefix", "server", "run", "dev"] });
  spawnService({ name: "web", color: MAGENTA, args: ["--prefix", "web", "run", "dev"] });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// Ctrl+C can make npm exit before the async handler above runs, orphaning
// nodemon and Vite. A synchronous exit hook guarantees the trees are killed.
process.on("exit", () => {
  for (const child of children) {
    if (child.exitCode !== null) continue;
    try {
      if (isWindows) {
        spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      } else {
        child.kill("SIGKILL");
      }
    } catch {
      // Best effort during teardown.
    }
  }
});

process.stdout.write(
  `${GREEN}Starting VISION${WHITE}  api http://localhost:${apiPort}  ` +
    `web http://localhost:5173 (Vite uses the next free port if 5173 is taken)\n`,
);
