import type { EnginePage } from "./webSearch.ts";

const TIMEOUT_MS = 12_000;

type SearxngResponse = {
  results?: { title?: string; url?: string; content?: string; publishedDate?: string | null }[];
  unresponsive_engines?: unknown[];
};

/**
 * Searches the local SearXNG that the start script runs. Its address only comes from there, and never from a request.
 * @param query What to search for
 * @returns The pages that were found
 */
export async function searchSearxng(query: string): Promise<EnginePage[]> {
  const address = process.env.SEARXNG_URL;
  if (address === undefined) {
    throw new Error("It isn't running");
  }

  let response: Response;
  try {
    response = await fetch(`${address}/search?${new URLSearchParams({ q: query, format: "json" }).toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error("It can't be reached. It may still be starting");
  }
  if (response.status !== 200) {
    throw new Error(`It returned status ${response.status}`);
  }

  const body = (await response.json()) as SearxngResponse;
  const results = body.results ?? [];
  if (results.length === 0 && (body.unresponsive_engines ?? []).length > 0) {
    throw new Error("All of its search engines failed or blocked the search");
  }

  return results.map((result) => ({
    title: result.title ?? "",
    url: result.url ?? "",
    description: result.content ?? "",
    date: /^\d{4}-\d{2}-\d{2}/.test(result.publishedDate ?? "") ? (result.publishedDate as string).slice(0, 10) : null,
  }));
}
