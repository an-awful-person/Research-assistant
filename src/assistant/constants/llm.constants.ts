import { type LLMMessage } from "../model/llm.model";

export enum GUIDED_DECODING_TYPE {
    JSON = 'json',
    JSON_SCHEMA = 'json_schema',
    GUIDED_CHOICE = 'guided_choice',
    GUIDED_REGEX = 'guided_regex',
    GUIDED_GRAMMAR = 'guided_grammar',
    GUIDED_WHITESPACE_PATTERN = 'guided_whitespace_pattern'
}

export enum MESSAGE_ROLES {
    SYSTEM = 'system',
    USER = 'user',
    ASSISTANT = 'assistant'
}

export enum SKY_MODELS {
    SMALL = 'small',
    LARGE = 'large'
}

/**
 * Made for when the forced JSON format comes in a unexpected format.
 */
export const WRONG_JSON_FORMAT: LLMMessage = {
    role:MESSAGE_ROLES.USER,
    content:"The response was in an incorrect JSON format. Could you please adjust your previous answer to fit the JSON schema?"
};

/** Tells the mediator how to cite what an agent found, which is checked by code when it answers. */
export const CITE_SOURCES_NOTE =
  "Each source that was used has an id, like S1. In your answer, put the id in square brackets after every statement that comes from that source, like: It was released in 2025 [S1]. Only sources with an id may be cited, and don't name a source without its id.";
