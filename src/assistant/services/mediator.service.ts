import { Subscription } from "rxjs";
import { type Service } from "../../interfaces/service.interface";
import { Reactive } from "../../services/reactive.service";
import { ReactiveMap } from "../../services/reactiveMap.service";
import { MESSAGE_ROLES } from "../constants/llm.constants";
import { REACT_PROMPT, REACT_PROMPT_SYSTEM_MESSAGE, type ReActPromptResponse } from "../model/decoding.model";
import { type FindAgentMessage, type LLMMessage, type META_LMMMessage, type QuestionMessage, type ResponseMessage } from "../model/llm.model";
import { AgentsService, KNOWN_FUNCTIONS } from "./agents.service";
import { FunctionCallUtils } from "./functionCall.utils";
import { LLMApiService } from "./llmApi.service";
import { AssistantService } from "./assistant.service";
import { type ChatInjectDataPair } from "../../models/chat.model";
import type { EvidenceModel } from "../model/reference.model";

export class MediatorService implements Service {
  public static readonly VISIBLE_CHAT_ID = "user chat";

  public static readonly MEDIATOR_AGENT_ID = "mediator agent";

  private static readonly MAX_REWRITES = 2;

  // Trying other angles has to end somewhere, for the waiting time and for the search engines.
  private static readonly MAX_SEARCHES = 6;

  private static readonly MAX_REMINDERS = 2;

  private static readonly ADD_SOURCE_IDS = "Your answer doesn't cite any source, although the functions you used found sources with ids, like S1. Write the same answer again with respond, and put the id in square brackets after each statement that comes from a source, like: It was released in 2025 [S1]. Leave statements that don't come from a source without an id.";

  // Below this, the mediator itself says that it doesn't have enough to answer.
  private static readonly MIN_CERTAINTY = 0.6;

  private _activeChats: ReactiveMap<META_LMMMessage[]> = new ReactiveMap<
    META_LMMMessage[]
  >();

  private _currentTextInput: Reactive<string> = new Reactive<string>("");

  private _imageDialogImage: Reactive<string> = new Reactive<string>("");
  private _imageDialogOpen: Reactive<boolean> = new Reactive<boolean>(false);

  private _failedAttempts: string[] = [];

  /** The calls made for the current question, by what makes them the same call. */
  private _searches: Map<string, FindAgentMessage> = new Map();

  private _reminders: number = 0;

  protected __subscriptions: Subscription[] = [];

  //external services
  protected __assistantService: AssistantService;
  private _LLMApiService: LLMApiService;

  //internal service
  private _agentsService: AgentsService;

  private _internalServices: Service[] = [];

  constructor(assistantService: AssistantService) {
    this.__assistantService = assistantService;

    this._LLMApiService = assistantService.llmApiService;

    this._agentsService = new AgentsService(this.__assistantService);
    this._internalServices.push(this._agentsService);

  }

  init() {
    this._internalServices.forEach((service) => service.init());

    this.initBaseChat();
  }

  exit() {
    this._internalServices.forEach((service) => service.exit());
    this.__subscriptions.forEach((sub) => sub.unsubscribe());
  }

  get currentTextInput(): Reactive<string> {
    return this._currentTextInput;
  }

  get activeChats(): ReactiveMap<META_LMMMessage[]> {
    return this._activeChats;
  }

  get imageDialogImage(): Reactive<string> {
    return this._imageDialogImage;
  }
  get imageDialogOpen(): Reactive<boolean> {
    return this._imageDialogOpen;
  }

  get agentsService(): AgentsService {
    return this._agentsService;
  }

  get assistantService(): AssistantService {
    return this.__assistantService;
  }

  /** If the model was already asked to add source ids to its answer for this question, which happens only once. */
  private _askedForSourceIds = false;

