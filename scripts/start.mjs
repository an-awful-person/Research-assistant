#!/usr/bin/env node
// Starts everything the application needs, and stops what it started on exit.
// Usage: npm start (add -- --no-open to not open a browser), or: npm run start:dev
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WINDOWS = process.platform === "win32";
const DEV = process.argv.includes("--dev");
const OPEN_BROWSER = !process.argv.includes("--no-open");
const USE_SEARXNG = !process.argv.includes("--no-searxng");

const PORT = Number(process.env.PORT ?? 3001);
const VITE_PORT = 5173;
const SERVER_URL = `http://127.0.0.1:${PORT}`;
const OLLAMA_URL = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const MODELS_CONFIG = process.env.RESEARCH_MODELS_CONFIG ?? join(ROOT, "src/constants/models.config.json");

const SEARXNG_PORT = Number(process.env.SEARXNG_PORT ?? 8890);
const SEARXNG_URL = `http://127.0.0.1:${SEARXNG_PORT}`;
// The name holds the port of the application, so that a second copy doesn't remove the container of the first.
const SEARXNG_CONTAINER = `research-assistant-searxng-${PORT}`;
const SEARXNG_IMAGE = "docker.io/searxng/searxng:2026.10.24-ef0ec03da@sha256:7c7cbe509429e82755104b2a95f52085a98633c95d53f44e4e905fa3a59f08c8";

const MIN_NODE = [22, 18];
const STOP_TIMEOUT_MS = 5000;
const READY_TIMEOUT_MS = 30000;

/** Everything started here that has to be stopped again, in the order it was started. */
const children = [];
let isShuttingDown = false;
let searxngStarted = false;

function say(message) {
  console.log(`[start] ${message}`);
}

function fail(message) {
  console.error(`\n[start] ${message}\n`);
  return shutdown(1);
}

function isRunning(child) {
  return child.process.exitCode === null && child.process.signalCode === null;
}

function signalChild(child, signal) {
  if (!isRunning(child)) {
    return;
  }
  try {
    if (IS_WINDOWS) {
      spawnSync("taskkill", ["/pid", String(child.process.pid), "/T", ...(signal === "SIGKILL" ? ["/F"] : [])]);
    } else {
      // Children lead their own process group, so that this also reaches anything they started.
      process.kill(-child.process.pid, signal);
    }
  } catch {
    // It has already stopped.
  }
}

async function stopChild(child) {
  if (!isRunning(child)) {
    return;
  }
  const exited = new Promise((resolve) => child.process.once("exit", resolve));
  signalChild(child, "SIGTERM");
  const timeout = setTimeout(() => {
    say(`${child.name} did not stop in time, forcing it`);
    signalChild(child, "SIGKILL");
  }, STOP_TIMEOUT_MS);
  await exited;
  clearTimeout(timeout);
}

async function shutdown(code) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  // Stopped in reverse, so that nothing loses what it depends on while still running.
  for (const child of [...children].reverse()) {
    if (isRunning(child)) {
      say(`Stopping ${child.name}`);
      await stopChild(child);
    }
  }
  if (searxngStarted) {
    // Also when it had to be forced to stop, which can leave the container behind.
    removeSearxngContainer();
  }
  process.exit(code);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    console.log("");
    void shutdown(0);
  });
}

/**
 * Starts a process that keeps running. If it stops by itself, everything else is stopped as well, unless it is optional.
 */
function startChild(name, command, args, options = {}) {
  const child = {
    name: name,
    process: spawn(command, args, {
      cwd: ROOT,
      detached: !IS_WINDOWS,
      shell: IS_WINDOWS,
      stdio: options.stdio ?? ["ignore", "inherit", "inherit"],
      env: { ...process.env, ...options.env },
    }),
  };
  children.push(child);

  child.process.on("error", (error) => {
    if (options.optional) {
      say(`Could not start ${name}: ${error.message}`);
    } else {
      void fail(`Could not start ${name}: ${error.message}`);
    }
  });
  child.process.on("exit", (code, signal) => {
    if (options.optional) {
      if (!isShuttingDown) {
        options.onStopped?.(code, signal);
      }
    } else if (!isShuttingDown) {
      void fail(`${name} stopped unexpectedly (${signal ?? `exit code ${code}`}). Everything else is being stopped.`);
    }
  });
  return child;
}

