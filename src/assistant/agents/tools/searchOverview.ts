import type { SearchAttempt } from "../../model/webSearch.model";
import type { SearchBreakdownItem } from "./searchBreakdown.agent";

const MAX_EXCERPT_LENGTH = 200;

/**
 * The text of results is written by anyone, so it shouldn't be able to add images or links to the conversation.
 */
function plain(text: string): string {
  return text.replace(/\s+/g, " ").replace(/([\\`*_{}[\]()#+\-!|<>~])/g, "\\$1");
}

function describeAttempt(attempt: SearchAttempt): string {
  const outcome = attempt.error !== undefined
    ? `failed: ${plain(attempt.error)}`
    : `${attempt.found ?? 0} result${attempt.found === 1 ? "" : "s"}`;
  return `- ${plain(attempt.source)}: \`${attempt.query.replace(/`/g, "'")}\`: ${outcome}`;
}

function describeLink(item: SearchBreakdownItem): string {
  const title = plain(item.texts[0] ?? item.name);
  try {
    const url = new URL(item.url);
    const isWebLink = url.protocol === "https:" || url.protocol === "http:";
    return isWebLink ? `[${title}](${url.href.replace(/\(/g, "%28").replace(/\)/g, "%29")})` : title;
  } catch {
    return title;
  }
}

function describeItem(item: SearchBreakdownItem, index: number): string {
  const excerpt = item.texts.slice(1).join(" ");
  const shortExcerpt = excerpt.length > MAX_EXCERPT_LENGTH ? `${excerpt.slice(0, MAX_EXCERPT_LENGTH).trim()}...` : excerpt;
  const details = [plain(item.label), item.date ?? "date unknown"].join(", ");
  return `${index + 1}. ${describeLink(item)}, ${details}${shortExcerpt === "" ? "" : `: ${plain(shortExcerpt)}`}`;
}

/**
 * @param search What was searched where, what will be read, how many results there were and if they were found earlier
 * @returns An overview of a search, for the conversation of the agent
 */
export function describeSearch(search: {
  attempts: SearchAttempt[];
  items: SearchBreakdownItem[];
  totalFound: number;
  fromCache: boolean;
}): string {
  const sections = ["**Searches**"];
  if (search.fromCache) {
    sections.push("These results are from the same search a few minutes ago, so no new request was made.");
  }
  // An older research server doesn't report its searches, which shouldn't stop the results from being used.
  sections.push((search.attempts ?? []).map(describeAttempt).join("\n") || "Not reported by the research server.");

  if (search.items.length === 0) {
    sections.push("**No results to read.**");
    return sections.join("\n\n");
  }

  const isPartial = search.totalFound > search.items.length;
  sections.push(
    `**Results given to the model: ${search.items.length} of ${search.totalFound}**${isPartial ? " (the rest were left out as off-topic, duplicates or over the limit)" : ""}`,
  );
  sections.push(search.items.map(describeItem).join("\n"));
  return sections.join("\n\n");
}
