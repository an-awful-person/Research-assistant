import { connectHttp, connectProgram, type McpConnection, type McpResult, type McpTool } from "./connections.ts";
import { readConfig, type OwnerServer } from "./config.ts";

const RETRY_AFTER_MS = 30_000;

type Running = {
  server: OwnerServer;
  connection?: McpConnection;
  tools: McpTool[];
  problem?: string;
  starting?: Promise<void>;
  lastAttempt: number;
};

export type ServerView = { name: string; shared: boolean; ready: boolean; problem?: string; tools: McpTool[] };

const running = new Map<string, Running>();
let configProblem: string | undefined;

async function connect(entry: Running): Promise<void> {
  const { server } = entry;
  if (server.problem !== undefined) return;
  entry.lastAttempt = Date.now();
  try {
    const connected = server.kind === "program"
      ? await connectProgram(server.command, server.args, server.env, server.cwd)
      : await connectHttp(server.url, server.headers, fetch);
    connected.connection.onClosed = () => {
      entry.connection = undefined;
    };
    entry.connection = connected.connection;
    entry.tools = connected.tools;
    entry.problem = undefined;
  } catch (error) {
    entry.connection = undefined;
    entry.problem = error instanceof Error ? error.message : "It could not be started.";
    console.error(`MCP server ${server.name} could not be reached: ${entry.problem}`);
  }
}

function ensureConnected(entry: Running): Promise<void> {
  if (entry.connection !== undefined || entry.server.problem !== undefined) return Promise.resolve();
  if (entry.starting !== undefined) return entry.starting;
  if (Date.now() - entry.lastAttempt < RETRY_AFTER_MS) return Promise.resolve();
  entry.starting = connect(entry).finally(() => (entry.starting = undefined));
  return entry.starting;
}

/** Reads config/mcp.json and connects in the background, so that a slow server doesn't delay the start. */
export function startOwnerServers(): void {
  const config = readConfig();
  configProblem = config.problem;
  if (config.problem !== undefined) console.error(config.problem);
  config.servers.forEach((server) => {
    const entry: Running = { server, tools: [], lastAttempt: 0, problem: server.problem };
    running.set(server.name, entry);
    void ensureConnected(entry);
  });
}

/**
 * @param isLocal If the request comes from this computer
 * @returns The servers that request may use
 */
export async function ownerServers(isLocal: boolean): Promise<{ servers: ServerView[]; problem?: string }> {
  const visible = [...running.values()].filter((entry) => isLocal || entry.server.shared);
  await Promise.all(visible.map(ensureConnected));
  return {
    servers: visible.map((entry) => ({
      name: entry.server.name,
      shared: entry.server.shared,
      ready: entry.connection !== undefined,
      problem: entry.server.problem ?? entry.problem,
      tools: entry.tools,
    })),
    // Others don't need to know about the owner's configuration.
    ...(isLocal && configProblem !== undefined ? { problem: configProblem } : {}),
  };
}

export class McpNotAvailableError extends Error {}

export async function callOwnerTool(serverName: string, tool: string, args: Record<string, unknown>, isLocal: boolean): Promise<McpResult> {
  const entry = running.get(serverName);
  if (entry === undefined || !(isLocal || entry.server.shared)) {
    throw new McpNotAvailableError("This MCP server isn't available here.");
  }
  await ensureConnected(entry);
  if (entry.connection === undefined) {
    throw new Error(entry.problem ?? "This MCP server isn't running.");
  }
  if (!entry.tools.some((known) => known.name === tool)) {
    throw new McpNotAvailableError("This server doesn't offer that tool.");
  }
  return entry.connection.callTool(tool, args);
}

/**
 * Checks a server right now, also if it failed a moment ago: asking for its tools works on every protocol version.
 * @returns If it works, and otherwise what is wrong
 */
export async function testOwnerServer(serverName: string, isLocal: boolean): Promise<{ ok: boolean; toolCount: number; problem?: string }> {
  const entry = running.get(serverName);
  if (entry === undefined || !(isLocal || entry.server.shared)) {
    throw new McpNotAvailableError("This MCP server isn't available here.");
  }
  if (entry.server.problem !== undefined) {
    return { ok: false, toolCount: 0, problem: entry.server.problem };
  }

  if (entry.connection !== undefined) {
    try {
      entry.tools = await entry.connection.listTools();
      entry.problem = undefined;
      return { ok: true, toolCount: entry.tools.length };
    } catch {
      // It stopped working, so it's started again below.
      await entry.connection?.close().catch(() => undefined);
      entry.connection = undefined;
    }
  }

  entry.starting ??= connect(entry).finally(() => (entry.starting = undefined));
  await entry.starting;
  return entry.connection !== undefined
    ? { ok: true, toolCount: entry.tools.length }
    : { ok: false, toolCount: 0, problem: entry.problem ?? "It could not be started." };
}

export async function stopOwnerServers(): Promise<void> {
  await Promise.allSettled([...running.values()].map((entry) => entry.connection?.close()));
}
