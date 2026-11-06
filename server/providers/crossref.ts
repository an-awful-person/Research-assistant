import { fetchText } from "../fetcher.ts";
import type { FurtherReading } from "../types.ts";

export async function searchCrossref(query: string): Promise<FurtherReading[]> {
  const params = new URLSearchParams({
    "query.bibliographic": query,
    rows: "3",
    select: "title,DOI,issued",
  });
  const result: {
    message: { items: { title?: string[]; DOI: string; issued?: { "date-parts"?: number[][] } }[] };
  } = JSON.parse(await fetchText(`https://api.crossref.org/works?${params.toString()}`));

  return result.message.items
    .filter((item) => item.title?.[0])
    .map((item) => ({
      title: item.title?.[0] as string,
      date: item.issued?.["date-parts"]?.[0]?.[0]?.toString() ?? null,
      url: `https://doi.org/${item.DOI}`,
    }));
}
