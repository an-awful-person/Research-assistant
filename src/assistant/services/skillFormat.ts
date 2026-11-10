import type { Skill } from "../model/extensions.model";

const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;

/** Files that can be given to the model. Anything else, like a script, is left out. */
export const TEXT_FILE = /\.(md|markdown|txt|json|csv|ya?ml)$/i;
export const MAX_SKILL_BYTES = 1_000_000;

export class SkillFormatError extends Error {}

function unquote(value: string): string {
  const text = value.trim();
  const first = text[0];
  if (text.length >= 2 && (first === '"' || first === "'") && text[text.length - 1] === first) {
    return first === '"' ? text.slice(1, -1).replace(/\\(["\\])/g, "$1").replace(/\\n/g, "\n") : text.slice(1, -1).replace(/''/g, "'");
  }
  return text;
}

/**
 * Reads the top-level fields of the frontmatter, which is all that is used. Text over several lines (| and >) and
 * indented lines are understood; other fields are ignored.
 */
function readFields(frontmatter: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = frontmatter.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (match === null) continue;
    const continuation: string[] = [];
    while (index + 1 < lines.length && (/^\s+\S/.test(lines[index + 1]) || lines[index + 1].trim() === "")) {
      index++;
      continuation.push(lines[index].trim());
    }
    const isBlock = /^[|>][+-]?$/.test(match[2].trim());
    const text = continuation.join(isBlock && match[2].trim().startsWith("|") ? "\n" : " ").trim();
    fields[match[1]] = isBlock ? text : unquote(`${match[2]} ${text}`);
  }
  return fields;
}

/** @returns The name, description and instructions of a SKILL.md */
export function parseSkillMd(text: string): { name: string; description: string; body: string } {
  const match = text.replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (match === null) {
    throw new SkillFormatError("A SKILL.md has to start with a block between --- lines that has a name and a description.");
  }
  const fields = readFields(match[1]);
  const name = fields.name ?? "";
  const description = (fields.description ?? "").replace(/\s+/g, " ").trim();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > MAX_NAME) {
    throw new SkillFormatError(`The name "${name}" isn't valid. It needs lowercase letters, numbers and single dashes, up to ${MAX_NAME} characters.`);
  }
  if (description === "" || description.length > MAX_DESCRIPTION) {
    throw new SkillFormatError(`A skill needs a description of up to ${MAX_DESCRIPTION} characters, which says when to use it.`);
  }
  const body = match[2].trim();
  if (body === "") {
    throw new SkillFormatError("This skill has no instructions below its description.");
  }
  return { name, description, body };
}

/**
 * @param files The text files of the skill, with SKILL.md at the top
 * @param ignored What was left out
 * @returns The skill
 */
export function skillFromFiles(files: { name: string; text: string }[], ignored: string[], origin: Skill["origin"]): Skill {
  const main = files.find((file) => file.name === "SKILL.md");
  if (main === undefined) {
    throw new SkillFormatError("There is no SKILL.md here.");
  }
  const { name, description, body } = parseSkillMd(main.text);
  return { id: `${origin}:${name}`, name, description, body, files: files.filter((file) => file !== main), origin, ignored };
}
