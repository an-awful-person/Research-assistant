import { fetchText, NotAllowedError } from "../fetcher.ts";
import type { DocumentText, DoctrineDocument } from "../types.ts";

const BASE = "https://archive.org";
const MAX_TEXT_BYTES = 30_000_000;
// Not primary sources, which matters most for doctrine of other countries.
const TRANSLATION_OR_ANALYSIS = /translat|\bJPRS\b|\bFBIS\b|\banalysis of\b|\bassessment of\b|\breview of\b|\bcomparison\b|\bimplications\b/i;

function escapeQuery(query: string): string {
  return query.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

const MAX_SEARCH_WORDS = 3;
const MIN_SEARCH_WORD_LENGTH = 3;

async function search(titleQuery: string, rows: number): Promise<DoctrineDocument[]> {
  const params = new URLSearchParams({
    q: `title:(${titleQuery}) AND mediatype:texts`,
    rows: `${rows}`,
    output: "json",
  });
  ["identifier", "title", "date"].forEach((field) => params.append("fl[]", field));
  params.append("sort[]", "downloads desc");

  const result: { response: { docs: { identifier: string; title?: string | string[]; date?: string | string[] }[] } } = JSON.parse(
    await fetchText(`${BASE}/advancedsearch.php?${params.toString()}`),
  );
  // These fields hold a list when an upload has several values.
  const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);
  return result.response.docs.map((item) => ({
    source: "archive",
    ref: item.identifier,
    title: first(item.title) ?? item.identifier,
    date: first(item.date)?.slice(0, 10) ?? null,
    provenance: TRANSLATION_OR_ANALYSIS.test(first(item.title) ?? "")
      ? "Translation or analysis, uploaded copy: Internet Archive"
      : "Uploaded copy: Internet Archive",
    url: `${BASE}/details/${encodeURIComponent(item.identifier)}`,
  }));
}

/**
 * Requiring every word finds little in titles, so only the longest few are used.
 */
export function searchInternetArchive(query: string): Promise<DoctrineDocument[]> {
  const words = escapeQuery(query)
    .split(" ")
    .filter((word) => word.length >= MIN_SEARCH_WORD_LENGTH)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_SEARCH_WORDS);
  return words.length === 0 ? Promise.resolve([]) : search(words.join(" AND "), 10);
}

/**
 * @param phrase A document number as it is written in titles, like: FM 3-0
 */
export function searchInternetArchiveTitle(phrase: string): Promise<DoctrineDocument[]> {
  // New editions have few downloads yet, so enough results are needed to include them.
  return search(`"${escapeQuery(phrase)}"`, 40);
}

export async function readInternetArchive(identifier: string): Promise<DocumentText> {
  if (!/^\w[\w.-]*$/.test(identifier) || identifier.includes("..")) {
    throw new NotAllowedError("This is not an Internet Archive identifier");
  }

  const files: { result: { name: string }[] } = JSON.parse(await fetchText(`${BASE}/metadata/${identifier}/files`));
  const textFile = files.result.find((file) => file.name.endsWith("_djvu.txt"));
  if (textFile === undefined) {
    throw new Error("This item has no text version");
  }

  const text = await fetchText(
    `${BASE}/download/${identifier}/${encodeURIComponent(textFile.name)}`,
    MAX_TEXT_BYTES,
  );
  return {
    // The text version separates pages with form feeds.
    pages: text.split("\f"),
    pageUrl: `${BASE}/details/${identifier}/page/n{pageIndex}/mode/1up`,
    officiallyPublished: false,
  };
}
