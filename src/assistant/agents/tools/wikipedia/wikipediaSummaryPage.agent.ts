import z from "zod";
import { AbstractAgent } from "../../../../interfaces/agents.interface";
import type { AssistantService } from "../../../services/assistant.service";
import type { AgentsService } from "../../../services/agents.service";
import { MESSAGE_ROLES } from "../../../constants/llm.constants";

export class WikipediaSummaryPageAgent extends AbstractAgent {
  private _systemMessageDescription = `
    /**
     * A function to determine the wikipedia pages that are relevant to the topic.
     * @param wiki_page The wikipedia page content
     * @param question The question that the summary needs to be about.
     * @returns a summary of the wikipedia page containing only the relevant information for the question.

     * @example
     * wikipediaSummaryPageAgent("{wiki_page:'The Matrix is a 1999 science fiction film directed by the Wachowskis and written by the Wachowskis and Larry Wachowski.', question:'Who made the matrix?'}");
     * /
    wikipediaSummaryPageAgent(wiki_page:string, question:string): string;
    `;
  protected _id = "wikipediaSummaryPageAgent";

  private _assistantService: AssistantService;

  protected _agentsService: AgentsService;

  private _temperatureAgentId: string;

  /**
   * @param assistantService The assistant
   * @param temperatureAgentId The id of the agent this is a part of, whose temperature this uses
   */
  constructor(assistantService: AssistantService, temperatureAgentId: string) {
    super(assistantService.mediatorService.agentsService);
    this._assistantService = assistantService;
    this._temperatureAgentId = temperatureAgentId;
    this._agentsService =
      this._assistantService.mediatorService.agentsService;
  }

  /**
   * @param input [the text of the page to use, the question]
   * @returns JSON with the answer and the passages it is based on
   */
  async main(input: string[]): Promise<string> {
    const chatService = this._assistantService.mediatorService;
    const openChatID = chatService.createID(this.id);
    chatService.addChat(openChatID);

    const messages = [
      { role: MESSAGE_ROLES.SYSTEM, content: SUMMARY_WIKIPEDIA_PAGE_SYSTEM_MESSAGE },
      { role: MESSAGE_ROLES.USER, content: `Text from the page:\n${input[0]}\n\nQuestion:\n${input[1]}` },
    ];
    messages.forEach((message) => chatService.pushMessage(openChatID, message));

    this._agentsService.currentStatus.set(`creating wikipedia page summary`);

    const result = await this._assistantService.llmApiService.jsonCall<SummaryWikipediaPageResponseMessage>(
      messages,
      SUMMARY_WIKIPEDIA_PAGE_DECODING_PROMPT,
      { temperature: this._assistantService.temperatureService.forAgent(this._temperatureAgentId) },
    );

    const content = JSON.stringify(result);
    chatService.pushMessage(openChatID, { role: MESSAGE_ROLES.ASSISTANT, content: content });
    return content;
  }

  get agentUsageDescription(): string {
    return this._systemMessageDescription;
  }

  get id(): string {
    return this._id;
  }

  get agentsService(): AgentsService {
    return this._agentsService;
  }
}

export const SUMMARY_WIKIPEDIA_PAGE_SYSTEM_MESSAGE = `
You are an agent that answers a question using only the given text from a wikipedia page.
Do not use any other knowledge. If the text does not answer the question, say so in your answer.

Your answer should be in the following JSON format:
{
    summary: string; //The answer to the question, based only on the given text.
    originalParagraphs: string[]; //The sentences from the text the answer is based on, copied exactly.
}
`;

export const SUMMARY_WIKIPEDIA_PAGE_DECODING_PROMPT = z.toJSONSchema(
  z.object({
    summary: z
      .string()
      .describe(
        "The answer to the question, based only on the given text.",
      ),
    originalParagraphs: z
      .array(z.string())
      .describe("The sentences from the text the answer is based on, copied exactly."),
  }),
);

export type SummaryWikipediaPageResponseMessage = {
  summary: string;
  originalParagraphs: string[];
};