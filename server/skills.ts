/**
 * Reads the skills the owner put in the skills folder. They are only read as text: nothing in them is run.
 */
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const SKILLS_DIR = process.env.SKILLS_DIR ?? resolve(import.meta.dirname, "../skills");
const MAX_FILE_BYTES = 200_000;
const MAX_SKILL_BYTES = 1_000_000;
const MAX_DEPTH = 4;
const TEXT_FILES = new Set([".md", ".markdown", ".txt", ".json", ".csv", ".yaml", ".yml"]);

export type SkillFolder = { folder: string; files: { name: string; text: string }[]; ignored: string[] };

function collect(folder: string, prefix: string, depth: number, skill: SkillFolder, size: { bytes: number }): void {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const path = join(folder, entry.name);
    // A link could point anywhere on this computer, so links aren't followed.
    if (entry.isSymbolicLink()) {
      skill.ignored.push(name);
    } else if (entry.isDirectory()) {
      if (depth < MAX_DEPTH) collect(path, name, depth + 1, skill, size);
      else skill.ignored.push(name);
    } else if (entry.isFile()) {
      const bytes = lstatSync(path).size;
      if (!TEXT_FILES.has(extname(entry.name).toLowerCase()) || bytes > MAX_FILE_BYTES || size.bytes + bytes > MAX_SKILL_BYTES) {
        skill.ignored.push(name);
      } else {
        size.bytes += bytes;
        skill.files.push({ name, text: readFileSync(path, "utf8") });
      }
    }
  }
}

/** @returns Each folder with a SKILL.md and its text files. The page checks them, like the skills people upload. */
export function ownerSkills(): SkillFolder[] {
  let folders;
  try {
    folders = readdirSync(SKILLS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return folders
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith("."))
    .flatMap((entry) => {
      const skill: SkillFolder = { folder: entry.name, files: [], ignored: [] };
      try {
        collect(join(SKILLS_DIR, entry.name), "", 1, skill, { bytes: 0 });
      } catch (error) {
        console.error(`skill ${entry.name} could not be read:`, error instanceof Error ? error.message : error);
        return [];
      }
      return skill.files.some((file) => file.name === "SKILL.md") ? [skill] : [];
    });
}
