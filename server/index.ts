import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { findDesignation, findUploadedDesignation, searchTermsFor } from "./designation.ts";
import { readDistribution, type Distribution } from "./distribution.ts";
import { NotAllowedError } from "./fetcher.ts";
import { searchCrossref } from "./providers/crossref.ts";
import { readGovuk, searchGovuk } from "./providers/govuk.ts";
import { readInternetArchive, searchInternetArchive, searchInternetArchiveTitle } from "./providers/internetArchive.ts";
import { handleMcp, MCP_PREFIX } from "./mcp/routes.ts";
import { startOwnerServers, stopOwnerServers } from "./mcp/ownerServers.ts";
import { OLLAMA_PREFIX, proxyToOllama } from "./ollamaProxy.ts";
import { readPage } from "./pageReader.ts";
import { searchLinkedIn } from "./providers/linkedin.ts";
import { searchNews } from "./providers/news.ts";
import { readOverheid, searchOverheid } from "./providers/overheid.ts";
import { searchReddit } from "./providers/reddit.ts";
import { blendedSearch } from "./providers/webSearch.ts";
import { openAlexWorks, SharedKeyError, sharedKeys, wikipediaToken } from "./sharedKeys.ts";
import { CatalogInputError, readCatalogSkill, searchCatalogs } from "./skillCatalog.ts";
import { ownerSkills } from "./skills.ts";
import type { DocumentText, DoctrineDocument, FurtherReading, SourceId } from "./types.ts";

// Keys shared with everyone who uses this assistant can be set in .env. Variables that are already set, such as
// those from Docker, take precedence.
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // There is no .env, which is fine.
}

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "127.0.0.1";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

// Some feeds only allow personal use, so a server that others can reach doesn't read them unless told to.
const IS_LOCAL = HOST === "127.0.0.1" || HOST === "localhost" || HOST === "::1";
const ALLOW_PERSONAL_USE_FEEDS = process.env.PERSONAL_USE_FEEDS !== undefined
  ? process.env.PERSONAL_USE_FEEDS === "true"
  : IS_LOCAL;

const REQUESTS_PER_MINUTE = 60;
const CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_CACHED_ITEMS = 30;
const MAX_QUERY_LENGTH = 200;

const DIST = resolve(import.meta.dirname, "../dist");
const API_PREFIX = "/research-api";
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

type TextResponse = { distribution: Distribution; pages: string[]; pageUrl: string };

const readers: Record<SourceId, (ref: string) => Promise<DocumentText>> = {
  govuk: readGovuk,
  archive: readInternetArchive,
  overheid: readOverheid,
};

const requestTimes = new Map<string, number[]>();
const cache = new Map<string, { at: number; value: unknown }>();

function isRateLimited(client: string): boolean {
  const recent = (requestTimes.get(client) ?? []).filter((time) => Date.now() - time < 60_000);
  recent.push(Date.now());
  requestTimes.set(client, recent);
  return recent.length > REQUESTS_PER_MINUTE;
}

/** Kept in memory only, and only for a limited time. */
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry !== undefined && Date.now() - entry.at < CACHE_MS) {
    return entry.value as T;
  }

  const value = await load();
  cache.set(key, { at: Date.now(), value: value });
  if (cache.size > MAX_CACHED_ITEMS) {
    cache.delete(cache.keys().next().value as string);
  }
  return value;
}

async function search(query: string, requested: string | undefined) {
  const sources: [string, Promise<DoctrineDocument[]>][] = [
    ["GOV.UK", searchGovuk(requested ?? query)],
    ["Internet Archive", searchInternetArchive(query)],
    ["Overheid.nl", searchOverheid(query)],
  ];
  if (requested !== undefined) {
    searchTermsFor(requested).forEach((term) => {
      sources.push(["Internet Archive", searchInternetArchiveTitle(term)]);
    });
  }
  const [results, further] = await Promise.all([
    Promise.allSettled(sources.map(([, documents]) => documents)),
    searchCrossref(query).catch((): FurtherReading[] => []),
  ]);

  const failedSources: string[] = [];
  const documents: DoctrineDocument[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      documents.push(...result.value);
    } else {
      console.warn(`${sources[index][0]} search failed:`, result.reason);
      failedSources.push(sources[index][0]);
    }
  });

  const seen = new Set<string>();
  const unique = documents
    .filter((document) => {
      const key = `${document.source}:${document.ref}`;
      const isNew = !seen.has(key);
      seen.add(key);
      return isNew;
    })
    .map((document) => ({
      ...document,
      designation: document.source === "archive" ? findUploadedDesignation(document.title) : findDesignation(document.title),
    }));

  return {
    documents: unique,
    requestedDesignation: requested ?? null,
    furtherReading: further,
    failedSources: [...new Set(failedSources)],
  };
}

