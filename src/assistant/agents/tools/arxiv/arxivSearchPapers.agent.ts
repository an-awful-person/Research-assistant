import z from "zod";
import { AbstractAgent } from "../../../../interfaces/agents.interface";
import { MESSAGE_ROLES } from "../../../constants/llm.constants";
import type { AssistantService } from "../../../services/assistant.service";

export const ARXIV_MAX_PAPERS = 2;

export class ArxivSearchPapersAgent extends AbstractAgent {
  protected _id = "arxivSearchPapersAgent";

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
   * @param input [papers as JSON, the topic, the question]
   * @returns JSON with the ids of the relevant papers
   */
  async main(input: string[]): Promise<string> {
    const chatService = this._assistantService.mediatorService;
    const openChatID = chatService.createID(this.id);
    chatService.addChat(openChatID);

    const messages = [
      { role: MESSAGE_ROLES.SYSTEM, content: FIND_ARXIV_PAPERS_SYSTEM_MESSAGE },
      { role: MESSAGE_ROLES.USER, content: `Papers:\n${input[0]}\n\nTopic:\n${input[1]}\n\nQuestion:\n${input[2]}` },
    ];
    messages.forEach((message) => chatService.pushMessage(openChatID, message));

    const result = await this._assistantService.llmApiService.jsonCall<FindArxivPapersResponseMessage>(
      messages,
      FIND_ARXIV_PAPERS_JSON_SCHEMA,
      { temperature: this._assistantService.temperatureService.forAgent(this._temperatureAgentId) },
    );

    const content = JSON.stringify(result);
    chatService.pushMessage(openChatID, { role: MESSAGE_ROLES.ASSISTANT, content: content });
    return content;
  }
}

export const FIND_ARXIV_PAPERS_SYSTEM_MESSAGE = `
You are an agent that picks the scientific papers most likely to answer a question.
You are given a list of papers in the format {id:string, title:string, citations:number, abstract:string}[], a topic and a question.
You can only pick a maximum of ${ARXIV_MAX_PAPERS} papers. Copy their ids exactly.
Only pick papers about the subject of the topic and question, however many citations a paper has.
Between papers on the same subject, prefer the original work, which often has the most citations, over papers that build on it.
If none of the papers are relevant to the question, return an empty list.

Your answer should be in the following JSON format:
{
"ids": ["The id of the most relevant paper", "The id of another relevant paper"]
}
`;

export const FIND_ARXIV_PAPERS_JSON_SCHEMA = z.toJSONSchema(
  z.object({ ids: z.array(z.string()).max(ARXIV_MAX_PAPERS) }),
);

export type FindArxivPapersResponseMessage = {
  ids: string[];
};
