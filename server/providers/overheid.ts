import { fetchText, NotAllowedError } from "../fetcher.ts";
import { decodeEntities } from "../text.ts";
import type { DocumentText, DoctrineDocument } from "../types.ts";

const BASE = "https://repository.overheid.nl/sru";
const READ_BASE = "https://zoek.officielebekendmakingen.nl";

function escapeQuery(query: string): string {
  return query.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
}

/** The results are a fixed format of XML, of which only a few plain fields are needed. */
function fieldOf(record: string, name: string): string | null {
  return record.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`))?.[1]?.trim() ?? null;
}

export async function searchOverheid(query: string): Promise<DoctrineDocument[]> {
  const params = new URLSearchParams({
    // Every word has to appear, but not as an exact phrase, which finds very little.
    query: `(c.product-area==officielepublicaties) AND ${escapeQuery(query).split(" ").map((word) => `cql.textAndIndexes="${word}"`).join(" AND ")}`,
    maximumRecords: "6",
    httpAccept: "application/xml",
  });
  const xml = await fetchText(`${BASE}?${params.toString()}`);

  return xml
    .split("<sru:record>")
    .slice(1)
    .flatMap((record) => {
      const identifier = fieldOf(record, "dcterms:identifier");
      if (identifier === null) {
        return [];
      }
      return [{
        source: "overheid" as const,
        ref: identifier,
        title: fieldOf(record, "dcterms:title") ?? identifier,
        date: fieldOf(record, "dcterms:date"),
        provenance: "Official: Overheid.nl",
        url: `${READ_BASE}/${identifier}.html`,
      }];
    });
}

export async function readOverheid(identifier: string): Promise<DocumentText> {
  if (!/^\w[\w.-]*$/.test(identifier) || identifier.includes("..")) {
    throw new NotAllowedError("This is not an official publication identifier");
  }

  const html = await fetchText(`${READ_BASE}/${identifier}.html`);
  // The publication is in the main part of the page, without the site's navigation around it.
  const main = html.match(/<(main|article)[\s>][\s\S]*<\/\1>/i)?.[0] ?? html;
  const text = decodeEntities(
    main
      .replace(/<(script|style|nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|h\d|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return {
    pages: [text],
    pageUrl: `${READ_BASE}/${identifier}.html`,
    officiallyPublished: true,
  };
}
