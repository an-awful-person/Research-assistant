const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[\da-f]+|\w+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Text can hold escaped HTML, so entities are decoded before tags are removed. */
export function plainText(raw: string): string {
  const content = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decodeEntities(decodeEntities(content).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
