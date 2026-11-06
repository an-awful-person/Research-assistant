import { lookup } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { gunzipSync } from "node:zlib";
import { nextForHost, USER_AGENT } from "./fetcher.ts";
import { plainText } from "./text.ts";

export type ReadPage = {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
};

const MAX_PAGE_BYTES = 2_000_000;
const MAX_ROBOTS_BYTES = 500_000;
const MAX_TEXT_LENGTH = 300_000;
const MIN_TEXT_LENGTH = 50;
const PAGE_TIMEOUT_MS = 15_000;
const ROBOTS_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;
const ROBOTS_CACHE_MS = 60 * 60 * 1000;
const ROBOTS_AGENT = "research-assistant";
const TEXT_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];

/** Their terms or robots rules don't allow automated reading, whatever a robots file says at the moment. */
const REFUSED_SITES = ["reddit.com", "linkedin.com"];

const NOT_PUBLIC = new BlockList();
[
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
].forEach(([address, prefix]) => NOT_PUBLIC.addSubnet(address as string, prefix as number, "ipv4"));
[["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["64:ff9b::", 96]]
  .forEach(([address, prefix]) => NOT_PUBLIC.addSubnet(address as string, prefix as number, "ipv6"));

export class PageRefusedError extends Error {}

/**
 * @returns If an address is on the public internet, and not on this computer or its network
 */
export function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  const actual = mapped ?? address;
  const family = isIP(actual);
  return family !== 0 && !NOT_PUBLIC.check(actual, family === 4 ? "ipv4" : "ipv6");
}

/**
 * Checks the address at the moment of connecting, so that a name can't point somewhere else after being checked.
 */
function publicLookup(
  hostname: string,
  options: { all?: boolean },
  callback: (error: Error | null, address?: unknown, family?: number) => void,
): void {
  lookup(hostname, { all: true }, (error, addresses) => {
    if (error) {
      callback(error);
    } else if (addresses.length === 0 || !addresses.every(({ address }) => isPublicAddress(address))) {
      callback(new PageRefusedError(`${hostname} is not on the public internet`));
    } else if (options.all) {
      callback(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
}

/**
 * @returns Why an address can't be opened, if it can't
 */
export function refusalFor(address: string): string | undefined {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return "This is not a valid address";
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "Only web pages can be opened";
  }
  if (url.username !== "" || url.password !== "") {
    return "Addresses with a login can't be opened";
  }
  if (url.port !== "") {
    return "Only the standard web ports can be used";
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return `${host} is not on the public internet`;
  }
  if (isIP(host) !== 0 && !isPublicAddress(host)) {
    return `${host} is not on the public internet`;
  }
  if (REFUSED_SITES.some((site) => host === site || host.endsWith(`.${site}`))) {
    return `${site(host)} doesn't allow automated reading of its pages. Open the link yourself instead`;
  }
  return undefined;
}

function site(host: string): string {
  return REFUSED_SITES.find((name) => host === name || host.endsWith(`.${name}`)) ?? host;
}

type RawResponse = { status: number; contentType: string; location?: string; bytes: Buffer; truncated: boolean };

/**
 * One request without following redirects. It stops at the limit, and only reads the body of text.
 */
function requestOnce(url: URL, maxBytes: number, timeoutMs: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = send(url, {
      method: "GET",
      agent: false,
      lookup: publicLookup as never,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html, text/plain;q=0.9",
        "Accept-Encoding": "gzip",
      },
    }, (response: IncomingMessage) => {
      const status = response.statusCode ?? 0;
      const contentType = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      const isRedirect = status >= 300 && status < 400;
      if (isRedirect || !(status === 200 ? TEXT_TYPES.includes(contentType) || maxBytes === MAX_ROBOTS_BYTES : false)) {
        response.destroy();
        clearTimeout(timer);
        resolve({ status, contentType, location: response.headers.location, bytes: Buffer.alloc(0), truncated: false });
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      const finish = () => {
        clearTimeout(timer);
        const body = Buffer.concat(chunks);
        const isGzip = response.headers["content-encoding"] === "gzip";
        try {
          resolve({
            status,
            contentType,
            bytes: isGzip ? gunzipSync(body, { maxOutputLength: maxBytes * 5 }) : body,
            truncated,
          });
        } catch {
          reject(new PageRefusedError("The page is too large or could not be unpacked"));
        }
      };
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        chunks.push(chunk);
        if (size > maxBytes) {
          truncated = true;
          response.destroy();
          finish();
        }
      });
      response.on("end", finish);
      response.on("error", reject);
    });

    const timer = setTimeout(() => {
      request.destroy(new Error("The page took too long to answer"));
    }, timeoutMs);
    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.end();
  });
}

