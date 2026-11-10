/**
 * All outgoing requests go through here, so that this server can't be used to reach anything but the listed sites.
 */
const ALLOWED_HOSTS = new Set([
  "www.gov.uk",
  "assets.publishing.service.gov.uk",
  "archive.org",
  "api.crossref.org",
  "html.duckduckgo.com",
  "repository.overheid.nl",
  "zoek.officielebekendmakingen.nl",
  "www.war.gov",
  "www.defensie.nl",
  "www.defensenews.com",
  "www.defenseone.com",
  "meta.wikimedia.org",
  "api.openalex.org",
  "skills.sh",
  "api.github.com",
  "raw.githubusercontent.com",
]);

const HOST_SUFFIXES = [".archive.org", ".us.archive.org"];
export const USER_AGENT = "research-assistant/0.1 (open source research tool)";
const MIN_HOST_INTERVAL_MS = 1000;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 60_000;

const hostQueues = new Map<string, Promise<unknown>>();
const lastRequestAt = new Map<string, number>();

export class NotAllowedError extends Error {}

export function assertAllowed(url: URL): void {
  const isListed = ALLOWED_HOSTS.has(url.hostname) || HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
  if (url.protocol !== "https:" || !isListed) {
    throw new NotAllowedError(`Requests to ${url.protocol}//${url.hostname} are not allowed`);
  }
}

/**
 * One request at a time per site, with some time in between.
 */
export function nextForHost<T>(host: string, request: () => Promise<T>): Promise<T> {
  const result = (hostQueues.get(host) ?? Promise.resolve()).then(async () => {
    const wait = (lastRequestAt.get(host) ?? 0) + MIN_HOST_INTERVAL_MS - Date.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastRequestAt.set(host, Date.now());
    return request();
  });
  hostQueues.set(host, result.catch(() => undefined));
  return result;
}

export async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return new Uint8Array();
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error(`Response is larger than the limit of ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  return bytes;
}

/**
 * @param address The address to get, which must be on the list, as must any address it redirects to
 * @param maxBytes The largest response that is accepted
 * @param timeoutMs How long to wait for a response
 * @param headersFor Extra headers per address, also for any address it redirects to
 * @returns The status and body of the response
 */
export async function fetchAllowed(
  address: string,
  maxBytes: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  headersFor?: (url: URL) => Record<string, string>,
): Promise<{ status: number; bytes: Uint8Array }> {
  let url = new URL(address);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    assertAllowed(url);
    const current = url;
    const response = await nextForHost(current.hostname, () =>
      fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT, ...headersFor?.(current) },
        signal: AbortSignal.timeout(timeoutMs),
      }),
    );

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location !== null) {
      await response.body?.cancel();
      url = new URL(location, url);
      continue;
    }
    return { status: response.status, bytes: await readLimited(response, maxBytes) };
  }
  throw new Error("Too many redirects");
}

export async function fetchText(address: string, maxBytes: number = 5_000_000): Promise<string> {
  const { status, bytes } = await fetchAllowed(address, maxBytes);
  if (status !== 200) {
    throw new Error(`Status ${status} from ${new URL(address).hostname}`);
  }
  return new TextDecoder().decode(bytes);
}
