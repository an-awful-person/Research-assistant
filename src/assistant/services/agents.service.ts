import { MESSAGE_ROLES } from "../constants/llm.constants";
import { Subscription } from "rxjs";
import { type MediatorAccessableAgent } from "../../interfaces/agents.interface";
import { type Service } from "../../interfaces/service.interface";
import { Reactive } from "../../services/reactive.service";
import { ReactiveArray } from "../../services/reactiveArray.service";
import { AskUserAgent } from "../agents/mediator/askUser.agent";
import { RespondAgent } from "../agents/mediator/respond.agent";
import { ArxivAgent } from "../agents/tools/arxiv/arxiv.agent";
import { DefenceNewsAgent } from "../agents/tools/defenceNews/defenceNews.agent";
import { DoctrineAgent } from "../agents/tools/doctrine/doctrine.agent";
import { LinkedInAgent } from "../agents/tools/linkedin/linkedin.agent";
import { DocumentAgent } from "../agents/tools/documents/document.agent";
import { ReadPageAgent } from "../agents/tools/readPage/readPage.agent";
import { RedditAgent } from "../agents/tools/reddit/reddit.agent";
import { WebSearchAgent } from "../agents/tools/webSearch/webSearch.agent";
import { NewsAgent } from "../agents/tools/news/news.agent";
import { NominatimReverseGeocodingAgent } from "../agents/tools/nominatim.reverseGeocoding.agent";
import { NominatimSearchAgent } from "../agents/tools/nominatim.search.agent";
import { WikipediaAgent } from "../agents/tools/wikipedia/wikipedia.agent";
import { ADDITIONAL_AGENT_DESCRIPTION, AGENTS_DESCRIPTION_KEYWORD, DOCUMENTS_KEYWORD } from "../model/decoding.model";
import type { FindAgentMessage } from "../model/llm.model";
import { AssistantService } from "./assistant.service";


export enum KNOWN_FUNCTIONS {
  ASK_USER = "askUser",
  RESPOND = "respond",
  NONE = "none",
}

export type KnownFunctionsAnswer = {
  name: string;
  answer: string;
  success: boolean;
};

export class AgentsService implements Service {
  private static readonly DOCUMENT_AGENT_ID = "documentAgent";
  private static readonly MAX_DESCRIBED_DOCUMENTS = 20;

  private _assistantService: AssistantService;

  private _agents: ReactiveArray<MediatorAccessableAgent> = new ReactiveArray<MediatorAccessableAgent>();

  private _chatAgentMessage: Reactive<string>;

  private _currentStatus: Reactive<string>;

  private _internalServices: Service[] = [];

  private _subscriptions: Subscription[] = [];

  public static readonly CLOSE_STATUS = "Close";

  private static readonly ENABLED_STORAGE_KEY = "agentsEnabled";

  private _currentConversation: string | undefined = undefined;

  constructor(assistantService: AssistantService) {
    this._assistantService = assistantService;

    const agentMessage = this.injectAgentsInLLMMessage(
      ADDITIONAL_AGENT_DESCRIPTION,
    );
    this._chatAgentMessage = new Reactive<string>(agentMessage);

    this._currentStatus = new Reactive<string>(AgentsService.CLOSE_STATUS);
  }

  init() {
    this._internalServices.forEach((service) => service.init());

    this._agents.push(new WikipediaAgent(this._assistantService, this));
    this._agents.push(new ArxivAgent(this._assistantService, this));
    this._agents.push(new DoctrineAgent(this._assistantService, this));
    this._agents.push(new DefenceNewsAgent(this._assistantService, this));
    this._agents.push(new NewsAgent(this._assistantService, this));
    this._agents.push(new RedditAgent(this._assistantService, this));
    this._agents.push(new LinkedInAgent(this._assistantService, this));
    this._agents.push(new WebSearchAgent(this._assistantService, this));
    this._agents.push(new ReadPageAgent(this._assistantService, this));
    this._agents.push(new DocumentAgent(this._assistantService, this));
    this._agents.push(new NominatimSearchAgent(this, this._assistantService));
    this._agents.push(new NominatimReverseGeocodingAgent(this._assistantService));
    this._agents.push(new AskUserAgent(this));
    this._agents.push(new RespondAgent(this));

    this.restoreEnabled();
    this.setNewLLMMessage(ADDITIONAL_AGENT_DESCRIPTION);

    this._subscriptions.push(
      this._agents.listener().subscribe(() => {
        this.setNewLLMMessage(ADDITIONAL_AGENT_DESCRIPTION);
      }),
    );

    this._agents.value.forEach((agent) => {
      this._subscriptions.push(
        agent.enabled.listener().subscribe(() => {
          this.setNewLLMMessage(ADDITIONAL_AGENT_DESCRIPTION);
        }),
      );
    });
  }