async function readDocument(source: SourceId, ref: string): Promise<TextResponse> {
  const text = await readers[source](ref);
  const distribution = readDistribution(text.pages);

  // The text of a document marked as restricted never leaves this server.
  if (distribution.status === "restricted") {
    return { distribution: distribution, pages: [], pageUrl: "" };
  }
  return {
    distribution:
      distribution.status === "unknown" && text.officiallyPublished
        ? { status: "public", statement: "Published by the government at its official site." }
        : distribution,
    pages: text.pages,
    pageUrl: text.pageUrl,
  };
}

function send(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8", ...extraHeaders };
  if (ALLOWED_ORIGIN !== undefined && request.headers.origin === ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
    headers["Access-Control-Expose-Headers"] = Object.keys(extraHeaders).join(", ");
  }
  response.writeHead(status, headers);
  // Relayed answers are already JSON text.
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}

/**
 * Serves the built application. Only files inside its folder can be reached.
 */
function serveApplication(pathname: string, response: ServerResponse): void {
  let file: string;
  try {
    file = resolve(join(DIST, decodeURIComponent(pathname)));
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    response.writeHead(403).end();
    return;
  }

  // Anything else without a file extension is a page of the application itself.
  const isFile = existsSync(file) && statSync(file).isFile();
  if (!isFile && extname(file) !== "") {
    response.writeHead(404).end();
    return;
  }
  const target = isFile ? file : join(DIST, "index.html");
  if (!existsSync(target)) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("The application has not been built yet. Start it with: npm start");
    return;
  }

  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(target)] ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(target).pipe(response);
}

const API_PATHS = new Set(["/health", "/keys", "/skills", "/skills/catalog/search", "/skills/catalog/skill", "/wikipedia/token", "/doctrine/search", "/doctrine/text", "/news/search", "/reddit/search", "/web/search", "/linkedin/search", "/page/read"]);

const OPENALEX_PREFIX = "/openalex";

