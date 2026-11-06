import { fetchText } from "../fetcher.ts";
import { plainText } from "../text.ts";

export type NewsItem = {
  title: string;
  summary: string;
  date: string;
  label: string;
  url: string;
};

type Feed = {
  label: string;
  url: string;
  /** The terms of these only allow personal use, or could not be read, so they aren't used by a public server. */
  personalUseOnly: boolean;
  /** Other names for the source, so that searching for a country finds its news. */
  aliases?: string;
  /** For a source without a feed, which reads its items from a page instead. */
  parse?: (html: string, label: string) => NewsItem[];
};

const FEEDS: Feed[] = [
  { label: "Official: US Department of War", url: "https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=20", personalUseOnly: false },
  { label: "Official: UK Ministry of Defence", url: "https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=ministry-of-defence", personalUseOnly: false, aliases: "uk britain british" },
  { label: "Official: Dutch Ministry of Defence", url: "https://www.defensie.nl/nieuws", personalUseOnly: false, aliases: "netherlands nederland nederlands nederlandse dutch defensie krijgsmacht ministerie", parse: parseDefensieNews },
  { label: "Press: Defense News", url: "https://www.defensenews.com/arc/outboundfeeds/rss/", personalUseOnly: true },
  { label: "Press: Defense One", url: "https://www.defenseone.com/rss/all/", personalUseOnly: true },
];

const FEED_CACHE_MS = 15 * 60 * 1000;
const MAX_FEED_BYTES = 5_000_000;
const MAX_SUMMARY_WORDS = 60;
const MIN_WORD_LENGTH = 3;

const IGNORED_WORDS = new Set([
  "about", "and", "defence", "defense", "for", "from", "latest", "military", "news", "recent", "the", "with",
]);

const feedCache = new Map<string, { at: number; items: NewsItem[] }>();

function fieldOf(entry: string, name: string): string | undefined {
  return entry.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1];
}

function linkOf(entry: string): string | undefined {
  const link = entry.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? fieldOf(entry, "link");
  return link === undefined ? undefined : plainText(link);
}

/**
 * Reads RSS and Atom feeds. Only short fields are read, so that full articles stay at the publisher.
 */
export function parseFeed(xml: string, label: string): NewsItem[] {
  return xml
    .split(/<(?:item|entry)(?=[\s>])/)
    .slice(1)
    .flatMap((entry) => {
      const title = plainText(fieldOf(entry, "title") ?? "");
      const url = linkOf(entry);
      const date = new Date(plainText(fieldOf(entry, "pubDate") ?? fieldOf(entry, "published") ?? fieldOf(entry, "updated") ?? ""));
      if (title === "" || url === undefined || !url.startsWith("https://") || Number.isNaN(date.getTime())) {
        return [];
      }
      return [{
        title: title,
        summary: plainText(fieldOf(entry, "description") ?? fieldOf(entry, "summary") ?? "")
          .split(" ")
          .slice(0, MAX_SUMMARY_WORDS)
          .join(" "),
        date: date.toISOString().slice(0, 10),
        label: label,
        url: url,
      }];
    });
}

/**
 * Defensie.nl has no feed, so its news page is read. The date is part of each link.
 */
export function parseDefensieNews(html: string, label: string): NewsItem[] {
  const seen = new Set<string>();
  return html
    .split(/(?=<a\s[^>]*href="\/nieuws\/\d{8}-)/)
    .slice(1)
    .flatMap((part) => {
      const link = part.match(/href="(\/nieuws\/(\d{4})(\d{2})(\d{2})-[^"]+)"/);
      const card = part.slice(0, Math.max(part.indexOf("</a>"), 0));
      const title = plainText(card.match(/<h\d[^>]*>([\s\S]*?)<\/h\d>/)?.[1] ?? "");
      if (link === null || title === "" || seen.has(link[1])) {
        return [];
      }
      seen.add(link[1]);

      const summary = plainText(card.replace(/<h\d[^>]*>[\s\S]*?<\/h\d>/, " ")).replace(/^\d{2}-\d{2}-\d{4}\s*/, "");
      return [{
        title: title,
        summary: summary.split(" ").slice(0, MAX_SUMMARY_WORDS).join(" "),
        date: `${link[2]}-${link[3]}-${link[4]}`,
        label: label,
        url: `https://www.defensie.nl${link[1]}`,
      }];
    });
}

async function readFeed(feed: Feed): Promise<NewsItem[]> {
  const cached = feedCache.get(feed.url);
  if (cached !== undefined && Date.now() - cached.at < FEED_CACHE_MS) {
    return cached.items;
  }
  const parse = feed.parse ?? parseFeed;
  const items = parse(await fetchText(feed.url, MAX_FEED_BYTES), feed.label);
  feedCache.set(feed.url, { at: Date.now(), items: items });
  return items;
}

/** So that a search for "drones" also finds "drone". */
function singular(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * @param query The topic to search for
 * @param allowPersonalUseFeeds If feeds that only allow personal use can be read
 */
export async function searchNews(query: string, allowPersonalUseFeeds: boolean) {
  const feeds = FEEDS.filter((feed) => allowPersonalUseFeeds || !feed.personalUseOnly);
  const results = await Promise.allSettled(feeds.map(readFeed));

  const failedFeeds: string[] = [];
  const errors = new Map<string, string>();
  const items: (NewsItem & { aliases: string; feed: string })[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(...result.value.map((item) => ({ ...item, aliases: feeds[index].aliases ?? "", feed: feeds[index].label })));
    } else {
      console.warn(`${feeds[index].label} feed failed:`, result.reason);
      failedFeeds.push(feeds[index].label);
      errors.set(feeds[index].label, result.reason instanceof Error ? result.reason.message : `${result.reason}`);
    }
  });

  const allWords = normalize(query).split(" ").filter((word) => word !== "");
  const distinctiveWords = allWords.filter((word) => word.length >= MIN_WORD_LENGTH && !IGNORED_WORDS.has(word));
  // A short name like UK or NATO can be all there is to search for, unless it's only a word like "news".
  const words = distinctiveWords.length > 0 ? distinctiveWords : allWords.filter((word) => !IGNORED_WORDS.has(word));
  const required = words.length === 0 ? 0 : Math.ceil(words.length / 2);
  const matching = items.filter((item) => {
    const text = new Set(normalize(`${item.label} ${item.aliases} ${item.title} ${item.summary}`).split(" ").map(singular));
    return words.filter((word) => text.has(singular(word))).length >= required;
  });

  return {
    items: matching
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(({ title, summary, date, label, url }) => ({ title, summary, date, label, url })),
    failedFeeds: failedFeeds,
    feedsUsed: feeds.map((feed) => feed.label),
    searches: feeds.map((feed) => {
      const error = errors.get(feed.label);
      return error !== undefined
        ? { source: feed.label, query: query, error: error }
        : { source: feed.label, query: query, found: matching.filter((item) => item.feed === feed.label).length };
    }),
  };
}
