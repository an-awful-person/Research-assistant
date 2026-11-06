/**
 * Doctrine is known by its number, like FM 3-0, which word searches handle badly.
 */
const LONG_FORMS: [RegExp, string][] = [
  [/allied joint publication/i, "AJP"],
  [/joint doctrine publication/i, "JDP"],
  [/joint publication/i, "JP"],
  [/army doctrine publication/i, "ADP"],
  [/army techniques publication/i, "ATP"],
  [/field manual/i, "FM"],
];

const LONG_NAMES: Record<string, string> = {
  AJP: "Allied Joint Publication",
  JDP: "Joint Doctrine Publication",
  JP: "Joint Publication",
  ADP: "Army Doctrine Publication",
  ATP: "Army Techniques Publication",
  FM: "Field Manual",
};

const NUMBER = String.raw`(\d+(?:[-. ]\d+)*)`;
const SHORT_FORM = new RegExp(
  String.raw`\b(FM|ADP|ADRP|ATP|JP|AJP|AAP|JDP|MCDP|MCWP|AFDP|NWP)[\s-]*${NUMBER}\b`,
  "i",
);

function format(prefix: string, number: string): string {
  return `${prefix.toUpperCase()} ${number.replace(/ /g, "-")}`;
}

/**
 * @param text A title or question
 * @returns The document number in a standard form, like "FM 3-0", or undefined if there is none
 */
export function findDesignation(text: string): string | undefined {
  const short = text.match(SHORT_FORM);
  if (short !== null) {
    return format(short[1], short[2]);
  }

  for (const [form, prefix] of LONG_FORMS) {
    const long = text.match(new RegExp(`${form.source}\\s+${NUMBER}\\b`, "i"));
    if (long !== null) {
      return format(prefix, long[1]);
    }
  }
  return undefined;
}

/**
 * Public uploads often only mention a document, like "Effects of the new FM 3-0", or are not serious.
 * @param title The title of an uploaded copy
 * @returns The document number, only if the title starts with it and so appears to be that document
 */
export function findUploadedDesignation(title: string): string | undefined {
  const stripped = title.replace(/^DTIC\s+\w+:\s*/i, "").replace(/^(?:19|20)\d\d\s+/, "");
  const designation = findDesignation(stripped);
  if (designation === undefined) {
    return undefined;
  }

  const [prefix] = designation.split(" ");
  const start = new RegExp(`^(?:${prefix}|${LONG_NAMES[prefix] ?? prefix})[\\s-]*\\d`, "i");
  const continuesAsAnotherTopic = /^[^,:]*?\d\s+(?:and|on|in|of|for|vs\.?|versus)\s/i.test(stripped);
  return start.test(stripped) && !continuesAsAnotherTopic ? designation : undefined;
}

/**
 * @returns The ways a document number can be written in a title, to search for
 */
export function searchTermsFor(designation: string): string[] {
  const [prefix, number] = designation.split(" ");
  const longName = LONG_NAMES[prefix];
  return longName === undefined ? [designation] : [designation, `${longName} ${number}`];
}
