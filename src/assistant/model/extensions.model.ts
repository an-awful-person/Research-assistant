/** A skill: instructions the mediator can follow. Only text, so nothing in it is ever run. */
export type Skill = {
  id: string;
  name: string;
  description: string;
  body: string;
  /** The text files that came with it, like references. */
  files: { name: string; text: string }[];
  origin: "owner" | "personal";
  /** Files that were left out, like scripts. */
  ignored: string[];
  /** Where it was found, if it came from a catalog. */
  catalog?: { name: string; repositoryUrl: string; risk?: string; installs?: number };
};

/** An MCP server found by searching the registry. */
export type RegistryServer = {
  name: string;
  title: string;
  description: string;
  publisher: string;
  version: string;
  websiteUrl?: string;
  repositoryUrl?: string;
  /** remote can be added directly, local needs the computer's owner, unsupported can't be used. */
  kind: "remote" | "local" | "unsupported";
  reason?: string;
  remote?: {
    url: string;
    header?: { name: string; description: string; required: boolean };
    variables: { name: string; description: string; required: boolean; default: string }[];
  };
  /** As the registry lists them, for what the owner can paste. */
  packages: unknown[];
};

/** A skill found by searching the catalogs. */
export type CatalogResult = {
  catalog: string;
  source: string;
  skillId: string;
  name: string;
  description?: string;
  risk?: string;
  installs?: number;
  path?: string;
};

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
};

export type McpServer = {
  /** Unique among all servers, like owner:files or personal:abc. */
  id: string;
  name: string;
  origin: "owner" | "personal";
  /** For a server of the owner: if other devices can use it too. */
  shared: boolean;
  ready: boolean;
  problem?: string;
  tools: McpTool[];
};

/** A remote server someone added. The key stays in their browser and only passes through for each request. */
export type PersonalMcpServer = {
  id: string;
  name: string;
  url: string;
  headerName: string;
  headerValue: string;
};

export type McpApproval = {
  agentId: string;
  label: string;
  /** Exactly what will be sent if the user allows it. */
  values: Record<string, unknown>;
};

export type McpResult = { text: string; isError: boolean; link?: string; needsKey?: boolean };

/** A tool couldn't be used because its server wants a key. */
export type McpKeyProblem = { serverId: string; serverName: string; origin: "owner" | "personal"; message: string };
