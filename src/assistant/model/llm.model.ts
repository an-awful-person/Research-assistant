/* eslint-disable @typescript-eslint/no-explicit-any */
import { type ZodStandardJSONSchemaPayload } from "zod/v4/core";
import { GUIDED_DECODING_TYPE, MESSAGE_ROLES, SKY_MODELS } from "../constants/llm.constants";
import type { EvidenceModel, SourceWarning } from "./reference.model";

export type LLMCall = {
    account:string;
    messages:LLMMessage[];
    model:string | SKY_MODELS;
    guided_decoding?:GuidedDecoding;
    service_tier?: 'realtime' | string;
    stream?:boolean;
    with_rag?:boolean;
    temperature?:number;
    max_tokens?:number;
    top_p?:number;
    frequency_penalty?:number;
    presence_penalty?:number;
    stop?:string[];
}

export type LLMMessage = {
    role: string | MESSAGE_ROLES;
    content: string;
    type?: "json" | "text";
}

export type META_LMMMessage = LLMMessage & {
    agents?:string[];
    citations?:EvidenceModel[]; //The sources that were checked to support this message.
    unverified?:boolean; //If no source could be found that supports this message.
    sourceWarnings?:SourceWarning[]; //What the reader should know about the sources of this message.
    failedAttempts?:string[]; //Why earlier attempts at this message failed. Only for analysis, the model doesn't read this.
}

export type GuidedDecoding = {
    type: string | GUIDED_DECODING_TYPE,
    json_schema?:JSONSchemaProperties | ZodStandardJSONSchemaPayload<any>;
}

export type JSONSchemaProperties = {
    [key:string]:{
        type:string;
        title?:string;
        description?:string;
        enum?:string[];
        properties?:JSONSchemaProperties;
        items?:{ // for arrays
            type:string;
            enum?:string[];
        };
        minContains?:number;
        maxContains?:number;
        minItems?:number;
        maxItems?:number;
        uniqueItems?:boolean;
        additionalProperties?:boolean;
        patternProperties?:JSONSchemaProperties;
        dependencies?:JSONSchemaProperties;
        const?:any;
        format?:string;
        minLength?:number;
        maxLength?:number;
        minimum?:number;
        maximum?:number;
        exclusiveMinimum?:number;
        exclusiveMaximum?:number;
        multipleOf?:number;
        pattern?:string;
        default?:any;
        examples?:any[]; //
        required?:string[];
    }
}

export type LLMResponse<T> = {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: LLMChoice<T>[];
    usage: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        account?: string;
        service_tier?:string;
        total_ms?:number;
        total_tps?:number
    };
}

export type LLMChoice<T> = {
    index: number;
    message: TypedLLMMessage<T>;
    finish_reason: string | null;
}

export type TypedLLMMessage<T> = LLMMessage & {
    content: T;
}

export type ResponseMessage = {
    response:string
}

export type QuestionMessage = {
    question:string
}

export type FindAgentMessage = {
    name:string;
    parameters:string[];
}
