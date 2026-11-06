import { fetchAllowed, fetchText, NotAllowedError } from "../fetcher.ts";
import { pdfToPages } from "../pdf.ts";
import type { DocumentText, DoctrineDocument } from "../types.ts";

const BASE = "https://www.gov.uk";
const MAX_PDF_BYTES = 60_000_000;
const MAX_COLLECTION_DOCUMENTS = 5;

type ContentItem = {
  title: string;
  base_path: string;
  public_updated_at?: string;
  details?: {
    attachments?: { url?: string; title?: string; content_type?: string }[];
    body?: string;
  };
  links?: { documents?: { title: string; base_path: string; public_updated_at?: string }[] };
};

function toDocument(title: string, path: string, date: string | undefined): DoctrineDocument {
  return {
    source: "govuk",
    ref: path,
    title: title,
    date: date?.slice(0, 10) ?? null,
    provenance: "Official: GOV.UK",
    url: `${BASE}${path}`,
  };
}

/** Publications are read through this path only, so a reference can't point anywhere else. */
function assertPublicationPath(path: string): void {
  if (!/^\/government\/(publications|collections)\/[\w-]+(\/[\w-]+)*$/.test(path)) {
    throw new NotAllowedError("This is not a GOV.UK publication");
  }
}

export async function searchGovuk(query: string): Promise<DoctrineDocument[]> {
  const params = new URLSearchParams({
    q: query,
    filter_organisations: "ministry-of-defence",
    count: "10",
    fields: "title,link,public_timestamp",
  });
  const result: { results: { title: string; link: string; public_timestamp?: string }[] } = JSON.parse(
    await fetchText(`${BASE}/api/search.json?${params.toString()}`),
  );

  const documents: DoctrineDocument[] = [];
  for (const item of result.results) {
    if (item.link.startsWith("/government/publications/")) {
      documents.push(toDocument(item.title, item.link, item.public_timestamp));
    } else if (item.link.startsWith("/government/collections/")) {
      // A collection is a list of publications, not a document itself.
      const collection: ContentItem = JSON.parse(await fetchText(`${BASE}/api/content${item.link}`));
      (collection.links?.documents ?? [])
        .filter((document) => document.base_path.startsWith("/government/publications/"))
        .slice(0, MAX_COLLECTION_DOCUMENTS)
        .forEach((document) => {
          documents.push(toDocument(document.title, document.base_path, document.public_updated_at));
        });
    }
  }
  return documents;
}

export async function readGovuk(path: string): Promise<DocumentText> {
  assertPublicationPath(path);
  const content: ContentItem = JSON.parse(await fetchText(`${BASE}/api/content${path}`));

  const pdfs = (content.details?.attachments ?? []).filter((item) => item.content_type === "application/pdf" && item.url);
  const main = pdfs.find((item) => !/summary|bitesize/i.test(`${item.title} ${item.url}`)) ?? pdfs[0];
  if (main?.url === undefined) {
    throw new Error("This publication has no PDF");
  }

  const { status, bytes } = await fetchAllowed(main.url, MAX_PDF_BYTES, 120_000);
  if (status !== 200) {
    throw new Error(`Status ${status} for the PDF`);
  }
  return {
    pages: await pdfToPages(bytes),
    pageUrl: `${main.url}#page={page}`,
    officiallyPublished: true,
  };
}
