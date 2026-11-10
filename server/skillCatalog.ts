/**
 * Finds skills in public catalogs and reads the ones that are solely Markdown. Nothing is run or kept on this server
 * beyond a short cache: the page shows a skill to the user, who decides whether to add it to their own browser.
 */
import { fetchAllowed } from "./fetcher.ts";

const SKILLS_SH_SEARCH = "https://skills.sh/api/search";
const AWESOME_REPOSITORY = "sickn33/antigravity-awesome-skills";
const AWESOME_INDEX = `https://raw.githubusercontent.com/${AWESOME_REPOSITORY}/main/skills_index.json`;
const GITHUB_API = "https://api.github.com";
const RAW_FILES = "https://raw.githubusercontent.com";

const RESULTS_PER_CATALOG = 20;
const INDEX_CACHE_MS = 6 * 60 * 60 * 1000;
const SKILL_CACHE_MS = 60 * 60 * 1000;
const MAX_CACHED_SKILLS = 200;
const MAX_INDEX_BYTES = 10_000_000;
const MAX_TREE_BYTES = 20_000_000;
const MAX_FILES = 30;
const MAX_SKILL_BYTES = 1_000_000;
const MAX_FOLDER_REQUESTS = 5;

export type CatalogName = "skills.sh" | "Awesome Skills";

export type CatalogResult = {
  catalog: CatalogName;
  source: string;
  skillId: string;
  name: string;
  description?: string;
  risk?: string;
  installs?: number;
  /** The folder in its repository, when the catalog says where it is. */
  path?: string;
};

export type CatalogSkill =
  | { status: "ok"; repositoryUrl: string; files: { name: string; text: string }[] }
  | { status: "refused"; repositoryUrl: string; otherFiles: string[] };

/** The request itself is wrong. */
export class CatalogInputError extends Error {}

type AwesomeEntry = { id?: unknown; path?: unknown; name?: unknown; description?: unknown; risk?: unknown };
type RepositoryFile = { path: string; size: number };

/**
 * @returns The skills that fit the search, best first. Skills labelled offensive aren't offered.
 */
export function searchAwesomeIndex(entries: AwesomeEntry[], query: string, limit: number = RESULTS_PER_CATALOG): CatalogResult[] {
  const phrase = query.trim().toLowerCase();
  const words = phrase.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) {
    return [];
  }
  return entries
    .flatMap((entry) => {
      if (typeof entry.id !== "string" || typeof entry.path !== "string" || typeof entry.name !== "string" || entry.risk === "offensive") {
        return [];
      }
      const name = entry.name.toLowerCase();
      const description = typeof entry.description === "string" ? entry.description : "";
      const lowerDescription = description.toLowerCase();
      if (!words.every((word) => name.includes(word) || lowerDescription.includes(word))) {
        return [];
      }
      const score = (name === phrase ? 1000 : 0) + (name.includes(phrase) ? 100 : 0) + words.filter((word) => name.includes(word)).length * 10 + words.filter((word) => lowerDescription.includes(word)).length;
      const result: CatalogResult = {
        catalog: "Awesome Skills",
        source: AWESOME_REPOSITORY,
        skillId: entry.id,
        name: entry.name,
        path: entry.path,
        ...(description !== "" ? { description } : {}),
        ...(typeof entry.risk === "string" ? { risk: entry.risk } : {}),
      };
      return [{ result, score }];
    })
    .sort((a, b) => b.score - a.score || a.result.name.localeCompare(b.result.name))
    .slice(0, limit)
    .map(({ result }) => result);
}

/** Puts the results of the catalogs in one list, taking turns, and shows the same skill once. */
export function mergeResults(lists: CatalogResult[][]): CatalogResult[] {
  const merged: CatalogResult[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < Math.max(0, ...lists.map((list) => list.length)); index++) {
    for (const list of lists) {
      const result = list[index];
      const key = result === undefined ? "" : `${result.source}/${result.skillId}`.toLowerCase();
      if (result !== undefined && !seen.has(key)) {
        seen.add(key);
        merged.push(result);
      }
    }
  }
  return merged;
}

export function parseSkillsSh(body: unknown): CatalogResult[] {
  const skills = (body as { skills?: unknown }).skills;
  return (Array.isArray(skills) ? skills : []).flatMap((skill: Record<string, unknown>): CatalogResult[] =>
    typeof skill.source === "string" && typeof skill.skillId === "string" && isSource(skill.source)
      ? [{
          catalog: "skills.sh",
          source: skill.source,
          skillId: skill.skillId,
          name: typeof skill.name === "string" ? skill.name : skill.skillId,
          ...(typeof skill.installs === "number" ? { installs: skill.installs } : {}),
        }]
      : [],
  );
}

let index: { entries: AwesomeEntry[]; fetched: number } | undefined;
let indexRequest: Promise<AwesomeEntry[]> | undefined;

