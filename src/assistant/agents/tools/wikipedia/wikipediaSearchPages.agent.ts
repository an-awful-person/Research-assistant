import z from "zod";
import type { AssistantService } from "../../../services/assistant.service";
import { AbstractAgent } from "../../../../interfaces/agents.interface";
import { MESSAGE_ROLES } from "../../../constants/llm.constants";

export const WIKIPEDIA_MAX_SEARCHES = 2;

export class WikipediaSearchPagesAgent extends AbstractAgent {
  private _systemMessageDescription = `
    /**
     * A function to determine the wikipedia pages that are relevant to the topic.
     * @param pages The wikipedia pages that are relevant to the topic. These should be in a {key:string, description:string}[] format to determine which key to return.
     * @param originalQuestion The original question that was asked.
     * @returns the key of the most relevant page or an empty list if none are relevant to the question.

     * @example
     * wikipediaSearchPagesAgent("{key:'The Matrix', description:'The Matrix is a 1999 science fiction film directed by the Wachowskis and written by the Wachowskis and Larry Wachowski.'},{key:'Matrix', description:'A mathematical structure to arrange numbers in a grid.'}", "Who are the directors of The Matrix?");
     * /
    wikipediaSearchPagesAgent(pages:string, originalQuestion:string): string;
    `;
  protected _id = "wikipediaSearchPagesAgent";

  private _assistantService: AssistantService;

  private _temperatureAgentId: string;

  /**
   * @param assistantService The assistant
   * @param temperatureAgentId The id of the agent this is a part of, whose temperature this uses
   */
  constructor(assistantService: AssistantService, temperatureAgentId: string) {
    super(assistantService.mediatorService.agentsService);
    this._assistantService = assistantService;
    this._temperatureAgentId = temperatureAgentId;
  }

  /**
   * @param input [pages as JSON, the topic, the question]
   * @returns JSON with the keys of the relevant pages
   */
  async main(input: string[]): Promise<string> {
    const chatService = this._assistantService.mediatorService;
    const openChatID = chatService.createID(this.id);
    chatService.addChat(openChatID);

    const messages = [
      { role: MESSAGE_ROLES.SYSTEM, content: FIND_WIKIPEDIA_PAGE_SYSTEM_MESSAGE },
      { role: MESSAGE_ROLES.USER, content: `Pages:\n${input[0]}\n\nTopic:\n${input[1]}\n\nQuestion:\n${input[2]}` },
    ];
    messages.forEach((message) => chatService.pushMessage(openChatID, message));

    const result = await this._assistantService.llmApiService.jsonCall<FindWikipediaPageResponseMessage>(
      messages,
      FIND_WIKIPEDIA_PAGE_JSON_SCHEMA,
      { temperature: this._assistantService.temperatureService.forAgent(this._temperatureAgentId) }, this._assistantService.modelService.forAgent(this._temperatureAgentId),
    );

    const content = JSON.stringify(result);
    chatService.pushMessage(openChatID, { role: MESSAGE_ROLES.ASSISTANT, content: content });
    return content;
  }

  get agentUsageDescription(): string {
    return this._systemMessageDescription;
  }
}

export const FIND_WIKIPEDIA_PAGE_SYSTEM_MESSAGE = `
You are an agent that picks the wikipedia pages most likely to answer a question.
You are given a list of pages in the format {key:string, title:string, description:string}[], a topic and a question.
You can only pick a maximum of ${WIKIPEDIA_MAX_SEARCHES} pages. Copy their keys exactly.
If none of the pages are relevant to the question, return an empty list.

Your answer should be in the following JSON format:
{
"keys": ["The key of the most relevant page", "The key of another relevant page"]
}
`;

export const FIND_WIKIPEDIA_PAGE_JSON_SCHEMA = z.toJSONSchema(z.object({keys:z.array(z.string()).max(WIKIPEDIA_MAX_SEARCHES)}));

export type FindWikipediaPageResponseMessage = {
  keys:string[];  
};
