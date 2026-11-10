import type { RegistryServer } from "../model/extensions.model";

const MAX_RESULTS = 30;
const MAX_NAME = 40;
const META = "io.modelcontextprotocol.registry/official";
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Header = { name?: unknown; description?: unknown; isRequired?: unknown };
type Variable = { description?: unknown; isRequired?: unknown; default?: unknown };
type Remote = { type?: unknown; url?: unknown; headers?: unknown; variables?: unknown };
type Package = { registryType?: unknown; identifier?: unknown; version?: unknown };
type Entry = {
  server?: {
    name?: unknown;
    title?: unknown;
    description?: unknown;
    version?: unknown;
    websiteUrl?: unknown;
    repository?: { url?: unknown };
    remotes?: unknown;
    packages?: unknown;
  };
  _meta?: Record<string, { status?: unknown; isLatest?: unknown } | undefined>;
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
/** Links come from whoever published the server, so only ordinary web addresses are kept. */
const webLink = (value: unknown): string | undefined => (/^https?:\/\//i.test(text(value)) ? text(value) : undefined);

function wordsOf(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter((word) => word !== "");
}

/**
 * The registry only finds part of a name, and needs at least 3 characters, so it is asked for the longest word.
 * @returns That word, or undefined if the search is too short
 */
export function searchWord(query: string): string | undefined {
  const longest = wordsOf(query).sort((a, b) => b.length - a.length)[0];
  return longest !== undefined && longest.length >= 3 ? longest : undefined;
}

function classify(remotes: Remote[], packages: Package[]): Pick<RegistryServer, "kind" | "reason" | "remote"> {
  const usable = remotes.filter((remote) => remote.type === "streamable-http" && /^https:\/\//i.test(text(remote.url)));
  const remote = usable.find((candidate) => list<Header>(candidate.headers).filter((header) => header.isRequired === true).length <= 1);
  if (remote !== undefined) {
    const headers = list<Header>(remote.headers).filter((header) => text(header.name) !== "");
    const header = headers.find((candidate) => candidate.isRequired === true) ?? headers[0];
    const variables = typeof remote.variables === "object" && remote.variables !== null ? (remote.variables as Record<string, Variable>) : {};
    return {
      kind: "remote",
      remote: {
        url: text(remote.url),
        ...(header !== undefined ? { header: { name: text(header.name), description: text(header.description), required: header.isRequired === true } } : {}),
        variables: Object.entries(variables).map(([name, variable]) => ({
          name,
          description: text(variable.description),
          required: variable.isRequired === true,
          default: text(variable.default),
        })),
      },
    };
  }
  if (usable.length > 0) {
    return { kind: "unsupported", reason: "It needs more than one key, which can't be entered here yet." };
  }
  if (packages.length > 0) {
    return { kind: "local" };
  }
  return {
    kind: "unsupported",
    reason: remotes.length > 0 ? "It uses an older kind of connection, which isn't supported." : "The registry doesn't say how to connect to it.",
  };
}

/**
 * @param body What the registry answered
 * @param query What the user searched for
 * @returns The current servers that fit every word of the search, those with the words in their name first
 */
export function parseRegistry(body: unknown, query: string): RegistryServer[] {
  const words = wordsOf(query);
  return list<Entry>((body as { servers?: unknown } | null)?.servers)
    .flatMap((entry) => {
      const server = entry.server;
      const meta = entry._meta?.[META];
      const name = text(server?.name);
      if (server === undefined || name === "" || (meta !== undefined && (meta.status !== "active" || meta.isLatest === false))) {
        return [];
      }
      const title = text(server.title);
      const description = text(server.description);
      const lowerName = name.toLowerCase();
      const lowerTitle = title.toLowerCase();
      const lowerDescription = description.toLowerCase();
      if (!words.every((word) => lowerName.includes(word) || lowerTitle.includes(word) || lowerDescription.includes(word))) {
        return [];
      }
      const score = words.reduce((total, word) => total + (lowerName.includes(word) ? 10 : 0) + (lowerTitle.includes(word) ? 5 : 0) + (lowerDescription.includes(word) ? 1 : 0), 0);
      const packages = list<Package>(server.packages);
      const website = webLink(server.websiteUrl);
      const repository = webLink(server.repository?.url);
      const result: RegistryServer = {
        name,
        title,
        description,
        publisher: name.split("/")[0],
        version: text(server.version),
        ...(website !== undefined ? { websiteUrl: website } : {}),
        ...(repository !== undefined ? { repositoryUrl: repository } : {}),
        packages,
        ...classify(list<Remote>(server.remotes), packages),
      };
      return [{ result, score }];
    })
    .sort((a, b) => b.score - a.score || a.result.name.localeCompare(b.result.name))
    .slice(0, MAX_RESULTS)
    .map(({ result }) => result);
}

/**
 * Fills in an address like https://{host}/mcp.
 * @returns The address, or undefined if something is missing or it wouldn't be an https address
 */
export function fillAddress(url: string, values: Record<string, string>): string | undefined {
  let missing = false;
  const filled = url.replace(/\{([^{}]+)\}/g, (_match, name: string) => {
    const value = (values[name] ?? "").trim();
    if (value === "") missing = true;
    return encodeURIComponent(value);
  });
  if (missing) {
    return undefined;
  }
  try {
    return new URL(filled).protocol === "https:" ? filled : undefined;
  } catch {
    return undefined;
  }
}

/** A key for the Authorization header is nearly always a bearer token, and people paste just the key. */
export function headerValueFor(headerName: string, value: string): string {
  const key = value.trim();
  return headerName.trim().toLowerCase() === "authorization" && key !== "" && !/\s/.test(key) ? `Bearer ${key}` : key;
}

/** The name to show for a server. */
export function shortName(server: Pick<RegistryServer, "name" | "title">): string {
  const name = (server.title.trim() || (server.name.split("/").at(-1) ?? server.name)).replace(/\s+/g, " ");
  return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1).trim()}…` : name;
}

type FullPackage = Package & {
  environmentVariables?: unknown;
  packageArguments?: unknown;
  runtimeArguments?: unknown;
};

/**
 * What the owner of the computer can paste into config/mcp.json. Only for packages that have a known way to start.
 * @returns The text and what to keep in mind, or undefined if there is no ready entry
 */
export function ownerEntry(server: Pick<RegistryServer, "name" | "packages">): { text: string; notes: string[] } | undefined {
  const packages = server.packages as FullPackage[];
  const chosen = packages.find((candidate) => candidate.registryType === "npm" && text(candidate.identifier) !== "") ?? packages.find((candidate) => candidate.registryType === "pypi" && text(candidate.identifier) !== "");
  if (chosen === undefined) {
    return undefined;
  }
  const id = text(chosen.identifier);
  const version = text(chosen.version);
  const isNpm = chosen.registryType === "npm";
  const args = isNpm ? ["-y", version !== "" ? `${id}@${version}` : id] : [version !== "" ? `${id}==${version}` : id];
  const variables = list<{ name?: unknown; isRequired?: unknown }>(chosen.environmentVariables)
    .filter((variable) => variable.isRequired === true && ENV_NAME.test(text(variable.name)))
    .map((variable) => text(variable.name));
  const key = (server.name.split("/").at(-1) ?? server.name).replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 40) || "server";
  const entry = {
    [key]: {
      command: isNpm ? "npx" : "uvx",
      args,
      ...(variables.length > 0 ? { env: Object.fromEntries(variables.map((name) => [name, `\${${name}}`])) } : {}),
    },
  };

  const notes: string[] = [];
  if (variables.length > 0) {
    notes.push(`Put ${variables.join(", ")} in .env.`);
  }
  if (!isNpm) {
    notes.push("This needs uvx (Python) on the computer. The Docker version doesn't have it.");
  }
  const needsArguments = [...list<{ isRequired?: unknown }>(chosen.packageArguments), ...list<{ isRequired?: unknown }>(chosen.runtimeArguments)].some((argument) => argument.isRequired === true);
  if (needsArguments) {
    notes.push("It also needs arguments, so check its documentation.");
  }
  return { text: JSON.stringify(entry, null, 2).split("\n").slice(1, -1).map((line) => line.slice(2)).join("\n"), notes };
}
