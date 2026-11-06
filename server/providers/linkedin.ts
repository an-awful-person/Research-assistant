import { blendedSearch, type SearchAttempt } from "./webSearch.ts";

export type LinkedInKind = "post" | "article" | "event";

export type LinkedInResult = {
  title: string;
  kind: LinkedInKind;
  url: string;
  date: string | null;
  excerpts: string[];
};

export type LinkedInSearchResponse = {
  results: LinkedInResult[];
  used: string[];
  failed: string[];
  searches: SearchAttempt[];
};

const LINKEDIN_HOST = /^([a-z0-9-]+\.)?linkedin\.com$/;
const KINDS: Record<string, LinkedInKind> = { posts: "post", pulse: "article", events: "event" };

/**
 * Finds public LinkedIn posts, articles and events through search engines, without contacting LinkedIn itself.
 * Profiles, company pages and jobs are left out.
 * @param query What to search for
 * @returns What was found, and how the engines did
 */
export async function searchLinkedIn(query: string): Promise<LinkedInSearchResponse> {
  const { results, used, failed, searches } = await blendedSearch(`${query} site:linkedin.com`);
  const found = new Map<string, LinkedInResult>();

  results.forEach((result) => {
    const page = parseUrl(result.url);
    if (page !== undefined && !found.has(page.url)) {
      found.set(page.url, {
        title: cleanTitle(result.title),
        kind: page.kind,
        url: page.url,
        date: result.date,
        excerpts: result.description === "" ? [] : [result.description],
      });
    }
  });
  return { results: [...found.values()], used: used, failed: failed, searches: searches };
}

/**
 * The same post can be found on several country addresses, like qa.linkedin.com, so this gives one.
 */
function parseUrl(address: string): { url: string; kind: LinkedInKind } | undefined {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return undefined;
  }

  const [section, item] = url.pathname.split("/").filter((part) => part !== "");
  const isKnownSection = Object.hasOwn(KINDS, section ?? "");
  if (url.protocol !== "https:" || !LINKEDIN_HOST.test(url.hostname) || !isKnownSection || item === undefined) {
    return undefined;
  }
  return {
    url: `https://www.linkedin.com${url.pathname.replace(/\/$/, "")}`,
    kind: KINDS[section],
  };
}

/**
 * Search engines add the name of the site to a title.
 */
function cleanTitle(title: string): string {
  return title.replace(/\s*[|-]\s*LinkedIn$/i, "").trim();
}
