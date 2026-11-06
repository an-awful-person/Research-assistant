import { fetchAllowed } from "../fetcher.ts";
import { plainText } from "../text.ts";
import type { EnginePage } from "./webSearch.ts";

const SEARCH_URL = "https://html.duckduckgo.com/html/";
const MAX_RESPONSE_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const BLOCKED_PAUSE_MS = 15 * 60 * 1000;

let blockedUntil = 0;

/**
 * Reads the plain results page of DuckDuckGo, which has no API for this. When it blocks a search, this stops asking
 * for a while rather than trying to get around that.
 * @param query What to search for
 * @returns The pages that were found
 */
export async function searchDuckDuckGo(query: string): Promise<EnginePage[]> {
  if (Date.now() < blockedUntil) {
    throw new Error("It blocked an earlier search, so it is being left alone for a while");
  }

  const { status, bytes } = await fetchAllowed(
    `${SEARCH_URL}?${new URLSearchParams({ q: query }).toString()}`,
    MAX_RESPONSE_BYTES,
    TIMEOUT_MS,
  );
  const html = new TextDecoder().decode(bytes);

  if (status !== 200 || /anomaly-modal|bots use duckduckgo/i.test(html)) {
    blockedUntil = Date.now() + BLOCKED_PAUSE_MS;
    throw new Error(`It blocked the search (status ${status})`);
  }

  const pages = parseResults(html);
  // A page without results that doesn't say so could have changed, which shouldn't look like an empty search.
  if (pages.length === 0 && !/no\s+results/i.test(html)) {
    throw new Error("Its results page could not be read");
  }
  return pages;
}

function parseResults(html: string): EnginePage[] {
  const pages: EnginePage[] = [];

  html.split(/(?=<div[^>]*class="[^"]*\bresult\b)/).forEach((block) => {
    const link = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (link === null || /^<div[^>]*result--ad/.test(block)) {
      return;
    }
    const url = resolveLink(plainText(link[1]));
    if (url !== undefined) {
      const snippet = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(block);
      pages.push({
        title: plainText(link[2]),
        url: url,
        description: plainText(snippet?.[1] ?? ""),
        date: null,
      });
    }
  });
  return pages;
}

/**
 * Links go through a redirect of DuckDuckGo with the actual address inside, so the page isn't contacted for this.
 * @returns The address of the page, or nothing for an advertisement
 */
function resolveLink(link: string): string | undefined {
  try {
    const url = new URL(link, SEARCH_URL);
    if (!url.hostname.endsWith("duckduckgo.com")) {
      return url.href;
    }
    return url.pathname === "/l/" ? (url.searchParams.get("uddg") ?? undefined) : undefined;
  } catch {
    return undefined;
  }
}
