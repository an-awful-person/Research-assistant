import type { McpTool } from "../model/extensions.model";

type JsonSchema = {
  type?: unknown;
  description?: unknown;
  enum?: unknown;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: unknown;
};

export type FlatProperty = { type: string; description?: string; items?: { type: string } };
export type FlatSchema = { type: "object"; properties: Record<string, FlatProperty>; required: string[] };

const SIMPLE_TYPES = ["string", "number", "integer", "boolean", "array", "object"];
const MAX_DESCRIPTION = 500;
const MAX_ID = 60;

function typeOf(schema: JsonSchema | undefined): string {
  if (schema === undefined) return "string";
  const options = [schema.type].flat().filter((type): type is string => typeof type === "string" && type !== "null");
  if (options[0] !== undefined && SIMPLE_TYPES.includes(options[0])) return options[0];
  const alternative = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].find((option) => option.type !== "null");
  if (alternative !== undefined) return typeOf(alternative);
  return schema.properties !== undefined ? "object" : "string";
}

/**
 * Makes a tool's schema simple enough for the function calls of the mediator: one plain type per parameter, with the
 * required ones first, because a model that doesn't name its arguments gives them in order.
 */
export function flattenSchema(inputSchema: Record<string, unknown>): FlatSchema {
  const schema = inputSchema as JsonSchema;
  const properties = schema.properties ?? {};
  const required = (Array.isArray(schema.required) ? schema.required : []).filter(
    (name): name is string => typeof name === "string" && name in properties,
  );
  const names = [...required, ...Object.keys(properties).filter((name) => !required.includes(name))];
  return {
    type: "object",
    required,
    properties: Object.fromEntries(
      names.map((name) => {
        const property = properties[name];
        const type = typeOf(property);
        return [
          name,
          {
            type,
            ...(typeof property?.description === "string" ? { description: property.description } : {}),
            ...(type === "array" && property?.items !== undefined && typeOf(property.items) !== "object" ? { items: { type: typeOf(property.items) } } : {}),
          },
        ];
      }),
    ),
  };
}

/**
 * Turns what someone typed for a tool into values of the right types. Empty optional fields are left out.
 * @returns The values, or what is wrong
 */
export function parseToolValues(schema: FlatSchema, raw: Record<string, string>): { values: Record<string, unknown> } | { problem: string } {
  const values: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(schema.properties)) {
    const typed = (raw[name] ?? "").trim();
    if (typed === "") {
      if (schema.required.includes(name)) return { problem: `${name} is needed.` };
      continue;
    }
    if (property.type === "string") {
      values[name] = raw[name];
    } else if (property.type === "number" || property.type === "integer") {
      const number = Number(typed);
      if (!Number.isFinite(number) || (property.type === "integer" && !Number.isInteger(number))) {
        return { problem: `${name} has to be a ${property.type === "integer" ? "whole number" : "number"}.` };
      }
      values[name] = number;
    } else if (property.type === "boolean") {
      if (typed !== "true" && typed !== "false") return { problem: `${name} has to be true or false.` };
      values[name] = typed === "true";
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(typed);
      } catch {
        return { problem: `${name} isn't valid JSON.` };
      }
      const isList = Array.isArray(parsed);
      if (property.type === "array" ? !isList : isList || typeof parsed !== "object" || parsed === null) {
        return { problem: `${name} has to be a JSON ${property.type === "array" ? "list" : "object"}.` };
      }
      values[name] = parsed;
    }
  }
  return { values };
}

function oneLine(text: string, limit: number): string {
  const line = text.replace(/\s+/g, " ").replace(/\*\//g, "* /").trim();
  return line.length > limit ? `${line.slice(0, limit).trim()}...` : line;
}

const TS_TYPES: Record<string, string> = { integer: "number", array: "any[]" };

/** How a tool is described to the mediator, in the same form as the other agents. */
export function describeTool(id: string, tool: McpTool, serverName: string, schema: FlatSchema): string {
  const names = Object.keys(schema.properties);
  const parameters = names.map((name) => {
    const property = schema.properties[name];
    return `     * @param ${name} (${schema.required.includes(name) ? "" : "optional "}${property.type})${property.description !== undefined ? ` ${oneLine(property.description, 200)}` : ""}`;
  });
  const signature = names.map((name) => `${name}${schema.required.includes(name) ? "" : "?"}:${TS_TYPES[schema.properties[name].type] ?? schema.properties[name].type}`).join(", ");
  return [
    "    /**",
    `     * ${oneLine(tool.description, MAX_DESCRIPTION) || `The tool ${oneLine(tool.name, 80)}.`}`,
    `     * This tool comes from the MCP server "${oneLine(serverName, 80)}".${tool.readOnly ? "" : " It can change things, so the user is asked before it runs."}`,
    ...parameters,
    "     * @returns The result of the tool.",
    "     * /",
    `    ${id}(${signature}): string;`,
  ].join("\n");
}

/** @returns A name the mediator can call, which isn't in use yet */
export function toolId(origin: "owner" | "personal", serverName: string, toolName: string, used: Set<string>): string {
  const clean = (text: string) => text.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const base = `mcp_${origin === "personal" ? "my_" : ""}${clean(serverName)}_${clean(toolName)}`.slice(0, MAX_ID);
  let id = base;
  for (let counter = 2; used.has(id); counter++) {
    id = `${base}_${counter}`;
  }
  used.add(id);
  return id;
}