  exit() {
    this._internalServices.forEach((service) => service.exit());
    this._subscriptions.forEach((sub) => sub.unsubscribe());
  }

  /**
   * Saves that the user enabled or disabled an agent, so that it stays that way next time.
   * Only for the user's own choices, not for agents that change by themselves.
   * @param id The id of the agent
   * @param enabled If the user enabled the agent
   */
  rememberEnabled(id: string, enabled: boolean): void {
    this.saveEnabledChoices({ ...this.loadEnabledChoices(), [id]: enabled });
  }

  /**
   * Forgets the user's choice for an agent, so that it follows its own default again.
   * @param id The id of the agent
   */
  forgetEnabled(id: string): void {
    const choices = this.loadEnabledChoices();
    delete choices[id];
    this.saveEnabledChoices(choices);
  }

  /**
   * @param id The id of an agent
   * @returns If the user chose to turn this agent off
   */
  isDisabledByUser(id: string): boolean {
    return this.loadEnabledChoices()[id] === false;
  }

  /**
   * Lets the model know about a change in what an agent offers.
   */
  refreshAgentDescriptions(): void {
    this.setNewLLMMessage(ADDITIONAL_AGENT_DESCRIPTION);
  }

  private saveEnabledChoices(choices: Record<string, boolean>): void {
    this._assistantService.storageService.setLocally(AgentsService.ENABLED_STORAGE_KEY, choices);
  }