async function awesomeEntries(): Promise<AwesomeEntry[]> {
  if (index !== undefined && Date.now() - index.fetched < INDEX_CACHE_MS) {
    return index.entries;
  }
  // Searches at the same time share one download, and an old list is better than none.
  indexRequest ??= fetchJson<AwesomeEntry[]>(AWESOME_INDEX, MAX_INDEX_BYTES)
    .then((entries) => {
      if (!Array.isArray(entries)) throw new Error("The Awesome Skills list has an unexpected form");
      index = { entries, fetched: Date.now() };
      return entries;
    })
    .catch((error) => {
      if (index !== undefined) return index.entries;
      throw error;
    })
    .finally(() => (indexRequest = undefined));
  return indexRequest;
}

/** @returns The results of all catalogs, and which ones couldn't be asked */
export async function searchCatalogs(query: string): Promise<{ results: CatalogResult[]; failed: CatalogName[] }> {
  const url = new URL(SKILLS_SH_SEARCH);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(RESULTS_PER_CATALOG));

  const [skillsSh, awesome] = await Promise.allSettled([
    fetchJson<unknown>(url.toString(), MAX_INDEX_BYTES).then(parseSkillsSh),
    awesomeEntries().then((entries) => searchAwesomeIndex(entries, query)),
  ]);
  [skillsSh, awesome].forEach((outcome) => {
    if (outcome.status === "rejected") console.error("a skill catalog could not be searched:", outcome.reason instanceof Error ? outcome.reason.message : outcome.reason);
  });
  return {
    results: mergeResults([awesome, skillsSh].flatMap((outcome) => (outcome.status === "fulfilled" ? [outcome.value] : []))),
    failed: [
      ...(awesome.status === "rejected" ? (["Awesome Skills"] as const) : []),
      ...(skillsSh.status === "rejected" ? (["skills.sh"] as const) : []),
    ],
  };
}

const SOURCE = /^[\w.-]+\/[\w.-]+$/;
const SKILL_ID = /^[\w.:@-]{1,120}$/;
const FOLDER = /^[\w.@ -]+(\/[\w.@ -]+)*$/;

function isSource(source: string): boolean {
  return SOURCE.test(source) && !source.split("/").some((part) => part === "." || part === "..");
}

export function checkInput(source: string, skillId: string, path: string | undefined): void {
  if (!isSource(source)) {
    throw new CatalogInputError("That isn't a repository");
  }
  if (!SKILL_ID.test(skillId)) {
    throw new CatalogInputError("That isn't a skill name");
  }
  if (path !== undefined && (!FOLDER.test(path) || path.split("/").some((part) => part === ".." || part === "."))) {
    throw new CatalogInputError("That isn't a folder");
  }
}

/**
 * Where a skill is differs per repository.
 * @param paths Every file in the repository
 * @param skillId The skill's name in the catalog
 * @param knownPath Where the catalog says it is, if it says
 * @returns Its folder, "" for the top of the repository, or undefined if it isn't there
 */
export function findSkillFolder(paths: string[], skillId: string, knownPath?: string): string | undefined {
  if (knownPath !== undefined && paths.includes(`${knownPath}/SKILL.md`)) {
    return knownPath;
  }
  const skills = paths.filter((path) => /(^|\/)SKILL\.md$/.test(path));
  const matches = skills
    .filter((path) => path.split("/").at(-2)?.toLowerCase() === skillId.toLowerCase())
    .sort((a, b) => a.split("/").length - b.split("/").length || a.length - b.length);
  if (matches[0] !== undefined) {
    return matches[0].slice(0, -"/SKILL.md".length);
  }
  return skills.length === 1 && skills[0] === "SKILL.md" ? "" : undefined;
}

const MARKDOWN = /\.(md|markdown)$/i;
const NOTICE = /^(LICEN[CS]E|COPYING|NOTICE)(\.[a-z]+)?$/i;

/** @returns Which files of a skill are its text, and which aren't allowed. Licences are harmless and left out. */
export function sortFiles(names: string[]): { markdown: string[]; other: string[] } {
  const relevant = names.filter((name) => {
    const base = name.split("/").at(-1) ?? "";
    return !NOTICE.test(base) && base !== ".gitkeep";
  });
  return {
    markdown: relevant.filter((name) => MARKDOWN.test(name)),
    other: relevant.filter((name) => !MARKDOWN.test(name)),
  };
}