  submitDecodingMessage() {
    // Nothing to ask, or a question is still being answered, which a second one would mix with.
    if (this._currentTextInput.value.trim() === "") return;
    if (this._agentsService.currentStatus.value !== AgentsService.CLOSE_STATUS) return;

    this._failedAttempts = [];
    this._searches = new Map();
    this._reminders = 0;
    this._askedForSourceIds = false;
    this.__assistantService.evidenceService.clear(this._currentTextInput.value);

    this._agentsService.currentStatus.set(
      "trying to contact mediator agent model",
    );

    const mediatorChat = this.activeChats.get(
      MediatorService.MEDIATOR_AGENT_ID,
    );
    if (mediatorChat !== undefined && mediatorChat.length === 0) {
      this.pushMessage(
        MediatorService.MEDIATOR_AGENT_ID,
        REACT_PROMPT_SYSTEM_MESSAGE,
      );
    }

    const text: string = this._currentTextInput.value;

    const userMessage: META_LMMMessage = {
      role: MESSAGE_ROLES.USER,
      content: text,
      agents: this.agentsService.agents.value.map(agent => agent.id)
    };

    this._currentTextInput.set("");

    this.pushMessage(MediatorService.MEDIATOR_AGENT_ID, userMessage);
    this.pushMessage(MediatorService.VISIBLE_CHAT_ID, userMessage);

    this.askMediator(this.injectAgentMessage(MediatorService.MEDIATOR_AGENT_ID));
  }