/** Runs a command to completion, with its output visible. */
function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "inherit", shell: IS_WINDOWS });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response;
  } catch {
    return undefined;
  }
}

async function waitFor(url, timeoutMs = READY_TIMEOUT_MS) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end && !isShuttingDown) {
    if (await reachable(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
    return fail(`Node ${MIN_NODE.join(".")} or newer is needed, and this is ${process.versions.node}. Get it at https://nodejs.org`);
  }
  return true;
}

function newestChange(path) {
  if (!existsSync(path)) {
    return 0;
  }
  const stats = statSync(path);
  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }
  return Math.max(stats.mtimeMs, ...readdirSync(path).map((entry) => newestChange(join(path, entry))));
}

async function installDependencies() {
  const installed = join(ROOT, "node_modules/.package-lock.json");
  if (existsSync(installed) && statSync(installed).mtimeMs >= statSync(join(ROOT, "package-lock.json")).mtimeMs) {
    return;
  }
  say("Installing dependencies");
  if ((await run("npm", ["ci"])) !== 0) {
    await fail("Installing dependencies failed. See the messages above.");
  }
}

async function ensureOllama() {
  if (await reachable(`${OLLAMA_URL}/api/tags`)) {
    say("Ollama is already running, and will be left running");
    return;
  }

  const installed = spawnSync("ollama", ["--version"], { shell: IS_WINDOWS }).status === 0;
  if (!installed) {
    await fail("Ollama is needed to run the language models. Install it from https://ollama.com/download and start this again.");
    return;
  }

  // A system service may be starting by itself, so that gets a moment first.
  if (await waitFor(`${OLLAMA_URL}/api/tags`, 3000)) {
    say("Ollama is already running, and will be left running");
    return;
  }

  say("Starting Ollama");
  startChild("Ollama", "ollama", ["serve"]);
  if (!(await waitFor(`${OLLAMA_URL}/api/tags`))) {
    await fail("Ollama did not start in time.");
  }
}

