import type { MediatorAccessableAgent } from "../../interfaces/agents.interface";
import type { FindAgentMessage } from "../model/llm.model";

type ParameterSchema = {
  type?: string;
  items?: { type?: string };
};

/**
 * Reads function calls written by the mediator without using an LLM, which could change the parameters.
 */
export class FunctionCallUtils {
  private static readonly QUOTES = ["'", '"', "`"];

  // respond() names its parameter 'answer' in its description, but 'response' in its schema.
  private static readonly PARAMETER_ALIASES: Record<string, string> = {
    answer: "response",
  };

  /**
   * @param functionString The function call, for example: myFunction('some word', 'another word')
   * @param agents The agents that can be called
   * @returns The call for activateFunction, or undefined if the call could not be read with certainty
   */
  static parse(
    functionString: string,
    agents: MediatorAccessableAgent[],
  ): FindAgentMessage | undefined {
    const call = this.firstCall(functionString, agents).match(
      // Some models add stray closing characters after a correct call, like: respond('text')}
      /^\s*([A-Za-z_]\w*)\s*\(([\s\S]*)\)[\s'"`}\]]*;?\s*$/,
    );
    const agent = this.findAgent(call?.[1], agents);
    if (call === null || agent === undefined) {
      return undefined;
    }

    const properties = this.properties(agent);
    const names = Object.keys(properties);
    if (names.length === 0) {
      return undefined;
    }

    // With a single parameter everything belongs to it, so its text can safely contain commas and quotes.
    const rawArguments = names.length === 1 ? [call[2]] : this.splitArguments(call[2], names);
    if (rawArguments === undefined || rawArguments.length !== names.length) {
      return undefined;
    }

    const parameters: Record<string, unknown> = {};
    for (let index = 0; index < names.length; index++) {
      const { name, value } = this.readName(rawArguments[index], names);
      const parameterName = name ?? names[index];
      const parsedValue = this.isCode(value)
        ? undefined
        : this.readValue(value, properties[parameterName]);
      if (parsedValue === undefined || parameterName in parameters) {
        return undefined;
      }
      parameters[parameterName] = parsedValue;
    }

    return { name: agent.id, parameters: [JSON.stringify(parameters)] };
  }

  /**
   * @param functionString A function call that could not be read
   * @param agents The agents that can be called
   * @returns What is wrong with the call, written to help the model correct it
   */
  static describeProblem(functionString: string, agents: MediatorAccessableAgent[]): string {
    if (this.isCutOff(functionString, agents)) {
      return "The function call was cut off, because a double quote ended the text early. Write the function in full, using single quotes and no double quotes inside it.";
    }

    const available = agents
      .map((agent) => `${agent.id}(${this.signature(agent)})`)
      .join(", ");
    const name = functionString.match(/^\s*([A-Za-z_]\w*)\s*\(/)?.[1];
    if (name === undefined) {
      return `The function must be one call with this form: name('text'). The available functions are: ${available}.`;
    }

    const agent = this.findAgent(name, agents);
    if (agent === undefined) {
      return `There is no function named ${name}. The available functions are: ${available}.`;
    }
    const argument = functionString.slice(functionString.indexOf("(") + 1);
    if (this.isCode(argument)) {
      return `Do not put a function or code inside ${agent.id}, because it can't be run from there. Any results you need are already in the conversation, so write them out as text: ${agent.id}('your text').`;
    }
    return `The parameters of ${agent.id} could not be read. Write it as ${agent.id}(${this.signature(agent)}), fill in every parameter with quoted text instead of code, and write nothing after the call.`;
  }

  /**
   * A double quote in the mediator's text can end its JSON string early, which leaves a call without its end.
   * @param functionString The function call
   * @param agents The agents that can be called
   * @returns If this is the start of a call to a known agent that never ends
   */
  static isCutOff(functionString: string, agents: MediatorAccessableAgent[]): boolean {
    const call = this.firstCall(functionString, agents).match(/^\s*([A-Za-z_]\w*)\s*\(([\s\S]*)$/);
    const agent = this.findAgent(call?.[1], agents);
    if (call === null || agent === undefined) {
      return false;
    }

    const argument = this.readName(call[2], Object.keys(this.properties(agent))).value.trim();
    if (this.QUOTES.includes(argument[0])) {
      return !new RegExp(`${argument[0]}\\s*\\)`).test(argument.slice(1));
    }
    return !argument.includes(")");
  }

  /**
   * Closes a call that was cut off, to use what there is of it.
   * @param functionString The function call
   * @param agents The agents that can be called
   * @returns The call with its end added
   */
  static closeCutOffCall(functionString: string, agents: MediatorAccessableAgent[]): string {
    const call = this.firstCall(functionString, agents).trimEnd();
    const argument = call.slice(call.indexOf("(") + 1);
    const quote = this.readName(argument, []).value.trimStart()[0];
    const named = argument.match(/^\s*\w+\s*[:=]\s*(['"`])/)?.[1];
    return `${call}${named ?? (this.QUOTES.includes(quote) ? quote : "")})`;
  }

  /**
   * The mediator should only make one call at a time. If it writes more, only the first is used.
   */
  private static firstCall(functionString: string, agents: MediatorAccessableAgent[]): string {
    const ids = agents.map((agent) => agent.id).join("|");
    const nextCall = functionString.search(new RegExp(`\\)\\s*(?:[,;]|&&|and\\b|then\\b)?\\s*(?:${ids})\\s*\\(`, "i"));
    return nextCall === -1 ? functionString : functionString.slice(0, nextCall + 1);
  }

  private static findAgent(
    name: string | undefined,
    agents: MediatorAccessableAgent[],
  ): MediatorAccessableAgent | undefined {
    return agents.find((agent) => agent.id.toLowerCase() === name?.toLowerCase());
  }

  private static signature(agent: MediatorAccessableAgent): string {
    return Object.entries(this.properties(agent))
      .map(([name, schema]) => `${name}:${schema.type ?? "string"}`)
      .join(", ");
  }

  private static properties(agent: MediatorAccessableAgent): Record<string, ParameterSchema> {
    const schema = agent.jsonSchema as unknown as {
      properties?: Record<string, ParameterSchema>;
    };
    return schema.properties ?? {};
  }

  /**
   * Splits on the commas between arguments. A quote only closes an argument if a next argument or the end follows,
   * so that text like 'What's the rate, exactly?' stays together.
   */
  private static splitArguments(text: string, names: string[]): string[] | undefined {
    const parameterNames = [...names, ...Object.keys(this.PARAMETER_ALIASES)].join("|");
    const nextArgument = new RegExp(`^\\s*,\\s*(?:['"\`\\[]|(?:${parameterNames})\\s*[:=])`);
    const argumentsFound: string[] = [];
    let position = 0;

    while (position < text.length) {
      const start = position;
      const prefix = this.readName(text.slice(start), names).prefixLength;
      const valueStart = start + prefix + (text.slice(start + prefix).match(/^\s*/)?.[0].length ?? 0);
      const opening = text[valueStart];
      let end = -1;

      if (this.QUOTES.includes(opening)) {
        for (let index = valueStart + 1; index < text.length; index++) {
          if (text[index] === "\\") {
            index++;
          } else if (text[index] === opening) {
            const rest = text.slice(index + 1);
            if (rest.trim() === "" || nextArgument.test(rest)) {
              end = index + 1;
              break;
            }
          }
        }
        if (end === -1) {
          return undefined;
        }
      } else {
        const closing = opening === "[" ? text.indexOf("]", valueStart) : valueStart - 1;
        const comma = text.indexOf(",", closing + 1);
        end = comma === -1 ? text.length : comma;
      }

      argumentsFound.push(text.slice(start, end));
      const comma = text.slice(end).match(/^\s*,/);
      position = comma === null ? text.length : end + comma[0].length;
    }

    return argumentsFound;
  }

  /**
   * Finds a named argument like: topic='some word'. Only known names followed by a quote or a list are accepted,
   * so that text like: Note: "some word" keeps its start.
   */
  private static readName(
    rawArgument: string,
    names: string[],
  ): { name?: string; value: string; prefixLength: number } {
    const match = rawArgument.match(/^\s*(\w+)\s*[:=]\s*(?=['"`[])/);
    const alias = match ? this.PARAMETER_ALIASES[match[1]] : undefined;
    const name = names.includes(match?.[1] ?? "") ? match?.[1] : alias;

    if (match === null || name === undefined || !names.includes(name)) {
      return { value: rawArgument, prefixLength: 0 };
    }
    return { name: name, value: rawArgument.slice(match[0].length), prefixLength: match[0].length };
  }

  /**
   * The mediator sometimes writes code as a parameter, like: arxivAgent('a')['answer'] or 'text ' + other('b').
   * That can't be run, and would be passed on as if it was text.
   */
  private static isCode(rawValue: string): boolean {
    const value = rawValue.trim();
    return /^[A-Za-z_]\w*\s*\(/.test(value) || /['"`]\s*\+|\+\s*['"`]/.test(value);
  }

  /**
   * @returns The value in the type its parameter expects, or undefined if it doesn't fit
   */
  private static readValue(rawValue: string, schema?: ParameterSchema): unknown {
    const value = rawValue.trim();

    if (schema?.type === "string") {
      // Some models close text with a different quote than they opened it with.
      const isQuoted =
        value.length >= 2 &&
        this.QUOTES.includes(value[0]) &&
        this.QUOTES.includes(value[value.length - 1]);
      const text = isQuoted
        ? value
            .slice(1, -1)
            .replace(/\\(['"`n\\])/g, (_match, escaped: string) =>
              escaped === "n" ? "\n" : escaped,
            )
        : value;
      return text.trim() === "" ? undefined : text;
    }

    try {
      // Models also write an array as text, like "[52.3, 4.8]".
      const isQuotedArray = schema?.type === "array" && /^['"`]\s*\[.*\]\s*['"`]$/s.test(value);
      const parsed = JSON.parse(isQuotedArray ? value.slice(1, -1) : value);
      const isValid =
        schema?.type === "array"
          ? Array.isArray(parsed) &&
            parsed.length > 0 &&
            parsed.every((item) => schema.items?.type === undefined || this.isOfType(item, schema.items.type))
          : schema?.type !== undefined && this.isOfType(parsed, schema.type);
      return isValid ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private static isOfType(value: unknown, type: string): boolean {
    return type === "integer" ? Number.isInteger(value) : typeof value === type;
  }
}