  determineNextAction(answer: ReActPromptResponse) {
    this.agentsService.currentStatus.set("consulting mediator agent");

    const agents = this._agentsService.enabledAgents;
    let functionCall = typeof answer.function === "string"
      ? FunctionCallUtils.parse(answer.function, agents)
      : undefined;

    // Answers that can't be used are written again instead of being saved, so they take up no context.
    if (functionCall === undefined || answer.answer_certainty === undefined) {
      const problem = this.describeAnswerProblem(answer);
      this._failedAttempts.push(problem);
      if (this._failedAttempts.length <= MediatorService.MAX_REWRITES) {
        this.rewriteAnswer(answer, problem);
        return;
      }

      functionCall = typeof answer.function === "string" && FunctionCallUtils.isCutOff(answer.function, agents)
        ? FunctionCallUtils.parse(FunctionCallUtils.closeCutOffCall(answer.function, agents), agents)
        : undefined;
      if (functionCall === undefined) {
        console.warn("mediator gave up on an answer that can't be used:", answer);
        this.showFailure("Sorry, I could not produce a usable answer to this. Please try asking again, or rephrase your question.");
        return;
      }
    }

    if (this.isFinalAnswer(functionCall)) {
      const reminder = this.reminderFor(answer);
      if (reminder !== undefined) {
        this._reminders++;
        this.agentsService.currentStatus.set("Trying another angle");
        this.askAgain(answer, reminder);
        return;
      }
      if (this.lacksSourceIds(functionCall)) {
        this._askedForSourceIds = true;
        this.agentsService.currentStatus.set("Adding sources to the answer");
        this.askAgain(answer, MediatorService.ADD_SOURCE_IDS);
        return;
      }
    }

    this.pushMessage(MediatorService.MEDIATOR_AGENT_ID, {
      role: MESSAGE_ROLES.ASSISTANT,
      content: JSON.stringify(answer, null, 2),
      type: "json",
      ...(this._failedAttempts.length > 0 ? { failedAttempts: this._failedAttempts } : {}),
    });
    this._failedAttempts = [];

    const refusal = this.refusalFor(functionCall);
    if (refusal !== undefined) {
      this.askInternalMessage({
        role: MESSAGE_ROLES.USER,
        content: JSON.stringify({ [functionCall.name]: { answer: refusal } }, null, 2),
        type: "json",
      });
      return;
    }

    this._agentsService
      .activateFunction(functionCall)
      .then(async (functionResult) => {
      let responseMessage: META_LMMMessage | undefined = undefined;
      let citations: EvidenceModel[] | undefined = undefined;

      if (
        (functionResult.name === KNOWN_FUNCTIONS.ASK_USER ||
          functionResult.name === KNOWN_FUNCTIONS.RESPOND) &&
        functionResult.success
      ) {
        if (functionResult.name === KNOWN_FUNCTIONS.RESPOND) {
          const responseAnswer: ResponseMessage = JSON.parse(
            functionResult.answer,
          );
          const check = this.__assistantService.evidenceService.checkAnswer(responseAnswer.response);
          responseMessage = {
            role: MESSAGE_ROLES.ASSISTANT,
            content: check.text,
            sourceWarnings: check.warnings,
          };
          citations = check.citations;
          // The overview of sources shows the answer with the same numbers as the chat, without the links.
          this.__assistantService.evidenceService.recordUse(check.text.replace(/\[\[(\d+)\]\]\(#source-\d+\)/g, "[$1]"), citations);
        } else {
          const questionAnswer: QuestionMessage = JSON.parse(
            functionResult.answer,
          );
          responseMessage = {
            role: MESSAGE_ROLES.ASSISTANT,
            content: questionAnswer.question,
          };
        }
      }

      if (responseMessage === undefined) {
        let newResponseObject: {
          [key: string]: { answer: string };
        } = {};

        newResponseObject = {
          ...newResponseObject,
          ...{
            [functionResult.name]: {
              answer: functionResult.answer,
            },
          },
        };
        this.askInternalMessage({
          role: MESSAGE_ROLES.USER,
          content: JSON.stringify(newResponseObject, null, 2),
          type: "json",
        });
      } else {
        this.askExternalMessage({
          ...responseMessage,
          ...{ type: "text",
            citations: citations,
            unverified: citations !== undefined && citations.length === 0,
          },
        });
      }
      })
      .catch((error) => this.handleFailure(error));
  }

  /**
   * @returns If an answer cites no source by id while sources with ids were found, and the model wasn't asked yet
   */
  private lacksSourceIds(functionCall: FindAgentMessage): boolean {
    const evidenceService = this.__assistantService.evidenceService;
    if (functionCall.name !== KNOWN_FUNCTIONS.RESPOND || this._askedForSourceIds || !evidenceService.hasSources) {
      return false;
    }
    try {
      const { response }: ResponseMessage = JSON.parse(functionCall.parameters[0]);
      return typeof response === "string" && !evidenceService.citesSources(response);
    } catch {
      return false;
    }
  }

  private isFinalAnswer(functionCall: FindAgentMessage): boolean {
    return functionCall.name === KNOWN_FUNCTIONS.RESPOND || functionCall.name === KNOWN_FUNCTIONS.ASK_USER;
  }

  /**
   * Keeps track of a call that is about to be made.
   * @returns Why the call shouldn't be made, if it shouldn't be
   */
  private refusalFor(functionCall: FindAgentMessage): string | undefined {
    if (this.isFinalAnswer(functionCall)) {
      return undefined;
    }

    const key = `${functionCall.name}:${JSON.stringify(functionCall.parameters)}`.toLowerCase().replace(/\s+/g, " ");
    if (this._searches.has(key)) {
      return "This exact call was already made, so it was not made again. Change the wording or use another function.";
    }
    if (this._searches.size >= MediatorService.MAX_SEARCHES) {
      return "The limit of searches for this question has been reached, so this was not done. Use respond with what you have, and say what you tried.";
    }
    this._searches.set(key, functionCall);
    return undefined;
  }

  /**
   * The mediator can have more to try before it concludes anything.
   * @returns What to tell it, if it should try more first
   */
  private reminderFor(answer: ReActPromptResponse): string | undefined {
    const isOutOfSearches = this._searches.size >= MediatorService.MAX_SEARCHES;
    if (this._reminders >= MediatorService.MAX_REMINDERS || isOutOfSearches) {
      return undefined;
    }

    const isUnsure = answer.answer_certainty < MediatorService.MIN_CERTAINTY;
    const foundNothing = this._searches.size > 0 && !this.__assistantService.evidenceService.hasEvidence;
    if (!isUnsure && !foundNothing) {
      return undefined;
    }

    const calls = [...this._searches.values()];
    const usedAgents = new Set(calls.map((call) => call.name));
    const otherAgents = this._agentsService.enabledAgents
      .map((agent) => agent.id)
      .filter((id) => !usedAgents.has(id) && id !== KNOWN_FUNCTIONS.RESPOND && id !== KNOWN_FUNCTIONS.ASK_USER);

    return [
      foundNothing
        ? "You are about to conclude without having found a verified source."
        : "You rated yourself as unsure about this answer.",
      calls.length > 0
        ? `You already tried: ${calls.map((call) => `${call.name}(${this.describeParameters(call)})`).join(", ")}.`
        : "You have not searched for anything yet.",
      `Functions you have not tried: ${otherAgents.join(", ")}.`,
      `Approach it from a different angle: use other words, such as synonyms, broader or narrower terms or related names, or another function. You can make ${MediatorService.MAX_SEARCHES - calls.length} more searches.`,
      "If no function could help, respond and say what you tried, without filling the gaps from memory.",
    ].join(" ");
  }

  private describeParameters(functionCall: FindAgentMessage): string {
    try {
      return Object.values(JSON.parse(functionCall.parameters[0])).map((value) => JSON.stringify(value)).join(", ");
    } catch {
      return functionCall.parameters.join(", ");
    }
  }

  private describeAnswerProblem(answer: ReActPromptResponse): string {
    if (typeof answer.function !== "string" || answer.answer_certainty === undefined) {
      return "The answer did not fit the JSON schema. Fill in all of its fields.";
    }
    if (answer.function.trim() === "") {
      return "The answer has no function. There must always be 1 function. If you miss information that no function can provide, use askUser(question:string).";
    }
    return FunctionCallUtils.describeProblem(answer.function, this._agentsService.enabledAgents);
  }

  /**
   * Asks the model for a new answer. The failed answer and its correction are only sent along for this request.
   * @param answer The answer that can't be used
   * @param problem What is wrong with the answer
   */
  private rewriteAnswer(answer: ReActPromptResponse, problem: string) {
    console.warn("mediator answer can't be used, asking for a rewrite:", problem, answer);
    this.askAgain(answer, `Your last answer can't be used. ${problem} Write your whole answer again with this corrected.`);
  }

  /**
   * Asks the model for a new answer. The earlier answer and the instruction are only sent along for this request, so
   * they take up no context afterwards.
   */
  private askAgain(answer: ReActPromptResponse, instruction: string) {
    this.askMediator([
      ...this.injectAgentMessage(MediatorService.MEDIATOR_AGENT_ID),
      { role: MESSAGE_ROLES.ASSISTANT, content: JSON.stringify(answer, null, 2) },
      { role: MESSAGE_ROLES.USER, content: instruction },
    ]);
  }

  private askMediator(messages: LLMMessage[]) {
    this._LLMApiService
      .jsonCall<ReActPromptResponse>(messages, REACT_PROMPT, {
        temperature: this.__assistantService.temperatureService.general.value,
      })
      .then((response) => {
        this.determineNextAction(response);
      })
      .catch((error) => this.handleFailure(error));
  }

  private handleFailure(error: unknown) {
    console.error("mediator failed", error);
    const message = error instanceof SyntaxError
      ? "Sorry, the model's answer was cut off or could not be read. Please try again."
      : `Sorry, something went wrong while working on this. Please check that Ollama and any needed servers are running, and try again. (${error})`;
    this.showFailure(message);
  }

  private showFailure(message: string) {
    this.keepFailedAttempts();
    this.askExternalMessage({
      role: MESSAGE_ROLES.ASSISTANT,
      content: message,
      type: "text",
    });
  }

  /**
   * Without an answer to save, the failed attempts are kept on the last message of the mediator chat.
   * That is a copy, because the user's question is the same object in the public chat.
   */
  private keepFailedAttempts() {
    const chat = this.activeChats.get(MediatorService.MEDIATOR_AGENT_ID);
    if (chat !== undefined && chat.length > 0 && this._failedAttempts.length > 0) {
      const lastMessage = chat[chat.length - 1];
      chat[chat.length - 1] = {
        ...lastMessage,
        failedAttempts: [...(lastMessage.failedAttempts ?? []), ...this._failedAttempts],
      };
      this.activeChats.add(MediatorService.MEDIATOR_AGENT_ID, chat);
    }
    this._failedAttempts = [];
  }

  askInternalMessage(message: META_LMMMessage) {
    this.pushMessage(MediatorService.MEDIATOR_AGENT_ID, message);
    this.askMediator(this.injectAgentMessage(MediatorService.MEDIATOR_AGENT_ID));
  }

  askExternalMessage(message: META_LMMMessage) {
    this.agentsService.currentStatus.set(AgentsService.CLOSE_STATUS);
    this.pushMessage(MediatorService.VISIBLE_CHAT_ID, message);
  }

  injectAgentMessage(chatId: string): LLMMessage[] {
    const chat: LLMMessage[] = JSON.parse(JSON.stringify(this.activeChats.get(chatId) ?? []));
    if (chat.length > 0) {
      const lastMessage:LLMMessage = chat[chat.length - 1];
      // Models don't know the date, and may otherwise reject recent results as being from the future.
      lastMessage.content += `${this.agentsService.chatAgentMessage.value}\nToday's date is ${new Date().toISOString().slice(0, 10)}.`;
      chat[chat.length - 1] = lastMessage;        
    }
    return chat;
  }

  addChat(name: string, chatHistory: META_LMMMessage[] = []) {
    this._activeChats.add(name, chatHistory);
  }

  pushMessage(id: string, message: META_LMMMessage) {
    const chat = this.activeChats.get(id);
    if (chat !== undefined) {
      chat.push(message);
      this.activeChats.add(id, chat);
    }
  }

  createID(agentID: string): string {
    let counter: number = 0;
    while (this.activeChats.has(`${agentID}_${counter}`)) {
      counter++;
    }
    return `${agentID}_${counter}`;
  }

  initBaseChat() {
    this.addChat(MediatorService.VISIBLE_CHAT_ID, []);
    this.addChat(MediatorService.MEDIATOR_AGENT_ID, []);
  }

  clearChatData() {
    this.activeChats.set(new Map<string, META_LMMMessage[]>());
    this.currentTextInput.set("");
    this.imageDialogImage.set("");
    this.imageDialogOpen.set(false);
    this.initBaseChat();
  }

  /**
   *
   * @param message original LLM Message
   * @param dataList a map of injections, the {key} is the text it searches for and the {value} is text it replaces it with.
   * @returns editted message
   */
  protected __injectDataInMessage(
    message: META_LMMMessage,
    dataList: Map<string, string>,
  ): META_LMMMessage {
    const newMessage: META_LMMMessage = JSON.parse(JSON.stringify(message)); //to prevent editting the original object
    dataList.forEach((value, key) => {
      newMessage.content = newMessage.content.replace(key, value);
    });
    return newMessage;
  }

  protected __convertPairsToMap(
    pairs: ChatInjectDataPair[],
  ): Map<string, string> {
    const newMap = new Map<string, string>();
    pairs.forEach((pair) => {
      newMap.set(pair.key, pair.value);
    });
    return newMap;
  }

  editMessage(newContent: string, message: META_LMMMessage) {
    message.content = newContent;
  }

  /**
   * @param chatId The conversation to delete the message from
   * @param index The position of the message in that conversation
   */
  deleteMessage(chatId: string, index: number) {
    const messages = this.activeChats.get(chatId);
    if (messages && index < messages.length && index > -1) {
      messages.splice(index, 1);
      this.activeChats.add(chatId, messages);
    }
  }
}
