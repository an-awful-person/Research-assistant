import { blendedSearch, type SearchAttempt } from "./webSearch.ts";

export type RedditResult = {
  title: string;
  subreddit: string;
  url: string;
  date: string | null;
  excerpts: string[];
};

export type RedditSearchResponse = {
  results: RedditResult[];
  used: string[];
  failed: string[];
  searches: SearchAttempt[];
};

const THREAD_PATH = /^\/r\/([A-Za-z0-9_]+)\/comments\/([A-Za-z0-9]+)(\/[^/]*)?/;
const REDDIT_HOST = /^([a-z0-9-]+\.)?reddit\.com$/;

/**
 * Finds Reddit threads through search engines, without contacting Reddit itself.
 * @param query What to search for
 * @returns The threads that were found, and how the engines did
 */
export async function searchReddit(query: string): Promise<RedditSearchResponse> {
  const { results, used, failed, searches } = await blendedSearch(`${query} site:reddit.com`);
  const threads = new Map<string, RedditResult>();

  results.forEach((result) => {
    const thread = parseThreadUrl(result.url);
    if (thread !== undefined && !threads.has(thread.id)) {
      threads.set(thread.id, {
        title: cleanTitle(result.title),
        subreddit: thread.subreddit,
        url: thread.url,
        date: result.date,
        excerpts: result.description === "" ? [] : [result.description],
      });
    }
  });
  return { results: [...threads.values()], used: used, failed: failed, searches: searches };
}

/**
 * The same thread can be found on several addresses, like old.reddit.com or with a translation, so this gives one.
 */
function parseThreadUrl(address: string | undefined): { id: string; subreddit: string; url: string } | undefined {
  let url: URL;
  try {
    url = new URL(address ?? "");
  } catch {
    return undefined;
  }

  const match = THREAD_PATH.exec(url.pathname);
  if (url.protocol !== "https:" || !REDDIT_HOST.test(url.hostname) || match === null) {
    return undefined;
  }
  return {
    id: match[2].toLowerCase(),
    subreddit: match[1],
    url: `https://www.reddit.com${match[0].replace(/\/$/, "")}/`,
  };
}

/**
 * Search engines add the name of the site to a title.
 */
function cleanTitle(title: string): string {
  return title
    .replace(/^r\/\w+ on Reddit:\s*/i, "")
    .replace(/\s*:\s*r\/\w+$/i, "")
    .replace(/\s*[-|:]\s*Reddit$/i, "")
    .trim();
}
