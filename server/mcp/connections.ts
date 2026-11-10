/**
 * Talks to MCP servers. Servers on the 2026-07-28 revision take each request on its own; older ones need the
 * handshake and sessions that the official library handles.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";

const MODERN_VERSION = "2026-07-28";
const CLIENT = { name: "research-assistant", version: "1.0.0" };
const LIST_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 60_000;
const MAX_TOOLS = 200;
const MAX_RESULT_LENGTH = 200_000;

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Only the server's own claim, which is why tools still start switched off. */
  readOnly: boolean;
};

export type McpResult = { text: string; isError: boolean; link?: string; needsKey?: boolean };

const MISSING_KEY = /\b(api[ _-]?key|access[ _-]?(key|token)|bearer|unauthori[sz]ed|authentication (is )?(required|failed)|(invalid|missing|expired) (\w+ )?(key|token|credentials?)|requires? (an? )?(\w+ ){0,3}key)\b/i;
const MAX_EXPLANATION = 400;

/** @returns If a server's error is about a missing or wrong key */
export function mentionsMissingKey(text: string): boolean {
  return MISSING_KEY.test(text);
}

/** @returns What a server said, without the wrapping of the library or any HTML around it */
export function serverExplanation(message: string): string {
  const body = message.replace(/^Streamable HTTP error:\s*(Error POSTing to endpoint:\s*)?/i, "").trim();
  let text = body;
  try {
    const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
    const error = parsed.error as { message?: unknown } | string | undefined;
    text = typeof error === "string" ? error : typeof error?.message === "string" ? error.message : typeof parsed.message === "string" ? parsed.message : body;
  } catch {
    // It isn't JSON, so it's used as it is.
  }
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_EXPLANATION);
}

function missingKeyResult(explanation: string): McpResult {
  return { text: explanation || "This server needs a key to use this tool.", isError: true, needsKey: true };
}

export interface McpConnection {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpResult>;
  close(): Promise<void>;
  onClosed?: () => void;
}

/** The server wants a login that can't be given here. */
export class McpSignInError extends Error {}

type RawTool = { name?: unknown; description?: unknown; inputSchema?: unknown; annotations?: { readOnlyHint?: unknown } };

function toTool(raw: RawTool): McpTool | undefined {
  if (typeof raw.name !== "string" || raw.name === "") {
    return undefined;
  }
  return {
    name: raw.name,
    description: typeof raw.description === "string" ? raw.description : "",
    inputSchema: typeof raw.inputSchema === "object" && raw.inputSchema !== null ? (raw.inputSchema as Record<string, unknown>) : {},
    readOnly: raw.annotations?.readOnlyHint === true,
  };
}

/** Turns what a tool returned into text. Pictures and sound are named, not passed on. */
export function resultOf(raw: { content?: unknown; structuredContent?: unknown; isError?: unknown }): McpResult {
  let link: string | undefined;
  const parts = (Array.isArray(raw.content) ? raw.content : []).map((item: Record<string, unknown>): string => {
    if (item.type === "text" && typeof item.text === "string") return item.text;
    if (item.type === "image") return "[The tool returned a picture, which can't be read here.]";
    if (item.type === "audio") return "[The tool returned sound, which can't be read here.]";
    if (item.type === "resource_link") {
      if (typeof item.uri === "string" && /^https?:/i.test(item.uri)) link ??= item.uri;
      return `${String(item.name ?? "Link")}: ${String(item.uri ?? "")}`;
    }
    if (item.type === "resource") {
      const resource = (item.resource ?? {}) as Record<string, unknown>;
      if (typeof resource.uri === "string" && /^https?:/i.test(resource.uri)) link ??= resource.uri;
      return typeof resource.text === "string" ? resource.text : `[The tool returned a file: ${String(resource.uri ?? "")}]`;
    }
    return "";
  });
  let text = parts.filter((part) => part !== "").join("\n");
  if (text === "" && raw.structuredContent !== undefined) {
    text = JSON.stringify(raw.structuredContent, null, 2);
  }
  if (text.length > MAX_RESULT_LENGTH) {
    text = `${text.slice(0, MAX_RESULT_LENGTH)}\n[The rest of this result was cut off.]`;
  }
  const isError = raw.isError === true;
  return { text, isError, ...(link !== undefined ? { link } : {}), ...(isError && mentionsMissingKey(text) ? { needsKey: true } : {}) };
}