const WEB_SEARCHES: Record<string, (query: string) => Promise<unknown>> = {
  "/reddit/search": searchReddit,
  "/web/search": blendedSearch,
  "/linkedin/search": searchLinkedIn,
};

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (url.pathname.startsWith(`${OLLAMA_PREFIX}/`)) {
    proxyToOllama(url.pathname.slice(OLLAMA_PREFIX.length), request, response);
    return;
  }

  // The development proxy removes the prefix, and the built application uses it as is.
  const hasPrefix = url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`);
  const apiPath = hasPrefix ? url.pathname.slice(API_PREFIX.length) : url.pathname;

  if (apiPath.startsWith(MCP_PREFIX)) {
    if (isRateLimited(request.socket.remoteAddress ?? "unknown")) {
      send(request, response, 429, { error: "Too many requests" });
    } else {
      await handleMcp(apiPath, request, response, send);
    }
    return;
  }

  if (request.method !== "GET") {
    send(request, response, 405, { error: "Only GET requests are supported" });
    return;
  }

  const isOpenAlexPath = apiPath.startsWith(`${OPENALEX_PREFIX}/`);
  if (!hasPrefix && !API_PATHS.has(apiPath) && !isOpenAlexPath) {
    serveApplication(url.pathname, response);
    return;
  }

  if (isRateLimited(request.socket.remoteAddress ?? "unknown")) {
    send(request, response, 429, { error: "Too many requests" });
    return;
  }

  if (apiPath === "/health") {
    send(request, response, 200, { status: "ok", app: "research-assistant", docker: process.env.RUNS_IN_DOCKER === "true" });
  } else if (apiPath === "/keys") {
    send(request, response, 200, sharedKeys());
  } else if (apiPath === "/skills") {
    send(request, response, 200, { skills: ownerSkills() });
  } else if (apiPath === "/skills/catalog/search") {
    const query = (url.searchParams.get("q") ?? "").trim();
    if (query.length < 2 || query.length > MAX_QUERY_LENGTH) {
      send(request, response, 400, { error: "A search needs 2 to 200 characters" });
      return;
    }
    send(request, response, 200, await searchCatalogs(query));
  } else if (apiPath === "/skills/catalog/skill") {
    send(request, response, 200, await readCatalogSkill(
      url.searchParams.get("source") ?? "",
      url.searchParams.get("skillId") ?? "",
      url.searchParams.get("path") ?? undefined,
    ));
  } else if (apiPath === "/wikipedia/token") {
    send(request, response, 200, await wikipediaToken());
  } else if (isOpenAlexPath) {
    const relayed = await openAlexWorks(apiPath.slice(OPENALEX_PREFIX.length), url.searchParams);
    send(request, response, relayed.status, relayed.body, relayed.headers);
  } else if (apiPath === "/doctrine/search") {
    const query = (url.searchParams.get("q") ?? "").trim();
    if (query === "" || query.length > MAX_QUERY_LENGTH) {
      send(request, response, 400, { error: "A search needs a query of up to 200 characters" });
      return;
    }
    const requested = findDesignation(`${query} ${url.searchParams.get("question") ?? ""}`);
    send(request, response, 200, await cached(`search:${query.toLowerCase()}:${requested}`, () => search(query, requested)));
  } else if (apiPath === "/news/search") {
    const query = (url.searchParams.get("q") ?? "").trim();
    if (query === "" || query.length > MAX_QUERY_LENGTH) {
      send(request, response, 400, { error: "A search needs a query of up to 200 characters" });
      return;
    }
    send(request, response, 200, await searchNews(query, ALLOW_PERSONAL_USE_FEEDS));
  } else if (apiPath === "/page/read") {
    const address = url.searchParams.get("url") ?? "";
    if (address === "") {
      send(request, response, 400, { error: "An address is needed" });
      return;
    }
    if (!ALLOW_PERSONAL_USE_FEEDS) {
      send(request, response, 403, { error: "Opening pages is only available when this server runs on your own computer" });
      return;
    }
    send(request, response, 200, await readPage(address));
  } else if (WEB_SEARCHES[apiPath] !== undefined) {
    const query = (url.searchParams.get("q") ?? "").trim();
    if (query === "" || query.length > MAX_QUERY_LENGTH) {
      send(request, response, 400, { error: "A search needs a query of up to 200 characters" });
      return;
    }
    // These read the pages of search engines automatically, which is only meant for personal use.
    if (!ALLOW_PERSONAL_USE_FEEDS) {
      send(request, response, 403, { error: "Web search is only available when this server runs on your own computer" });
      return;
    }
    send(request, response, 200, await WEB_SEARCHES[apiPath](query));
  } else if (apiPath === "/doctrine/text") {
    const source = url.searchParams.get("source") as SourceId;
    const ref = url.searchParams.get("ref") ?? "";
    if (!Object.hasOwn(readers, source) || ref === "") {
      send(request, response, 400, { error: "A source and reference are needed" });
      return;
    }
    send(request, response, 200, await cached(`text:${source}:${ref}`, () => readDocument(source, ref)));
  } else {
    send(request, response, 404, { error: "Not found" });
  }
}

const server = createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    console.error("request failed:", error);
    const status = error instanceof SharedKeyError ? 404 : error instanceof NotAllowedError ? 403 : error instanceof CatalogInputError ? 400 : 502;
    send(request, response, status, { error: error instanceof Error ? error.message : "Request failed" });
  });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(error.code === "EADDRINUSE" ? `Port ${PORT} is already in use.` : error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Research server listening on http://${HOST}:${PORT}`);
  startOwnerServers();
});

function stop(): void {
  // Programs started for MCP servers stop with this one.
  void stopOwnerServers().finally(() => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}

process.on("SIGTERM", stop);
process.on("SIGINT", stop);
// When started by the start script: stop if that script is gone, even if it was killed without warning.
process.on("disconnect", stop);
