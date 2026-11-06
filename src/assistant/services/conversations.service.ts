import { Subscription } from "rxjs";
import { POPUP_TYPE } from "../../constants/popup.constants";
import { type Service } from "../../interfaces/service.interface";
import { Reactive } from "../../services/reactive.service";
import { REACT_PROMPT_SYSTEM_MESSAGE } from "../model/decoding.model";
import type { META_LMMMessage } from "../model/llm.model";
import type { ReferenceModel } from "../model/reference.model";
import { AgentsService } from "./agents.service";
import type { AssistantService } from "./assistant.service";
import {
  parseStore,
  rebuildMediatorChat,
  storedMessage,
  summaryOf,
  titleOf,
  type ConversationSummary,
  type SavedConversation,
} from "./conversationStore";
import { MediatorService } from "./mediator.service";

/**
 * Keeps several conversations: the one on screen, and the others to switch to. What the user saw and its sources
 * are kept in the browser until the user deletes them. What the agents did is only kept for this session, because
 * it is too much to store.
 */
export class ConversationsService implements Service {
  public static readonly STORAGE_KEY = "conversations";

  private _assistantService: AssistantService;
  private _subscriptions: Subscription[] = [];

  /** The stored conversations, newest change first. */
  private _saved: SavedConversation[] = [];
  /** Everything of a conversation that is in memory this session, including what the agents did. */
  private _sessionChats: Map<string, Map<string, META_LMMMessage[]>> = new Map();
  /** What was last stored of each conversation, so switching doesn't count as a change. */
  private _signatures: Map<string, string> = new Map();
  private _warnedFull = false;
  /** Set while another conversation is put on screen, which changes the chat but isn't a change to store. */
  private _switching = false;

  private _conversations: Reactive<ConversationSummary[]> = new Reactive<ConversationSummary[]>([]);
  /** The conversation on screen, or undefined for a new one without questions yet. */
  private _activeId: Reactive<string | undefined> = new Reactive<string | undefined>(undefined);
  /** If the conversation on screen was loaded after a reload, so what the agents did isn't there any more. */
  private _restored: Reactive<boolean> = new Reactive<boolean>(false);

  constructor(assistantService: AssistantService) {
    this._assistantService = assistantService;
  }

  /**
   * crypto.randomUUID only exists on https and localhost pages, and others on the network open this over plain http.
   */
  private static newId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  init(): void {
    this.load();
    const mediator = this._assistantService.mediatorService;
    this._subscriptions.push(mediator.activeChats.listener().subscribe(() => this.persistActive()));
    this._subscriptions.push(this._assistantService.references.listener().subscribe(() => this.persistActive()));
  }

  exit(): void {
    this._subscriptions.forEach((subscription) => subscription.unsubscribe());
    this._subscriptions = [];
  }

  get conversations(): Reactive<ConversationSummary[]> {
    return this._conversations;
  }

  get activeId(): Reactive<string | undefined> {
    return this._activeId;
  }

  get restored(): Reactive<boolean> {
    return this._restored;
  }

  /** While the assistant answers, the conversation can't change, or the answer would end up in another one. */
  get isBusy(): boolean {
    return this._assistantService.mediatorService.agentsService.currentStatus.value !== AgentsService.CLOSE_STATUS;
  }

  private get visibleChat(): META_LMMMessage[] {
    return this._assistantService.mediatorService.activeChats.get(MediatorService.VISIBLE_CHAT_ID) ?? [];
  }

  /** Starts an empty conversation. It is only stored once it has a question. */
  newConversation(): void {
    if (this.isBusy || (this._activeId.value === undefined && this.visibleChat.length === 0)) {
      return;
    }
    this.keepInSession();
    this.openEmpty();
    this.write();
  }

  switchTo(id: string): void {
    if (this.isBusy || id === this._activeId.value) {
      return;
    }
    const conversation = this._saved.find((saved) => saved.id === id);
    if (conversation === undefined) {
      return;
    }
    this.keepInSession();
    this.open(conversation);
    this.write();
  }

  /** Deletes a conversation and its sources, from the browser and from memory. */
  delete(id: string): void {
    const isActive = id === this._activeId.value;
    if (isActive && this.isBusy) {
      return;
    }
    this._saved = this._saved.filter((saved) => saved.id !== id);
    this._sessionChats.delete(id);
    this._signatures.delete(id);
    if (isActive) {
      const next = this._saved[0];
      if (next !== undefined) {
        this.open(next);
      } else {
        this.openEmpty();
      }
    }
    this.write();
  }