function githubHeaders(url: URL): Record<string, string> {
  const token = process.env.GITHUB_TOKEN?.trim();
  // Only ever to GitHub's own API, also if a request gets redirected.
  return url.hostname === "api.github.com" && token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson<T>(address: string, maxBytes: number): Promise<T> {
  const { status, bytes } = await fetchAllowed(address, maxBytes, undefined, githubHeaders);
  if (status === 403 || status === 429) {
    throw new Error(
      new URL(address).hostname === "api.github.com"
        ? "GitHub's hourly limit for this internet connection has been reached. Try again later, or set GITHUB_TOKEN in .env."
        : "This catalog is limiting requests. Try again later.",
    );
  }
  if (status === 404) {
    throw new Error("This skill's repository couldn't be found.");
  }
  if (status !== 200) {
    throw new Error(`Status ${status} from ${new URL(address).hostname}`);
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

type TreeEntry = { path?: unknown; type?: unknown; size?: unknown };

function toFiles(entries: TreeEntry[]): RepositoryFile[] {
  return entries.flatMap((entry) => (typeof entry.path === "string" && entry.type === "blob" ? [{ path: entry.path, size: typeof entry.size === "number" ? entry.size : 0 }] : []));
}

/** Very large repositories don't fit in one list, so then only this folder and those below it are asked for. */
async function listFolder(source: string, folder: string): Promise<RepositoryFile[]> {
  const files: RepositoryFile[] = [];
  const queue = [folder];
  for (let requests = 0; queue.length > 0; requests++) {
    if (requests >= MAX_FOLDER_REQUESTS) {
      throw new Error("This skill has too many folders to read.");
    }
    const current = queue.shift() as string;
    const entries = await fetchJson<{ path: string; type: string; size: number }[]>(`${GITHUB_API}/repos/${source}/contents/${encodePath(current)}`, MAX_TREE_BYTES);
    entries.forEach((entry) => {
      if (entry.type === "dir") queue.push(entry.path);
      else files.push({ path: entry.path, size: entry.size });
    });
  }
  return files;
}

async function repositoryFiles(source: string, skillId: string, path: string | undefined): Promise<{ files: RepositoryFile[]; folder: string | undefined }> {
  const tree = await fetchJson<{ tree?: TreeEntry[]; truncated?: boolean }>(`${GITHUB_API}/repos/${source}/git/trees/HEAD?recursive=1`, MAX_TREE_BYTES);
  const files = toFiles(tree.tree ?? []);
  const folder = findSkillFolder(files.map((file) => file.path), skillId, path);
  if (folder !== undefined || tree.truncated !== true) {
    return { files, folder };
  }
  for (const candidate of [...(path !== undefined ? [path] : []), `skills/${skillId}`, skillId]) {
    try {
      const listed = await listFolder(source, candidate);
      if (listed.some((file) => file.path === `${candidate}/SKILL.md`)) {
        return { files: listed, folder: candidate };
      }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("couldn't be found")) throw error;
    }
  }
  return { files, folder: undefined };
}

const cache = new Map<string, { skill: CatalogSkill; fetched: number }>();

/**
 * Reads a skill from its repository, if it is solely Markdown.
 * @throws CatalogInputError if the request isn't valid
 */
export async function readCatalogSkill(source: string, skillId: string, path: string | undefined): Promise<CatalogSkill> {
  checkInput(source, skillId, path);
  const key = `${source}/${skillId}/${path ?? ""}`.toLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined && Date.now() - cached.fetched < SKILL_CACHE_MS) {
    return cached.skill;
  }

  const { files, folder } = await repositoryFiles(source, skillId, path);
  if (folder === undefined) {
    throw new Error("This skill isn't in its repository any more. The catalog may be out of date.");
  }
  const prefix = folder === "" ? "" : `${folder}/`;
  const inFolder = files.filter((file) => file.path.startsWith(prefix));
  const relative = (file: RepositoryFile) => file.path.slice(prefix.length);
  const { markdown, other } = sortFiles(inFolder.map(relative));
  const repositoryUrl = `https://github.com/${source}${folder === "" ? "" : `/tree/HEAD/${encodePath(folder)}`}`;

  let skill: CatalogSkill;
  if (other.length > 0) {
    skill = { status: "refused", repositoryUrl, otherFiles: other };
  } else {
    if (markdown.length > MAX_FILES) {
      throw new Error("This skill has too many files.");
    }
    const size = inFolder.filter((file) => markdown.includes(relative(file))).reduce((total, file) => total + file.size, 0);
    if (size > MAX_SKILL_BYTES) {
      throw new Error("The text in this skill is too long.");
    }
    const read: { name: string; text: string }[] = [];
    for (const name of markdown) {
      const { status, bytes } = await fetchAllowed(`${RAW_FILES}/${source}/HEAD/${encodePath(prefix + name)}`, MAX_SKILL_BYTES);
      if (status !== 200) {
        throw new Error(`${name} couldn't be read from the repository.`);
      }
      read.push({ name, text: new TextDecoder().decode(bytes) });
    }
    skill = { status: "ok", repositoryUrl, files: read };
  }

  if (cache.size >= MAX_CACHED_SKILLS) {
    cache.delete(cache.keys().next().value as string);
  }
  cache.set(key, { skill, fetched: Date.now() });
  return skill;
}