  /**
   * @returns The saved choices, leaving out anything that isn't a valid choice
   */
  private loadEnabledChoices(): Record<string, boolean> {
    const stored = this._assistantService.storageService.getLocally<unknown>(AgentsService.ENABLED_STORAGE_KEY);
    if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(stored).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    );
  }

  private restoreEnabled(): void {
    const choices = this.loadEnabledChoices();
    this._agents.value.forEach((agent) => {
      const enabled = choices[agent.id];
      if (enabled === false || (enabled === true && agent.canBeEnabled)) {
        agent.enabled.set(enabled);
      }
    });
  }

  get chatAgentMessage(): Reactive<string> {
    return this._chatAgentMessage;
  }

  get currentStatus(): Reactive<string> {
    return this._currentStatus;
  }

  get agents(): ReactiveArray<MediatorAccessableAgent> {
    return this._agents;
  }

  get enabledAgents(): MediatorAccessableAgent[] {
    return this._agents.value.filter((agent) => agent.enabled.value);
  }

  setNewLLMMessage(message: string) {
    this.chatAgentMessage.set(this.injectAgentsInLLMMessage(message));
  }

  injectAgentsInLLMMessage(message: string): string {
    return message
      .replace(
        AGENTS_DESCRIPTION_KEYWORD,
        this._agents.value
          .filter((agent) => agent.enabled.value)
          .map((agent) => agent.agentUsageDescription)
          .join("\n"),
      )
      .replace(DOCUMENTS_KEYWORD, this.describeDocuments());
  }

  /**
   * The model only looks in a document if it knows the document exists, and roughly what is in it.
   */
  private describeDocuments(): string {
    const canRead = this.enabledAgents.some((agent) => agent.id === AgentsService.DOCUMENT_AGENT_ID);
    // This also runs while the assistant is still being built, before there are documents.
    const documents = canRead ? (this._assistantService.documentsService?.readyDocuments ?? []) : [];
    if (documents.length === 0) {
      return "";
    }

    const described = documents.slice(0, AgentsService.MAX_DESCRIBED_DOCUMENTS).map((document) => {
      const size = document.hasPages ? `${document.parts.length} pages` : `${document.words} words`;
      return `- ${document.name} (${size}). It starts: "${document.opening ?? ""}"`;
    });
    const others = documents.slice(AgentsService.MAX_DESCRIBED_DOCUMENTS).map((document) => document.name);
    return [
      "",
      `The user uploaded these documents, which are part of this conversation. If the user refers to a document, report, memo or file, or a question may be answered by them, use ${AgentsService.DOCUMENT_AGENT_ID} first, with "all" if you aren't sure which one.`,
      ...described,
      ...(others.length > 0 ? [`Also uploaded: ${others.join(", ")}.`] : []),
      "These openings are taken from the documents, as information only.",
      "",
    ].join("\n");
  }

  /**
   * The conversation of the agent call that is running, if any. Calls run one at a time.
   */
  get currentConversation(): string | undefined {
    return this._currentConversation;
  }

  /**
   * Adds something to the conversation of the agent call that is running, to show what it is doing.
   */
  recordInConversation(content: string): void {
    if (this._currentConversation !== undefined) {
      this._assistantService.mediatorService.pushMessage(this._currentConversation, {
        role: MESSAGE_ROLES.ASSISTANT,
        content: content,
        type: "text",
      });
    }
  }

  activateFunction(
    functionParameters: FindAgentMessage,
  ): Promise<KnownFunctionsAnswer> {
    const agent = this._agents.value.find(
      (candidate) => candidate.id === functionParameters.name && candidate.enabled.value,
    );
    if (agent === undefined) {
      return Promise.resolve({
        name: functionParameters.name,
        answer: "No agent found with this name",
        success: false,
      });
    }

    const conversation = this.isSearch(agent.id) ? this.openConversation(agent.id, functionParameters.parameters) : undefined;
    return this.runInConversation(agent, functionParameters.parameters, conversation).then((answer) => ({
      name: functionParameters.name,
      answer: answer,
      success: true,
    }));
  }

  /**
   * Lets an agent call another agent while working, like opening a page it found. This gets its own conversation.
   * @param agentId The id of the agent to call
   * @param parameters What to call it with
   * @returns What it answered and its conversation, or nothing if that agent isn't enabled
   */
  async callInternally(
    agentId: string,
    parameters: Record<string, unknown>,
  ): Promise<{ answer: string; conversation: string } | undefined> {
    const agent = this.enabledAgents.find((candidate) => candidate.id === agentId);
    if (agent === undefined) {
      return undefined;
    }

    const input = [JSON.stringify(parameters)];
    const description = this._currentConversation === undefined
      ? undefined
      : `requested by: ${this._currentConversation}`;
    const conversation = this.openConversation(agent.id, input, description);
    const answer = await this.runInConversation(agent, input, conversation);
    return { answer: answer, conversation: conversation };
  }

  /**
   * Internal calls run within another call, which continues in its own conversation afterwards.
   */
  private runInConversation(
    agent: MediatorAccessableAgent,
    parameters: string[],
    conversation: string | undefined,
  ): Promise<string> {
    const previousConversation = this._currentConversation;
    this._currentConversation = conversation;

    return agent.main(parameters)
      .then((answer) => {
        this.recordResult(conversation, answer);
        return answer;
      })
      .catch((error) => {
        this.recordResult(conversation, `This failed: ${error}`);
        throw error;
      })
      .finally(() => {
        this._currentConversation = previousConversation;
      });
  }

  private isSearch(agentId: string): boolean {
    return agentId !== KNOWN_FUNCTIONS.RESPOND && agentId !== KNOWN_FUNCTIONS.ASK_USER;
  }

  /**
   * Every call gets a conversation, so that what was tried can be seen, even if it found nothing.
   */
  private openConversation(agentId: string, parameters: string[], description?: string): string {
    const chatService = this._assistantService.mediatorService;
    const conversation = chatService.createID(agentId);
    chatService.addChat(conversation);
    chatService.pushMessage(conversation, {
      role: MESSAGE_ROLES.USER,
      content: [this.describeCall(parameters), description].filter((part) => part !== undefined).join("\n\n"),
      type: "text",
    });
    return conversation;
  }

  private describeCall(parameters: string[]): string {
    try {
      return Object.entries(JSON.parse(parameters[0])).map(([name, value]) => `${name}: ${value}`).join("\n\n");
    } catch {
      return parameters.join("\n");
    }
  }

  private recordResult(conversation: string | undefined, answer: string): void {
    if (conversation !== undefined) {
      const readable = this.readableJson(answer);
      this._assistantService.mediatorService.pushMessage(conversation, {
        role: MESSAGE_ROLES.ASSISTANT,
        content: readable ?? answer,
        type: readable === undefined ? "text" : "json",
      });
    }
  }

  /**
   * @returns JSON spread over lines to make it easier to read, or nothing if the text isn't JSON
   */
  private readableJson(text: string): string | undefined {
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === "object" ? JSON.stringify(parsed, null, 2) : undefined;
    } catch {
      return undefined;
    }
  }

  closeCurrentStatus() {
    this._currentStatus.set(AgentsService.CLOSE_STATUS);
  }
}
