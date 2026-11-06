import type { META_LMMMessage } from "../model/llm.model";

/** One source of a saved conversation, numbered once for the whole conversation. */
export type ExportSource = {
  number: number;
  source: string;
  urls: string[];
  quotes: { text: string; automatic: boolean }[];
};

/** The sources of a conversation, and per message which number in the answer became which shared number. */
export type CollectedSources = {
  sources: ExportSource[];
  numbers: Map<number, Map<number, number>>;
};

/** What the model gives back for a report. The sources are numbers from the shared list. */
export type ReportResponse = {
  title: string;
  abstract: string;
  introduction: string;
  /** Subsections of the findings, each in paragraphs that cite their sources inline, like "in 2002 [1]". */
  findings: { heading: string; paragraphs: string[] }[];
  discussion: string;
  conclusion: string;
};

/** A freely licensed picture from Wikimedia Commons, with what its licence asks to be credited. */
export type CommonsImage = {
  title: string;
  description: string;
  pageUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
  artist: string;
  license: string;
  licenseUrl: string;
};

/** A picture placed in a report. */
export type PlacedImage = {
  image: CommonsImage;
  /** The number of the findings subsection it follows, or 0 for under the title. */
  section: number;
  /** What the document shows: the image's own address, or a data URL inside a PDF. */
  src: string;
};

const MAX_QUOTES = 3;
const SOURCE_MARKER = /\[\[(\d+)\]\]\(#source-(\d+)\)/g;

/**
 * Numbers every source of the conversation once. Answers number their sources from 1, so the same number can mean
 * different sources in different answers, and the same source can have different numbers.
 * @param messages The conversation, in order
 */
export function collectSources(messages: META_LMMMessage[]): CollectedSources {
  const sources: ExportSource[] = [];
  const byKey = new Map<string, ExportSource>();
  const numbers = new Map<number, Map<number, number>>();

  messages.forEach((message, index) => {
    const local = new Map<number, number>();
    (message.citations ?? []).forEach((citation, position) => {
      const urls = citation.items.map((item) => item.url).filter((url) => url !== "");
      const key = urls[0] ?? `name:${citation.source}`;
      let shared = byKey.get(key);
      if (shared === undefined) {
        shared = { number: sources.length + 1, source: citation.source, urls: [], quotes: [] };
        sources.push(shared);
        byKey.set(key, shared);
      }
      urls.forEach((url) => {
        if (!shared.urls.includes(url)) shared.urls.push(url);
      });
      citation.items.forEach((item) =>
        item.quotes.forEach((quote) => {
          const text = quote.trim();
          if (text !== "" && shared.quotes.length < MAX_QUOTES && !shared.quotes.some((known) => known.text === text)) {
            shared.quotes.push({ text: text, automatic: item.automatic === true });
          }
        }),
      );
      local.set(citation.number ?? position + 1, shared.number);
    });
    numbers.set(index, local);
  });
  return { sources: sources, numbers: numbers };
}

/**
 * Turns the source links of an answer, like [[1]](#source-1), into the shared numbers, like [3].
 */
export function renumber(content: string, numbers: Map<number, number> | undefined): string {
  return content.replace(SOURCE_MARKER, (_marker, shown: string) => {
    const shared = numbers?.get(Number(shown));
    return shared === undefined ? "" : `[${shared}]`;
  });
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function sourcesMarkdown(sources: ExportSource[]): string {
  if (sources.length === 0) {
    return "No sources were used.\n";
  }
  return sources
    .map((source) => {
      // Not a numbered list: Markdown would renumber it, and a report lists only the sources it cites.
      const lines = [`**[${source.number}]** ${oneLine(source.source)}`];
      source.urls.forEach((url) => lines.push(`<${url}>`));
      source.quotes.forEach((quote) =>
        lines.push(`> ${oneLine(quote.text)}${quote.automatic ? " *(chosen automatically)*" : ""}`),
      );
      return lines.join("\n\n");
    })
    .join("\n\n") + "\n";
}

/**
 * The conversation between the user and the assistant, with the sources it used.
 * @param date When it was saved, as shown in the document
 */
export function transcriptMarkdown(messages: META_LMMMessage[], date: string, model: string): string {
  const collected = collectSources(messages);
  const parts = [`# Research conversation\n\n${date} · model ${model}\n`];
  messages.forEach((message, index) => {
    if (message.role === "user") {
      parts.push(`## You\n\n${message.content.trim()}\n`);
    } else if (message.role === "assistant") {
      const warnings = (message.sourceWarnings ?? []).map((warning) => `*${oneLine(warning.message)}*`);
      if (message.unverified && warnings.length === 0) warnings.push("*No verified source*");
      const text = renumber(message.content, collected.numbers.get(index)).trim();
      parts.push(`## Assistant\n\n${text}\n${warnings.length > 0 ? `\n${warnings.join("\n\n")}\n` : ""}`);
    }
  });
  parts.push(`## Sources\n\n${sourcesMarkdown(collected.sources)}`);
  return parts.join("\n");
}

/**
 * What the model reads to write a report: the conversation with the shared numbers, and what each source said.
 */
export function reportInput(messages: META_LMMMessage[]): string {
  const collected = collectSources(messages);
  const conversation = messages
    .map((message, index) => {
      if (message.role === "user") return `USER: ${message.content.trim()}`;
      if (message.role === "assistant") return `ASSISTANT: ${renumber(message.content, collected.numbers.get(index)).trim()}`;
      return undefined;
    })
    .filter((line) => line !== undefined)
    .join("\n\n");
  const sources = collected.sources
    .map((source) => `[${source.number}] ${oneLine(source.source)}${source.quotes.map((quote) => `\n  "${oneLine(quote.text)}"`).join("")}`)
    .join("\n");
  return `CONVERSATION:\n${conversation}\n\nSOURCES:\n${sources === "" ? "(none)" : sources}`;
}

/** Markdown can't have brackets or new lines in a picture's description or caption link text. */
function markdownText(text: string): string {
  return oneLine(text).replace(/[[\]]/g, "");
}

/**
 * A picture with the credit its licence asks for: the author, the licence, and where it comes from.
 */
export function imageMarkdown(placed: PlacedImage): string {
  const { image } = placed;
  // Descriptions on Commons can be long and about something else in the photo, so the caption is the file's title.
  const alt = shorten(image.description !== "" ? image.description : image.title, 150);
  const license = image.licenseUrl !== "" ? `[${markdownText(image.license)}](<${image.licenseUrl}>)` : markdownText(image.license);
  return [
    `![${markdownText(alt)}](<${placed.src}>)`,
    `*${markdownText(image.title)}.* Photo: [${markdownText(image.artist)}](<${image.pageUrl}>), ${license}, via Wikimedia Commons.`,
  ].join("\n\n");
}

/** Cuts text at a word, with an ellipsis, if it is longer than the limit. */
function shorten(text: string, limit: number): string {
  const line = oneLine(text);
  if (line.length <= limit) return line;
  const cut = line.slice(0, limit);
  return `${cut.slice(0, cut.lastIndexOf(" ") > limit / 2 ? cut.lastIndexOf(" ") : limit).replace(/[,;:.\s]+$/, "")}…`;
}

/** Paragraphs as the model wrote them: split on blank lines, and lists turned into sentences of their own. */
function paragraphsOf(text: string | undefined): string[] {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/^\s*[-*•]\s+/gm, "").replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph !== "");
}

