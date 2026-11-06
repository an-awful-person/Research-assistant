import z from "zod";
import { AbstractAgent } from "../../../../interfaces/agents.interface";
import { MESSAGE_ROLES } from "../../../constants/llm.constants";
import type { AssistantService } from "../../../services/assistant.service";

export class ArxivPaperAnswerAgent extends AbstractAgent {
  protected _id = "arxivPaperAnswerAgent";

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
   * @param input [the text of the paper to use, the question]
   * @returns JSON with the answer and the passages it is based on
   */
  async main(input: string[]): Promise<string> {
    const chatService = this._assistantService.mediatorService;
    const openChatID = chatService.createID(this.id);
    chatService.addChat(openChatID);

    const messages = [
      { role: MESSAGE_ROLES.SYSTEM, content: ARXIV_PAPER_ANSWER_SYSTEM_MESSAGE },
      { role: MESSAGE_ROLES.USER, content: `Text from the paper:\n${input[0]}\n\nQuestion:\n${input[1]}` },
    ];
    messages.forEach((message) => chatService.pushMessage(openChatID, message));

    const result = await this._assistantService.llmApiService.jsonCall<ArxivPaperAnswerResponseMessage>(
      messages,
      ARXIV_PAPER_ANSWER_JSON_SCHEMA,
      { temperature: this._assistantService.temperatureService.forAgent(this._temperatureAgentId) }, this._assistantService.modelService.forAgent(this._temperatureAgentId),
    );

    const content = JSON.stringify(result);
    chatService.pushMessage(openChatID, { role: MESSAGE_ROLES.ASSISTANT, content: content });
    return content;
  }
}

export const ARXIV_PAPER_ANSWER_SYSTEM_MESSAGE = `
You are an agent that answers a question using only the given text from a scientific paper.
Do not use any other knowledge. If the text does not answer the question, say so in your answer.

Your answer should be in the following JSON format:
{
    answer: string; //The answer to the question, based only on the given text.
    usedPassages: string[]; //The sentences from the text the answer is based on, copied exactly.
}
`;

export const ARXIV_PAPER_ANSWER_JSON_SCHEMA = z.toJSONSchema(
  z.object({
    answer: z.string().describe("The answer to the question, based only on the given text."),
    usedPassages: z
      .array(z.string())
      .describe("The sentences from the text the answer is based on, copied exactly."),
  }),
);

export type ArxivPaperAnswerResponseMessage = {
  answer: string;
  usedPassages: string[];
};
