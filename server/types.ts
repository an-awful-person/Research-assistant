export type SourceId = "govuk" | "archive" | "overheid";

export type DoctrineDocument = {
  source: SourceId;
  /** Identifies the document at its source. The server builds any address from this itself. */
  ref: string;
  title: string;
  date: string | null;
  provenance: string;
  url: string;
  designation?: string;
};

export type FurtherReading = {
  title: string;
  date: string | null;
  url: string;
};

export type DocumentText = {
  pages: string[];
  /** The address of the text itself, with {page} where a page number can go. */
  pageUrl: string;
  /** If publication at this source means that the document is public. */
  officiallyPublished: boolean;
};