const robotsCache = new Map<string, { at: number; rules: RobotsRule[] | "unknown" }>();

type RobotsRule = { allow: boolean; pattern: string };

/**
 * @returns The rules of a robots file that apply to this application
 */
export function parseRobots(text: string): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | undefined;
  let inAgents = false;

  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.split("#")[0].trim();
    const separator = line.indexOf(":");
    if (separator === -1) {
      return;
    }
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      if (!inAgents || current === undefined) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      inAgents = true;
    } else if ((key === "allow" || key === "disallow") && current !== undefined) {
      inAgents = false;
      if (value !== "") {
        current.rules.push({ allow: key === "allow", pattern: value });
      }
    }
  });

  const own = groups.filter((group) => group.agents.some((agent) => ROBOTS_AGENT.includes(agent) && agent !== "*"));
  const chosen = own.length > 0 ? own : groups.filter((group) => group.agents.includes("*"));
  return chosen.flatMap((group) => group.rules);
}

/**
 * The longest matching rule decides, as in the robots standard.
 */
export function robotsAllow(rules: RobotsRule[], path: string): boolean {
  let best: RobotsRule | undefined;
  rules.forEach((rule) => {
    const source = rule.pattern.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    if (new RegExp(`^${source}`).test(path)) {
      const isLonger = best === undefined || rule.pattern.length > best.pattern.length;
      const winsTie = best !== undefined && rule.pattern.length === best.pattern.length && rule.allow;
      if (isLonger || winsTie) {
        best = rule;
      }
    }
  });
  return best === undefined || best.allow;
}

async function checkRobots(url: URL): Promise<void> {
  const cached = robotsCache.get(url.origin);
  let rules = cached !== undefined && Date.now() - cached.at < ROBOTS_CACHE_MS ? cached.rules : undefined;

  if (rules === undefined) {
    try {
      const response = await nextForHost(url.hostname, () =>
        requestOnce(new URL("/robots.txt", url.origin), MAX_ROBOTS_BYTES, ROBOTS_TIMEOUT_MS),
      );
      if (response.status === 200) {
        rules = parseRobots(response.bytes.toString("utf8"));
      } else if (response.status >= 300 && response.status < 500) {
        // Without a robots file, nothing is off limits.
        rules = [];
      } else {
        rules = "unknown";
      }
    } catch (error) {
      if (error instanceof PageRefusedError) {
        throw error;
      }
      rules = "unknown";
    }
    robotsCache.set(url.origin, { at: Date.now(), rules: rules });
  }

  if (rules === "unknown") {
    throw new PageRefusedError(`Could not check if ${url.hostname} allows automated reading, so the page was not opened`);
  }
  if (!robotsAllow(rules, `${url.pathname}${url.search}`)) {
    throw new PageRefusedError(`${url.hostname} doesn't allow automated reading of this page. Open the link yourself instead`);
  }
}

/**
 * @returns The title and the visible text of a page, without anything that runs or loads
 */
export function extractPage(html: string): { title: string; text: string } {
  const title = plainText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const content = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<head[\s>][\s\S]*?<\/head>/gi, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|nav|footer|aside|form)[\s>][\s\S]*?<\/\1>/gi, " ");
  return { title: title, text: plainText(content) };
}

/**
 * Opens a page for its text. Nothing on the page runs, and every step of the way is checked to be on the public internet.
 * @param address The address of the page
 * @returns The text of the page
 */
export async function readPage(address: string): Promise<ReadPage> {
  let url = new URL(address);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const refusal = refusalFor(url.href);
    if (refusal !== undefined) {
      throw new PageRefusedError(refusal);
    }
    await checkRobots(url);

    const current = url;
    const response = await nextForHost(current.hostname, () => requestOnce(current, MAX_PAGE_BYTES, PAGE_TIMEOUT_MS));

    if (response.status >= 300 && response.status < 400 && response.location !== undefined) {
      url = new URL(response.location, url);
      continue;
    }
    if (response.status !== 200) {
      throw new PageRefusedError(`The page answered with status ${response.status}`);
    }
    if (!TEXT_TYPES.includes(response.contentType)) {
      throw new PageRefusedError(`This is not a web page but ${response.contentType || "an unknown type of file"}, so it was not downloaded`);
    }

    const { title, text } = extractPage(response.bytes.toString("utf8"));
    if (text.length < MIN_TEXT_LENGTH) {
      throw new PageRefusedError("The page has almost no readable text. It may need scripts to show its content");
    }
    return {
      url: url.href,
      title: title || url.hostname,
      text: text.slice(0, MAX_TEXT_LENGTH),
      truncated: response.truncated || text.length > MAX_TEXT_LENGTH,
    };
  }
  throw new PageRefusedError("The page redirected too many times");
}