async function ensureModels() {
  const config = JSON.parse(readFileSync(MODELS_CONFIG, "utf8"));
  const response = await reachable(`${OLLAMA_URL}/api/tags`);
  const installed = new Set(((await response?.json())?.models ?? []).map((model) => model.name));
  const missing = [...new Set(Object.values(config))].filter((model) => !installed.has(model));
  if (missing.length === 0) {
    return;
  }

  say(`These models are missing: ${missing.join(", ")}`);
  if (!process.stdin.isTTY) {
    await fail(`Install them with: ${missing.map((model) => `ollama pull ${model}`).join(" && ")}`);
    return;
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("[start] Download them now? They can be several gigabytes. [Y/n] ");
  prompt.close();
  if (/^n/i.test(answer.trim())) {
    await fail(`The application needs them. Install them later with: ${missing.map((model) => `ollama pull ${model}`).join(" && ")}`);
    return;
  }

  for (const model of missing) {
    if ((await run("ollama", ["pull", model])) !== 0) {
      await fail(`Downloading ${model} failed. See the messages above.`);
      return;
    }
  }
}

function dockerIsAvailable() {
  return spawnSync("docker", ["info"], { stdio: "ignore", timeout: 10000, shell: IS_WINDOWS }).status === 0;
}

function removeSearxngContainer() {
  spawnSync("docker", ["rm", "-f", SEARXNG_CONTAINER], { stdio: "ignore", timeout: 15000, shell: IS_WINDOWS });
}

/**
 * Starts SearXNG for web search. The application works without it, and doesn't wait for it, because the first start
 * downloads it.
 */
function startSearxng() {
  removeSearxngContainer();
  searxngStarted = true;
  say("Starting SearXNG for web search. The first time, this downloads it in the background");

  const child = startChild("SearXNG", "docker", [
    "run", "--rm", "--name", SEARXNG_CONTAINER,
    "--stop-timeout", "3",
    "-p", `127.0.0.1:${SEARXNG_PORT}:8080`,
    "-v", `${join(ROOT, "server/searxng/settings.yml")}:/etc/searxng/settings.yml:ro`,
    "-e", `SEARXNG_SECRET=${randomBytes(32).toString("hex")}`,
    SEARXNG_IMAGE,
  ], {
    optional: true,
    stdio: ["ignore", "ignore", "pipe"],
    onStopped: (code, signal) => {
      say(`SearXNG stopped (${signal ?? `exit code ${code}`}), so web search continues with DuckDuckGo alone. ${errors.trim().slice(-300)}`);
    },
  });

  let errors = "";
  child.process.stderr.on("data", (data) => {
    errors = `${errors}${data}`.slice(-1000);
  });
}

async function buildIfNeeded() {
  const built = join(ROOT, "dist/index.html");
  const sources = ["src", "public", "index.html", "vite.config.ts", "package.json"].map((path) => newestChange(join(ROOT, path)));
  if (existsSync(built) && statSync(built).mtimeMs >= Math.max(...sources)) {
    return;
  }
  say("Building the application");
  if ((await run("npm", ["run", "build"])) !== 0) {
    await fail("Building the application failed. See the messages above.");
  }
}

/**
 * @returns false if a copy of this application is already running on the port
 */
async function checkPort() {
  const response = await reachable(`${SERVER_URL}/health`);
  if (response === undefined) {
    return true;
  }

  const body = await response.json().catch(() => ({}));
  if (body?.app === "research-assistant") {
    if (body?.docker === true) {
      say(`The application is already running in Docker at ${SERVER_URL}, so nothing new was started.`);
      say('To restart it: "docker compose restart". After changing the code: "docker compose up -d --build". To stop it: "docker compose down".');
      say("To use npm start instead, stop the Docker version first.");
    } else {
      say(`The application is already running at ${SERVER_URL}`);
    }
    openBrowser(SERVER_URL);
    process.exit(0);
  }
  await fail(`Port ${PORT} is in use by another program. Stop that program, or choose another port with: PORT=3002 npm start`);
  return false;
}

function openBrowser(url) {
  if (!OPEN_BROWSER) {
    return;
  }
  const [command, ...args] = IS_WINDOWS
    ? ["cmd", "/c", "start", "", url]
    : process.platform === "darwin"
      ? ["open", url]
      : ["xdg-open", url];
  const opener = spawn(command, args, { detached: true, stdio: "ignore" });
  opener.on("error", () => say(`Could not open a browser. Go to ${url}`));
  opener.unref();
}

async function main() {
  checkNode();
  await installDependencies();
  await ensureOllama();
  await ensureModels();
  await checkPort();
  if (!DEV) {
    await buildIfNeeded();
  }
  if (isShuttingDown) {
    return;
  }

  const runSearxng = USE_SEARXNG && dockerIsAvailable();
  if (USE_SEARXNG && !runSearxng) {
    say('Docker isn\'t available, so web search uses DuckDuckGo alone. To add SearXNG, install Docker, on Linux run "sudo usermod -aG docker $USER", log in again and restart this.');
  }

  // The channel lets the server notice when this script is gone, even if it was killed without warning.
  startChild("the research server", process.execPath, ["server/index.ts"], {
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    env: { PORT: String(PORT), OLLAMA_URL: OLLAMA_URL, ...(runSearxng ? { SEARXNG_URL: SEARXNG_URL } : {}) },
  });
  if (!(await waitFor(`${SERVER_URL}/health`))) {
    await fail("The research server did not start in time.");
    return;
  }
  if (runSearxng) {
    startSearxng();
  }

  let url = SERVER_URL;
  if (DEV) {
    startChild("the development server", process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(VITE_PORT), "--strictPort"]);
    url = `http://localhost:${VITE_PORT}`;
    if (!(await waitFor(url))) {
      await fail("The development server did not start in time.");
      return;
    }
  }

  if (!isShuttingDown) {
    say(`Ready at ${url}. Press Ctrl+C to stop.`);
    openBrowser(url);
  }
}

main().catch((error) => fail(`Starting failed: ${error.message}`));