/**
 * Keeps the citations of known sources, like [2] or [1][3], and drops the rest, like [9] or [S1].
 * @returns The text, and the source numbers it still cites
 */
export function checkCitations(text: string, known: Set<number>): { text: string; numbers: number[] } {
  const numbers = new Set<number>();
  const checked = text
    .replace(/\[([^\]]*)\]/g, (marker, inside: string) => {
      const parts = inside.split(/[,;]\s*/).map((part) => part.trim());
      if (!parts.every((part) => /^S?\d+$/i.test(part))) {
        return marker;
      }
      const kept = parts.filter((part) => /^\d+$/.test(part) && known.has(Number(part))).map(Number);
      kept.forEach((number) => numbers.add(number));
      return kept.map((number) => `[${number}]`).join("");
    })
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text: checked, numbers: [...numbers].sort((a, b) => a - b) };
}

/** The kind of a source, from its label: "Wikipedia: Radar" is Wikipedia. */
function kindOf(source: ExportSource): string {
  const colon = source.source.indexOf(":");
  return colon > 0 ? source.source.slice(0, colon).trim() : "Other";
}

function count(number: number, word: string): string {
  return `${number} ${word}${number === 1 ? "" : "s"}`;
}

/** Lists like "a, b and c". */
function listing(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * How the information was gathered, written from the conversation itself, so the model can't make it up.
 */
export function methodSection(messages: META_LMMMessage[], sources: ExportSource[], model: string): string {
  const questions = messages.filter((message) => message.role === "user").length;
  const kinds = new Map<string, number>();
  sources.forEach((source) => kinds.set(kindOf(source), (kinds.get(kindOf(source)) ?? 0) + 1));
  const consulted =
    sources.length === 0
      ? "No source could be traced in its answers, so everything below may come from the model's own knowledge."
      : `The answers cite ${count(sources.length, "source")}: ${listing([...kinds.entries()].map(([kind, number]) => `${kind} (${number})`))}.`;
  return [
    `This report is based on a conversation of ${count(questions, "question")} with a research assistant, which uses the language model ${model} and searches sources through its agents. ${consulted}`,
    "Each statement in the findings and the conclusion carries the number of its source in the references. The code checks these numbers: numbers of sources that weren't used are removed, and paragraphs marked *(no source)* could not be traced to a source and may come from the model's own knowledge.",
  ].join("\n\n");
}

/**
 * The report, in the form of a scientific paper, built from what the model wrote. Source numbers the conversation
 * doesn't have are dropped, and the method and the references come from the conversation, never from the model.
 */
export function reportMarkdown(
  messages: META_LMMMessage[],
  response: ReportResponse,
  date: string,
  model: string,
  images: PlacedImage[] = [],
): string {
  const { sources } = collectSources(messages);
  const known = new Set(sources.map((source) => source.number));
  const cited = new Set<number>();

  /** Paragraphs that state facts: their citations are checked, and those without one are marked. */
  const sourced = (text: string | undefined): string[] =>
    paragraphsOf(text).map((paragraph) => {
      const checked = checkCitations(paragraph, known);
      checked.numbers.forEach((number) => cited.add(number));
      return checked.numbers.length > 0 ? checked.text : `${checked.text} *(no source)*`;
    });
  /** Paragraphs that sum up, frame or weigh the findings: citations are checked, but none is needed. */
  const framing = (text: string | undefined): string[] =>
    paragraphsOf(text).map((paragraph) => {
      const checked = checkCitations(paragraph, known);
      checked.numbers.forEach((number) => cited.add(number));
      return checked.text;
    });

  const findings = (response.findings ?? []).filter(
    (finding) => typeof finding?.heading === "string" && Array.isArray(finding.paragraphs) && finding.paragraphs.some((paragraph) => typeof paragraph === "string" && paragraph.trim() !== ""),
  );
  const findingsText = findings.map((finding, index) => {
    const paragraphs = sourced(finding.paragraphs.filter((paragraph) => typeof paragraph === "string").join("\n\n"));
    const pictures = images.filter((placed) => placed.section === index + 1).map(imageMarkdown);
    return [`### 3.${index + 1} ${oneLine(finding.heading) || "Findings"}`, ...paragraphs, ...pictures].join("\n\n");
  });
  const top = images.filter((placed) => placed.section < 1 || placed.section > findings.length).map(imageMarkdown);

  // The abstract sums up the sections below it, which carry the sources, so it isn't marked.
  const abstract = framing(response.abstract);
  const introduction = framing(response.introduction);
  const discussion = framing(response.discussion);
  const conclusion = sourced(response.conclusion);
  const section = (heading: string, paragraphs: string[], empty: string) =>
    `## ${heading}\n\n${paragraphs.length > 0 ? paragraphs.join("\n\n") : `*${empty}*`}\n`;
  const questions = messages.filter((message) => message.role === "user").map((message, index) => `${index + 1}. ${oneLine(message.content)}`);

  const parts = [
    `# ${oneLine(response.title ?? "") || "Research report"}\n\n${date} · written by ${model} from a conversation with the research assistant. Check the sources before relying on it.\n`,
    ...(top.length > 0 ? [`${top.join("\n\n")}\n`] : []),
    section("Abstract", abstract, "No abstract was written."),
    section("1. Introduction", introduction, "No introduction was written."),
    `## 2. Method\n\n${methodSection(messages, sources, model)}\n`,
    `## 3. Findings\n\n${findingsText.length > 0 ? findingsText.join("\n\n") : "*No findings were written.*"}\n`,
    section("4. Discussion", discussion, "No discussion was written."),
    section("5. Conclusion", conclusion, "No conclusion was written."),
    `## References\n\n${sourcesMarkdown(sources.filter((source) => cited.has(source.number)))}`,
    `## Appendix: questions asked\n\n${questions.join("\n")}\n`,
  ];
  return parts.join("\n");
}