/** The handshake and sessions of the versions before 2026-07-28, through the official library. */
class SessionConnection implements McpConnection {
  onClosed?: () => void;
  private _client: Client;

  constructor(client: Client) {
    this._client = client;
    client.onclose = () => this.onClosed?.();
  }

  async listTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await this._client.listTools(cursor === undefined ? undefined : { cursor }, { timeout: LIST_TIMEOUT_MS });
      tools.push(...page.tools.flatMap((tool) => toTool(tool as RawTool) ?? []));
      cursor = page.nextCursor;
    } while (cursor !== undefined && tools.length < MAX_TOOLS);
    return tools.slice(0, MAX_TOOLS);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpResult> {
    try {
      return resultOf((await this._client.callTool({ name, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS })) as Parameters<typeof resultOf>[0]);
    } catch (error) {
      if (error instanceof StreamableHTTPError && error.code !== undefined && error.code >= 400 && error.code < 500) {
        const explanation = serverExplanation(error.message);
        if (error.code === 401 || error.code === 403 || mentionsMissingKey(explanation)) {
          return missingKeyResult(explanation);
        }
      }
      throw error;
    }
  }

  close(): Promise<void> {
    return this._client.close();
  }
}

/** This server doesn't speak the 2026-07-28 revision. */
class OlderServerError extends Error {}

function readEventStream(text: string, id: number): unknown {
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (data === "") continue;
    const message = JSON.parse(data) as { id?: unknown };
    if (message.id === id) return message;
  }
  throw new Error("The server's answer ended early");
}

/** The 2026-07-28 revision over HTTP: every request stands alone and says which version it uses. */
export class StatelessConnection implements McpConnection {
  private _url: string;
  private _headers: Record<string, string>;
  private _fetch: typeof fetch;
  private _nextId = 1;

  constructor(url: string, headers: Record<string, string>, fetcher: typeof fetch) {
    this._url = url;
    this._headers = headers;
    this._fetch = fetcher;
  }

  private async request(method: string, params: Record<string, unknown>, timeout: number): Promise<Record<string, unknown>> {
    const id = this._nextId++;
    const name = typeof params.name === "string" && /^[\x20-\x7e]+$/.test(params.name) ? params.name : undefined;
    const response = await this._fetch(this._url, {
      method: "POST",
      signal: AbortSignal.timeout(timeout),
      headers: {
        ...this._headers,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": MODERN_VERSION,
        "Mcp-Method": method,
        ...(name !== undefined ? { "Mcp-Name": name } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params: {
          ...params,
          _meta: {
            "io.modelcontextprotocol/protocolVersion": MODERN_VERSION,
            "io.modelcontextprotocol/clientCapabilities": {},
            "io.modelcontextprotocol/clientInfo": CLIENT,
          },
        },
      }),
    });

    if (response.status === 401 || response.status === 403) {
      throw new McpSignInError(signInMessage(response.headers.get("www-authenticate"), Object.keys(this._headers).length > 0));
    }
    const body = await response.text();
    if (!response.ok) {
      let error: { code?: unknown; message?: unknown; data?: { supported?: unknown } } | undefined;
      try {
        error = (JSON.parse(body) as { error?: typeof error }).error;
      } catch {
        // Not a modern error, so this is an older server.
      }
      const supported = error?.data?.supported;
      if (Array.isArray(supported) && supported.includes(MODERN_VERSION)) {
        throw new Error(`The server refused the request: ${String(error?.message ?? response.status)}`);
      }
      if (error?.code === -32601) {
        throw new Error(`The server doesn't offer ${method}`);
      }
      throw new OlderServerError(body);
    }

    const message = ((response.headers.get("content-type") ?? "").includes("text/event-stream")
      ? readEventStream(body, id)
      : JSON.parse(body)) as { result?: Record<string, unknown>; error?: { message?: unknown } };
    if (message.error !== undefined) {
      throw new Error(String(message.error.message ?? "The server reported an error"));
    }
    return message.result ?? {};
  }