  /** Deletes every conversation and its sources. */
  deleteAll(): void {
    if (this.isBusy) {
      return;
    }
    this._saved = [];
    this._sessionChats.clear();
    this._signatures.clear();
    this.openEmpty();
    this._assistantService.storageService.removeLocally(ConversationsService.STORAGE_KEY);
    this.publish();
  }

  /** Opens the conversation that was on screen before the reload. */
  private load(): void {
    const store = parseStore(this._assistantService.storageService.getLocally<unknown>(ConversationsService.STORAGE_KEY));
    this._saved = [...store.conversations].sort((a, b) => b.updated.localeCompare(a.updated));
    this._saved.forEach((saved) => this._signatures.set(saved.id, this.signatureOf(saved.messages, saved.references)));
    const active = this._saved.find((saved) => saved.id === store.activeId);
    if (active !== undefined) {
      this.open(active);
    }
    this.publish();
  }

  private open(conversation: SavedConversation): void {
    this._switching = true;
    const mediator = this._assistantService.mediatorService;
    const inMemory = this._sessionChats.get(conversation.id);
    if (inMemory !== undefined) {
      mediator.replaceChats(inMemory);
      this._restored.set(false);
    } else {
      const visible = conversation.messages.map((message) => ({ ...message }));
      mediator.replaceChats(
        new Map([
          [MediatorService.VISIBLE_CHAT_ID, visible],
          [MediatorService.MEDIATOR_AGENT_ID, rebuildMediatorChat(visible, REACT_PROMPT_SYSTEM_MESSAGE)],
        ]),
      );
      this._restored.set(true);
    }
    this.showReferences(conversation.references);
    this._activeId.set(conversation.id);
    this._switching = false;
  }

  private openEmpty(): void {
    this._switching = true;
    this._assistantService.mediatorService.clearChatData();
    this.showReferences([]);
    this._restored.set(false);
    this._activeId.set(undefined);
    this._switching = false;
  }

  /** Puts a conversation's sources in the Sources tab, and forgets the sources of an unfinished question. */
  private showReferences(references: ReferenceModel[]): void {
    this._assistantService.evidenceService.clear("");
    this._assistantService.references.set(new Map(references.map((reference) => [reference.id, reference])));
  }

  /** Keeps everything of the conversation on screen in memory, so switching back shows what the agents did. */
  private keepInSession(): void {
    const id = this._activeId.value;
    if (id !== undefined) {
      this._sessionChats.set(id, this._assistantService.mediatorService.activeChats.value);
    }
  }

  private signatureOf(messages: META_LMMMessage[], references: ReferenceModel[]): string {
    const last = messages[messages.length - 1];
    const sources = references.reduce((total, reference) => total + reference.retrieved.length + reference.usedIn.length, 0);
    return `${messages.length}|${last?.content.length ?? 0}|${references.length}|${sources}`;
  }

  /** Stores the conversation on screen when it changed. A new conversation is stored from its first question. */
  private persistActive(): void {
    const messages = this.visibleChat;
    if (this._switching || messages.length === 0) {
      return;
    }
    const references = Array.from(this._assistantService.references.value.values());
    const id = this._activeId.value;
    const signature = this.signatureOf(messages, references);
    if (id !== undefined && this._signatures.get(id) === signature) {
      return;
    }
    const now = new Date().toISOString();
    const existing = id === undefined ? undefined : this._saved.find((saved) => saved.id === id);
    const newId = id ?? ConversationsService.newId();
    let conversation: SavedConversation;
    if (existing === undefined) {
      conversation = { id: newId, title: "", created: now, updated: now, messages: [], references: [] };
      this._activeId.set(newId);
    } else {
      conversation = existing;
      this._saved = this._saved.filter((saved) => saved.id !== newId);
    }
    conversation = {
      ...conversation,
      title: titleOf(messages),
      updated: now,
      messages: messages.map(storedMessage),
      references: references,
    };
    this._saved.unshift(conversation);
    this._signatures.set(newId, signature);
    this.write();
  }

  private write(): void {
    const store = { version: 1, activeId: this._activeId.value, conversations: this._saved };
    try {
      this._assistantService.storageService.setLocally(ConversationsService.STORAGE_KEY, store);
      this._warnedFull = false;
    } catch (error) {
      console.error("conversations could not be stored", error);
      if (!this._warnedFull) {
        this._warnedFull = true;
        this._assistantService.popupService.throwPopup(
          "Your browser's storage is full, so this conversation can't be saved. Delete older conversations to make room.",
          POPUP_TYPE.ERROR,
          8000,
        );
      }
    }
    this.publish();
  }

  private publish(): void {
    this._conversations.set(this._saved.map(summaryOf));
  }
}
