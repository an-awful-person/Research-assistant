import { plainText } from "../text.ts";
import { searchDuckDuckGo } from "./duckDuckGo.ts";
import { searchSearxng } from "./searxng.ts";

/** A page as an engine found it. */
export type EnginePage = {
  title: string;
  url: string;
  description: string;
  date: string | null;
};

export type WebSearchResult = {
  title: string;
  url: string;
  host: string;
  description: string;
  date: string | null;
  engines: string[];
};

/** What a source was asked, and what came of it. */
export type SearchAttempt = {
  source: string;
  query: string;
  found?: number;
  error?: string;
};

export type WebSearchResponse = {
  results: WebSearchResult[];
  used: string[];
  failed: string[];
  searches: SearchAttempt[];
};

const ENGINES: { name: string; search: (query: string) => Promise<EnginePage[]> }[] = [
  { name: "SearXNG", search: searchSearxng },
  { name: "DuckDuckGo", search: searchDuckDuckGo },
];

/**
 * Asks all search engines at once and combines what they find, so that any of them can fail. None of the pages that
 * are found get visited.
 * @param query What to search for
 * @returns The pages without duplicates, with those that several engines found first, and how the engines did
 */
export async function blendedSearch(query: string): Promise<WebSearchResponse> {
  const outcomes = await Promise.allSettled(ENGINES.map((engine) => engine.search(query)));

  const used: string[] = [];
  const failed: string[] = [];
  const reasons: string[] = [];
  const searches: SearchAttempt[] = [];
  const lists: { name: string; pages: EnginePage[] }[] = [];
  outcomes.forEach((outcome, index) => {
    const name = ENGINES[index].name;
    if (outcome.status === "fulfilled") {
      used.push(name);
      lists.push({ name: name, pages: outcome.value });
      searches.push({ source: name, query: query, found: outcome.value.length });
    } else {
      const reason = outcome.reason instanceof Error ? outcome.reason.message : `${outcome.reason}`;
      console.warn(`${name} search failed: ${reason}`);
      failed.push(name);
      reasons.push(`${name}: ${reason}`);
      searches.push({ source: name, query: query, error: reason });
    }
  });

  if (used.length === 0) {
    throw new Error(`No search engine could answer. ${reasons.join(". ")}.`);
  }
  return { results: blend(lists), used: used, failed: failed, searches: searches };
}

/**
 * Takes turns between the engines, so that each one's best results stay near the top.
 */
function blend(lists: { name: string; pages: EnginePage[] }[]): WebSearchResult[] {
  const results = new Map<string, WebSearchResult>();
  const longest = Math.max(0, ...lists.map((list) => list.pages.length));

  for (let position = 0; position < longest; position++) {
    lists.forEach(({ name, pages }) => {
      const page = position < pages.length ? toResult(pages[position], name) : undefined;
      if (page === undefined) {
        return;
      }
      const key = pageKey(page.url);
      const known = results.get(key);
      if (known === undefined) {
        results.set(key, page);
      } else if (!known.engines.includes(name)) {
        known.engines.push(name);
        known.description = known.description.length >= page.description.length ? known.description : page.description;
        known.date = known.date ?? page.date;
      }
    });
  }

  const all = [...results.values()];
  return [...all.filter((page) => page.engines.length > 1), ...all.filter((page) => page.engines.length === 1)];
}

function toResult(page: EnginePage, engine: string): WebSearchResult | undefined {
  let url: URL;
  try {
    url = new URL(page.url);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return undefined;
  }

  const host = url.hostname.replace(/^www\./, "");
  return {
    title: plainText(page.title) || host,
    url: url.href,
    host: host,
    description: plainText(page.description),
    date: page.date,
    engines: [engine],
  };
}

/**
 * The same page can be listed with or without www, a closing slash or a secure address.
 */
function pageKey(address: string): string {
  const url = new URL(address);
  return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}${url.search}`.toLowerCase();
}
