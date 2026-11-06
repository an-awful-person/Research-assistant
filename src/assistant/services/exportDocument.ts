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
  summary: string;
  conclusions: { statement: string; sources: number[] }[];
  openQuestions: string[];
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

/**
 * The report, built from what the model wrote. Source numbers the conversation doesn't have are dropped, and the
 * source list comes from the conversation, never from the model.
 */
export function reportMarkdown(messages: META_LMMMessage[], response: ReportResponse, date: string, model: string): string {
  const { sources } = collectSources(messages);
  const known = new Set(sources.map((source) => source.number));
  const cited = new Set<number>();

  const conclusions = (response.conclusions ?? [])
    .filter((conclusion) => oneLine(conclusion.statement ?? "") !== "")
    .map((conclusion) => {
      const numbers = [...new Set((conclusion.sources ?? []).filter((number) => known.has(number)))].sort((a, b) => a - b);
      numbers.forEach((number) => cited.add(number));
      const marks = numbers.length > 0 ? ` ${numbers.map((number) => `[${number}]`).join("")}` : " *(no source)*";
      return `- ${oneLine(conclusion.statement)}${marks}`;
    });
  const openQuestions = (response.openQuestions ?? []).map(oneLine).filter((question) => question !== "");
  const questions = messages.filter((message) => message.role === "user").map((message) => `- ${oneLine(message.content)}`);

  const parts = [
    `# ${oneLine(response.title ?? "") || "Research report"}\n\n${date} · written by ${model} from the conversation. Check the sources before relying on it.\n`,
    `## Summary\n\n${(response.summary ?? "").trim() || "*No summary was written.*"}\n`,
    `## Conclusions\n\n${conclusions.length > 0 ? conclusions.join("\n") : "*No conclusions were drawn.*"}\n`,
  ];
  if (openQuestions.length > 0) {
    parts.push(`## Open questions\n\n${openQuestions.map((question) => `- ${question}`).join("\n")}\n`);
  }
  parts.push(`## Sources\n\n${sourcesMarkdown(sources.filter((source) => cited.has(source.number)))}`);
  parts.push(`## Questions asked\n\n${questions.join("\n")}\n`);
  return parts.join("\n");
}
