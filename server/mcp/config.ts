/**
 * Reads the MCP servers the owner of this computer listed in config/mcp.json. Only this file can name a program to
 * start: nothing a browser sends can.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const CONFIG_PATH = process.env.MCP_CONFIG ?? resolve(import.meta.dirname, "../../config/mcp.json");

export type OwnerServer = {
  name: string;
  /** If other devices on the network can use it. Without this, only this computer can. */
  shared: boolean;
  /** Why it can't be used, if the config is wrong. Never contains the value of a secret. */
  problem?: string;
} & (
  | { kind: "program"; command: string; args: string[]; env: Record<string, string>; cwd?: string }
  | { kind: "http"; url: string; headers: Record<string, string> }
);

const SERVER_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,62}$/;

function isStringMap(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every((item) => typeof item === "string");
}

/**
 * Fills in ${NAME} from the environment, which includes .env.
 * @param missing Collects the names that aren't set
 */
export function fillIn(text: string, environment: Record<string, string | undefined>, missing: Set<string>): string {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
    const value = environment[name];
    if (value === undefined || value === "") {
      missing.add(name);
      return "";
    }
    return value;
  });
}

/**
 * @param text The content of mcp.json
 * @returns The listed servers. A server that is wrong is kept with its problem, so that the page can show it.
 */
export function parseConfig(text: string, environment: Record<string, string | undefined>): OwnerServer[] {
  const config = JSON.parse(text) as { mcpServers?: unknown };
  const listed = config.mcpServers;
  if (typeof listed !== "object" || listed === null || Array.isArray(listed)) {
    throw new Error('mcp.json needs an object named "mcpServers"');
  }

  return Object.entries(listed).map(([name, value]): OwnerServer => {
    const entry = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
    const shared = entry.shared === true;
    const invalid = (problem: string): OwnerServer => ({ kind: "http", name, shared, url: "", headers: {}, problem });

    if (!SERVER_NAME.test(name)) return invalid("The name can only have letters, numbers, spaces, dots, dashes and underscores.");
    const missing = new Set<string>();
    const fill = (item: string) => fillIn(item, environment, missing);
    const fillMap = (map: Record<string, string>) => Object.fromEntries(Object.entries(map).map(([key, item]) => [key, fill(item)]));
    const needs = () => `Set ${[...missing].join(", ")} in .env.`;

    if (typeof entry.url === "string") {
      if (entry.headers !== undefined && !isStringMap(entry.headers)) return invalid('"headers" must be names with text values.');
      const url = fill(entry.url);
      const headers = fillMap((entry.headers as Record<string, string> | undefined) ?? {});
      if (missing.size > 0) return invalid(needs());
      if (!/^https?:\/\//i.test(url)) return invalid('"url" must start with http:// or https://.');
      return { kind: "http", name, shared, url, headers };
    }

    if (typeof entry.command === "string" && entry.command !== "") {
      if (entry.args !== undefined && !(Array.isArray(entry.args) && entry.args.every((item) => typeof item === "string"))) {
        return invalid('"args" must be a list of texts.');
      }
      if (entry.env !== undefined && !isStringMap(entry.env)) return invalid('"env" must be names with text values.');
      const args = ((entry.args as string[] | undefined) ?? []).map(fill);
      const env = fillMap((entry.env as Record<string, string> | undefined) ?? {});
      if (missing.size > 0) return invalid(needs());
      return { kind: "program", name, shared, command: fill(entry.command), args, env, cwd: typeof entry.cwd === "string" ? entry.cwd : undefined };
    }

    return invalid('It needs a "command" to start, or a "url" to connect to.');
  });
}

/**
 * @returns The servers in mcp.json, none if the file doesn't exist, and what is wrong with the file if it can't be read
 */
export function readConfig(): { servers: OwnerServer[]; problem?: string } {
  if (!existsSync(CONFIG_PATH) || !statSync(CONFIG_PATH).isFile()) {
    return { servers: [] };
  }
  try {
    return { servers: parseConfig(readFileSync(CONFIG_PATH, "utf8"), process.env) };
  } catch (error) {
    return { servers: [], problem: `config/mcp.json can't be read: ${error instanceof Error ? error.message : "unknown problem"}` };
  }
}
