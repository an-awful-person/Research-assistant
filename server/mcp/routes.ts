import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import { connectHttp, McpSignInError } from "./connections.ts";
import { callOwnerTool, McpNotAvailableError, ownerServers, testOwnerServer } from "./ownerServers.ts";
import { NotPublicError, publicFetch, refusalForPersonalServer } from "./publicFetch.ts";

type Send = (request: IncomingMessage, response: ServerResponse, status: number, body: unknown) => void;

const MAX_BODY_BYTES = 1_000_000;
const EXTRA_HOSTS = (process.env.MCP_ALLOWED_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter((host) => host !== "");

export const MCP_PREFIX = "/mcp/";

/** @returns If an address is this computer, which only the operating system can say */
export function isLocalAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/**
 * A website can make its own name point at this computer, and would then look like a local visitor. Such names are
 * public, so only addresses, local names and names the owner listed are accepted.
 */
export function isTrustedHost(hostHeader: string | undefined): boolean {
  if (hostHeader === undefined) return false;
  const host = hostHeader.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  return isIP(host) !== 0 || !host.includes(".") || /\.(local|lan|home|internal)$/.test(host) || EXTRA_HOSTS.includes(host);
}

/** Other websites can't use these routes: a browser says where a request comes from, and it must be this page. */
function isSameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("The request is too large"));
        request.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    request.on("error", reject);
    request.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new BadRequest("The request isn't valid JSON"));
      }
    });
  });
}

class BadRequest extends Error {}

function text(value: unknown, what: string, limit = 2048): string {
  if (typeof value !== "string" || value === "" || value.length > limit) {
    throw new BadRequest(`${what} is missing or too long`);
  }
  return value;
}

function argumentsOf(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequest("The arguments must be an object");
  return value as Record<string, unknown>;
}

/** The address and optional key of a server someone added, which are only used for this one request. */
function personalServer(body: Record<string, unknown>): { url: string; headers: Record<string, string> } {
  const url = text(body.url, "The address");
  const refusal = refusalForPersonalServer(url);
  if (refusal !== undefined) throw new NotPublicError(refusal);

  if (body.headerValue === undefined || body.headerValue === "") {
    return { url, headers: {} };
  }
  const name = text(body.headerName, "The header name", 64);
  const value = text(body.headerValue, "The key", 8192);
  if (!/^[A-Za-z0-9-]+$/.test(name) || /[\r\n]/.test(value)) {
    throw new BadRequest("The header name or key has characters that aren't allowed");
  }
  return { url, headers: { [name]: value } };
}

/**
 * The routes for MCP. Keys of people's own servers are only used for the request they came with, and are never
 * written anywhere: errors passed on from here don't contain them.
 */
export async function handleMcp(path: string, request: IncomingMessage, response: ServerResponse, send: Send): Promise<void> {
  if (!isTrustedHost(request.headers.host) || !isSameOrigin(request)) {
    send(request, response, 403, { error: "This address isn't allowed to use MCP servers. The owner can add its name to MCP_ALLOWED_HOSTS." });
    return;
  }
  const isLocal = isLocalAddress(request.socket.remoteAddress);

  try {
    if (path === "/mcp/servers" && request.method === "GET") {
      send(request, response, 200, await ownerServers(isLocal));
      return;
    }
    if (request.method !== "POST" || !(request.headers["content-type"] ?? "").startsWith("application/json")) {
      send(request, response, 405, { error: "Not allowed" });
      return;
    }

    const body = await readJson(request);
    if (path === "/mcp/test") {
      send(request, response, 200, await testOwnerServer(text(body.server, "The server"), isLocal));
    } else if (path === "/mcp/call") {
      send(request, response, 200, await callOwnerTool(text(body.server, "The server"), text(body.tool, "The tool"), argumentsOf(body.arguments), isLocal));
    } else if (path === "/mcp/personal/tools" || path === "/mcp/personal/call") {
      const { url, headers } = personalServer(body);
      const { connection, tools } = await connectHttp(url, headers, publicFetch);
      try {
        if (path === "/mcp/personal/tools") {
          send(request, response, 200, { tools });
        } else {
          send(request, response, 200, await connection.callTool(text(body.tool, "The tool"), argumentsOf(body.arguments)));
        }
      } finally {
        await connection.close().catch(() => undefined);
      }
    } else {
      send(request, response, 404, { error: "Not found" });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The request failed";
    if (error instanceof BadRequest) send(request, response, 400, { error: message });
    else if (error instanceof McpSignInError) send(request, response, 401, { error: message });
    else if (error instanceof NotPublicError) send(request, response, 403, { error: message });
    else if (error instanceof McpNotAvailableError) send(request, response, 404, { error: message });
    else send(request, response, 502, { error: `The MCP server could not be reached: ${message}` });
  }
}
