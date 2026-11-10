import z from "zod";
import { MESSAGE_ROLES } from "../constants/llm.constants";
import { type LLMMessage } from "./llm.model";

export const AGENTS_DESCRIPTION_KEYWORD = '[AGENTS_DESCRIPTION]'

/** Where the uploaded documents are described, if there are any. */
export const DOCUMENTS_KEYWORD = '[DOCUMENTS]'
export const SKILLS_KEYWORD = "{SKILLS_DESCRIPTION}";

export const REACT_PROMPT_SYSTEM_MESSAGE: LLMMessage = {
    role: MESSAGE_ROLES.SYSTEM,
    content: `
You are a research assistant. Your role is to aid researchers in writing scientific papers, analysing their work and search for sources that could strengthen or debunk any claims.

Your answer must follow a JSON format. Creating an object with the following properties:
 * 'answer_certainty': a number between 0.0 and 1.0 where you rate how certain you are that you can answer the original question. Keep in mind that you could acquire more information if needed. Also keep in mind that answers that include a function other than askUser or respond result in a generated answer and are not part of the original question.
 * 'explain_certainty': Describe why you give the answer_certainty number and how you came to that certainty value.
 * 'plan': a string describing your plan to acquire more answer to get more certain if needed. Try to think in multiple steps if your plan requires it. Write your plan in such a way that your future answers can make use of it.
 * 'information_needed': an array of strings describing the information you still need to get more certain about your answer.
 * 'function': a string describing a function you might need to acquire more information. Only write down the function you need but replace the parameters with the parameters you want to use. Keep in mind that the answer of the function can be used in other functions in the next answer. For example: "myFunction(1.0)". There must always be atleast 1 function call present. You can only trigger 1 function at the time so plan ahead if you need more information. Write text parameters in single quotes and never use double quotes inside the function.
`
}

export const ADDITIONAL_AGENT_DESCRIPTION : string = `
To answer questions you can ask questions back to the user or use the following (typescript) functions at your disposal:

${AGENTS_DESCRIPTION_KEYWORD}
${DOCUMENTS_KEYWORD}
${SKILLS_KEYWORD}
Always provide a function in your response! If you know enough, use the 'respond(answer:string)' function, else if you can't find a proper function, use askUser(question:string) to ask the user for more information.

A search that finds little doesn't mean the information doesn't exist. Before you conclude that something can't be found, approach it from different angles: search again with other words, such as synonyms, broader or narrower terms, abbreviations or related names, and try other functions that could know about it. Never make the same call twice. If you still find nothing, say what you tried, and don't fill the gaps from memory.

When you respond, cite the sources you used by their ids in square brackets, like [S1], after each statement that comes from them. Only sources that functions gave an id can be cited.
`

/** What a search agent tells the mediator about what to do with its result. */
export const SEARCH_NEXT_STEP = "If this answers the question, use respond next. If it doesn't, try different wording or another function.";

export const REACT_PROMPT = z.toJSONSchema(z.object({
    answer_certainty:z.number().describe('a number between 0.0 and 1.0 where you rate how certain you are that you can answer the original question. Keep in mind that you could acquire more information if needed. Also keep in mind that answers that include a function other than askUser or respond result in a generated answer and are not part of the original question.'),
    explain_certainty:z.string().describe('Describe why you give the answer_certainty number and how you came to that certainty value.'),
    plan:z.string().describe('a string describing your plan to acquire more answer to get more certain if needed. Try to think in multiple steps if your plan requires it. Write your plan in such a way that your future answers can make use of it.'),
    information_needed:z.array(z.string()).describe('an array of strings describing the information you still need to get more certain about your answer.'),
    function:z.string().describe('a string describing a function you might need to acquire more information. Only write down the function you need but replace the parameters with the parameters you want to use. Keep in mind that the answer of the function can be used in other functions in the next answer. For example: "myFunction(1.0)". There must always be atleast 1 function call present. You can only trigger 1 function at the time so plan ahead if you need more information. Write text parameters in single quotes and never use double quotes inside the function.')
}));

export type ReActPromptResponse = {
    explain_certainty:string,
    answer_certainty:number,
    plan:string,
    information_needed:string[],
    function:string
}