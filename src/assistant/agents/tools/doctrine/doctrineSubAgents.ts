import z from "zod";
import { AbstractAgent } from "../../../../interfaces/agents.interface";
import { MESSAGE_ROLES } from "../../../constants/llm.constants";
import type { AssistantService } from "../../../services/assistant.service";

export const DOCTRINE_MAX_DOCUMENTS = 2;

/**
 * A step of the doctrine agent that makes one model call and shows it in its own chat.
 */
abstract class DoctrineStepAgent<T> extends AbstractAgent {
  private _assistantService: AssistantService;
  private _temperatureAgentId: string;

  protected abstract _systemMessage: string;
  protected abstract _schema: object;

  /**
   * @param assistantService The assistant
   * @param temperatureAgentId The id of the agent this is a part of, whose temperature this uses
   */
  constructor(assistantService: AssistantService, temperatureAgentId: string) {
    super(assistantService.mediatorService.agentsService);
    this._assistantService = assistantService;
    this._temperatureAgentId = temperatureAgentId;
  }

  protected async ask(content: string): Promise<T> {
    const chatService = this._assistantService.mediatorService;
    const openChatID = chatService.createID(this.id);
    chatService.addChat(openChatID);

    const messages = [
      { role: MESSAGE_ROLES.SYSTEM, content: this._systemMessage },
      { role: MESSAGE_ROLES.USER, content: content },
    ];
    messages.forEach((message) => chatService.pushMessage(openChatID, message));

    const result = await this._assistantService.llmApiService.jsonCall<T>(messages, this._schema, {
      temperature: this._assistantService.temperatureService.forAgent(this._temperatureAgentId),
    });
    chatService.pushMessage(openChatID, { role: MESSAGE_ROLES.ASSISTANT, content: JSON.stringify(result) });
    return result;
  }
}

export type DoctrinePickResponse = { refs: string[] };

export class DoctrinePickAgent extends DoctrineStepAgent<DoctrinePickResponse> {
  protected _id = "doctrinePickAgent";

  protected _systemMessage = `
You are an agent that picks the documents most likely to answer a question about military doctrine or policy.
You are given a list of documents in the format {ref:string, title:string, date:string, provenance:string}[], a topic and a question.
You can only pick a maximum of ${DOCTRINE_MAX_DOCUMENTS} documents. Copy their refs exactly.
Prefer doctrine and official publications that are about the subject. If none are relevant, return an empty list.

Your answer should be in the following JSON format:
{
"refs": ["The ref of the most relevant document", "The ref of another relevant document"]
}
`;

  protected _schema = z.toJSONSchema(z.object({ refs: z.array(z.string()).max(DOCTRINE_MAX_DOCUMENTS) }));

  /**
   * @param input [documents as JSON, the topic, the question]
   */
  async main(input: string[]): Promise<string> {
    return JSON.stringify(await this.ask(`Documents:\n${input[0]}\n\nTopic:\n${input[1]}\n\nQuestion:\n${input[2]}`));
  }
}

export type DoctrineAnswerResponse = { answer: string; usedPassages: string[] };

export class DoctrineAnswerAgent extends DoctrineStepAgent<DoctrineAnswerResponse> {
  protected _id = "doctrineAnswerAgent";

  protected _systemMessage = `
You are an agent that answers a question using only the given text from a military or government document.
Do not use any other knowledge. If the text does not answer the question, say so in your answer.

Your answer should be in the following JSON format:
{
    answer: string; //The answer to the question, based only on the given text.
    usedPassages: string[]; //The sentences from the text the answer is based on, copied exactly.
}
`;

  protected _schema = z.toJSONSchema(
    z.object({
      answer: z.string().describe("The answer to the question, based only on the given text."),
      usedPassages: z.array(z.string()).describe("The sentences from the text the answer is based on, copied exactly."),
    }),
  );

  /**
   * @param input [the text of the document to use, the question]
   */
  async main(input: string[]): Promise<string> {
    return JSON.stringify(await this.ask(`Text from the document:\n${input[0]}\n\nQuestion:\n${input[1]}`));
  }
}
