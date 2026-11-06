export type Distribution = {
  status: "public" | "restricted" | "unknown";
  statement: string;
};

// Checked first, because a document can mention both. Markings are matched as they are printed.
const RESTRICTED_MARKINGS: RegExp[] = [
  /distribution authorized to[^.\n]{0,120}/i,
  /distribution statement [B-F]\b[^.\n]{0,120}/i,
  /not (?:approved|cleared) for public release[^.\n]{0,80}/i,
  /FOR OFFICIAL USE ONLY/,
  /\bFOUO\b/,
  /\bNOFORN\b/,
  /NATO RESTRICTED/,
  /OFFICIAL[- ]SENSITIVE/,
  /NOT RELEASABLE/,
  /EXPORT[- ]CONTROLLED/i,
  /LIMITED DISTRIBUTION/,
];

// These also appear in lists of abbreviations, so an explicit public release statement outweighs them.
const WEAK_MARKINGS: RegExp[] = [
  /CONTROLLED UNCLASSIFIED INFORMATION/,
  /\bCUI\b/,
];

const PUBLIC_MARKINGS: RegExp[] = [
  /approved for public release[^.\n]{0,80}/i,
  /distribution (?:is )?unlimited/i,
  /distribution statement A\b[^.\n]{0,80}/i,
  /Open Government Licence/i,
];

const PAGES_TO_CHECK = 6;

function findMarking(text: string, markings: RegExp[]): string | undefined {
  for (const marking of markings) {
    const match = text.match(marking);
    if (match !== null) {
      return match[0].replace(/\s+/g, " ").trim();
    }
  }
  return undefined;
}

/**
 * Reads the distribution statement of a document, which is normally at its start or end.
 * This is an automatic check on text that may be badly scanned, so it can miss a statement.
 * @param pages The text per page
 */
export function readDistribution(pages: string[]): Distribution {
  const text = [...pages.slice(0, PAGES_TO_CHECK), ...pages.slice(-2)].join("\n");

  // Army publications use this heading for both public and restricted documents, so what follows it decides.
  const heading = text.match(/distribution restriction:?\s*([^.\n]{0,120})/i);
  const restrictedByHeading = heading !== null && !/approved for public/i.test(heading[1]);

  const restricted = restrictedByHeading
    ? heading[0].replace(/\s+/g, " ").trim()
    : findMarking(text, RESTRICTED_MARKINGS);
  if (restricted !== undefined) {
    return { status: "restricted", statement: restricted };
  }
  const released = findMarking(text, PUBLIC_MARKINGS);
  if (released !== undefined) {
    return { status: "public", statement: released };
  }
  const weaklyRestricted = findMarking(text, WEAK_MARKINGS);
  if (weaklyRestricted !== undefined) {
    return { status: "restricted", statement: weaklyRestricted };
  }
  return { status: "unknown", statement: "No distribution statement was found." };
}