  async listTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: unknown;
    do {
      const page = await this.request("tools/list", cursor === undefined ? {} : { cursor }, LIST_TIMEOUT_MS);
      tools.push(...(Array.isArray(page.tools) ? page.tools : []).flatMap((tool: RawTool) => toTool(tool) ?? []));
      cursor = page.nextCursor;
    } while (typeof cursor === "string" && tools.length < MAX_TOOLS);
    return tools.slice(0, MAX_TOOLS);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpResult> {
    let result: Record<string, unknown>;
    try {
      result = await this.request("tools/call", { name, arguments: args }, CALL_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof McpSignInError) {
        return missingKeyResult(error.message);
      }
      if (error instanceof OlderServerError) {
        const explanation = serverExplanation(error.message);
        if (mentionsMissingKey(explanation)) return missingKeyResult(explanation);
        throw new Error(explanation || "The server refused the request");
      }
      throw error;
    }
    if (result.resultType === "input_required") {
      return { text: "This tool asked for more input while running, which the assistant can't give.", isError: true };
    }
    return resultOf(result);
  }

  async close(): Promise<void> {}
}

function signInMessage(authenticate: string | null, hasKey: boolean): string {
  if (authenticate !== null && /resource_metadata|oauth/i.test(authenticate) && !hasKey) {
    return "This server needs a sign-in. If it accepts an API key, add one. A sign-in in a browser window (OAuth) isn't possible yet.";
  }
  return hasKey ? "The server refused the key. Check the key and the header name." : "This server needs a key.";
}

function newClient(): Client {
  return new Client(CLIENT, { capabilities: {} });
}

/**
 * Connects over HTTP. As the specification advises, it first tries a modern request, and falls back to the handshake.
 * @param fetcher How to reach the server: for addresses people add themselves, one that refuses the local network
 */
export async function connectHttp(url: string, headers: Record<string, string>, fetcher: typeof fetch): Promise<{ connection: McpConnection; tools: McpTool[] }> {
  const modern = new StatelessConnection(url, headers, fetcher);
  try {
    return { connection: modern, tools: await modern.listTools() };
  } catch (error) {
    if (!(error instanceof OlderServerError)) throw error;
  }

  const client = newClient();
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers }, fetch: fetcher });
  try {
    await client.connect(transport, { timeout: LIST_TIMEOUT_MS });
  } catch (error) {
    await client.close().catch(() => undefined);
    if (error instanceof UnauthorizedError || (error instanceof StreamableHTTPError && (error.code === 401 || error.code === 403))) {
      throw new McpSignInError(signInMessage(null, Object.keys(headers).length > 0));
    }
    throw error;
  }
  const connection = new SessionConnection(client);
  return { connection, tools: await connection.listTools() };
}

/** Starts a local program that was listed by the owner, and talks to it over its input and output. */
export async function connectProgram(command: string, args: string[], env: Record<string, string>, cwd?: string): Promise<{ connection: McpConnection; tools: McpTool[] }> {
  const client = newClient();
  const transport = new StdioClientTransport({ command, args, env: { ...getDefaultEnvironment(), ...env }, cwd, stderr: "ignore" });
  try {
    await client.connect(transport, { timeout: LIST_TIMEOUT_MS * 2 });
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
  const connection = new SessionConnection(client);
  return { connection, tools: await connection.listTools() };
}
