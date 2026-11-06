import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";

const OLLAMA_URL = new URL(process.env.OLLAMA_URL ?? "http://127.0.0.1:11434");
export const OLLAMA_PREFIX = "/ollama";

/** Only what the application uses, so that others on the network can't pull, change or delete models. */
const ALLOWED = new Set(["POST /api/chat", "POST /api/embed", "GET /api/tags", "GET /api/version"]);

const MAX_BODY_BYTES = 20 * 1024 * 1024;
// A single question can make many model calls, so these have their own, higher limit.
const REQUESTS_PER_MINUTE = 600;
const recentRequests = new Map<string, number[]>();

function isRateLimited(client: string): boolean {
  const now = Date.now();
  const recent = (recentRequests.get(client) ?? []).filter((time) => now - time < 60_000);
  recent.push(now);
  recentRequests.set(client, recent);
  return recent.length > REQUESTS_PER_MINUTE;
}

function refuse(response: ServerResponse, status: number, error: string): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: error }));
}

/**
 * Passes the model calls of the browser on to Ollama, so that other devices can use the model on this computer.
 * @param path The path after the prefix, like /api/chat
 */
export function proxyToOllama(path: string, request: IncomingMessage, response: ServerResponse): void {
  if (!ALLOWED.has(`${request.method} ${path}`)) {
    refuse(response, 404, "Not found");
    return;
  }
  if (isRateLimited(request.socket.remoteAddress ?? "unknown")) {
    refuse(response, 429, "Too many requests");
    return;
  }
  if (Number(request.headers["content-length"] ?? 0) > MAX_BODY_BYTES) {
    refuse(response, 413, "The request is too large");
    return;
  }

  const send = OLLAMA_URL.protocol === "https:" ? httpsRequest : httpRequest;
  const upstream = send(new URL(path, OLLAMA_URL), {
    method: request.method,
    headers: { "Content-Type": "application/json" },
  }, (answer) => {
    response.writeHead(answer.statusCode ?? 502, {
      "Content-Type": answer.headers["content-type"] ?? "application/json; charset=utf-8",
    });
    answer.pipe(response);
  });
  upstream.on("error", () => {
    if (!response.headersSent) {
      refuse(response, 502, "Ollama can't be reached on the computer running the research assistant");
    } else {
      response.destroy();
    }
  });
  response.on("close", () => upstream.destroy());

  let received = 0;
  request.on("data", (chunk: Buffer) => {
    received += chunk.length;
    if (received > MAX_BODY_BYTES) {
      upstream.destroy();
      if (!response.headersSent) {
        refuse(response, 413, "The request is too large");
      }
      request.destroy();
      return;
    }
    upstream.write(chunk);
  });
  request.on("end", () => upstream.end());
}
