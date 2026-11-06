import type { LLMMessage, META_LMMMessage } from "../model/llm.model";
import type { ReferenceModel } from "../model/reference.model";

/** One conversation as it is kept in the browser: what the user saw, and its sources. */
export type SavedConversation = {
  id: string;
  title: string;
  created: string;
  updated: string;
  messages: META_LMMMessage[];
  references: ReferenceModel[];
};

export type ConversationStore = {
  version: 1;
  activeId?: string;
  conversations: SavedConversation[];
};

/** What the list of conversations shows. */
export type ConversationSummary = {
  id: string;
  title: string;
  updated: string;
  questions: number;
};

const TITLE_LENGTH = 80;

/** The first question, on one line and at most 80 characters. */
export function titleOf(messages: META_LMMMessage[]): string {
  const first = messages.find((message) => message.role === "user")?.content ?? "";
  const line = first.replace(/\s+/g, " ").trim();
  if (line.length <= TITLE_LENGTH) return line || "New conversation";
  const cut = line.slice(0, TITLE_LENGTH);
  const space = cut.lastIndexOf(" ");
  return `${(space > TITLE_LENGTH / 2 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

export function questionCount(messages: META_LMMMessage[]): number {
  return messages.filter((message) => message.role === "user").length;
}

/** Keeps only what the chat shows, so stored conversations stay small. */
export function storedMessage(message: META_LMMMessage): META_LMMMessage {
  const kept: META_LMMMessage = { role: message.role, content: message.content };
  if (message.type !== undefined) kept.type = message.type;
  if (message.citations !== undefined) kept.citations = message.citations;
  if (message.unverified !== undefined) kept.unverified = message.unverified;
  if (message.sourceWarnings !== undefined) kept.sourceWarnings = message.sourceWarnings;
  return kept;
}

export function summaryOf(conversation: SavedConversation): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    updated: conversation.updated,
    questions: questionCount(conversation.messages),
  };
}

function isMessage(value: unknown): value is META_LMMMessage {
  const message = value as META_LMMMessage;
  return typeof message === "object" && message !== null && typeof message.role === "string" && typeof message.content === "string";
}

function isConversation(value: unknown): value is SavedConversation {
  const conversation = value as SavedConversation;
  return (
    typeof conversation === "object" &&
    conversation !== null &&
    typeof conversation.id === "string" &&
    typeof conversation.title === "string" &&
    typeof conversation.updated === "string" &&
    Array.isArray(conversation.messages) &&
    conversation.messages.every(isMessage) &&
    Array.isArray(conversation.references)
  );
}

/**
 * Reads what was stored. Conversations that are damaged are left out, and a store of another version is ignored.
 */
export function parseStore(value: unknown): ConversationStore {
  const store = value as ConversationStore | null;
  if (typeof store !== "object" || store === null || store.version !== 1 || !Array.isArray(store.conversations)) {
    return { version: 1, conversations: [] };
  }
  const conversations = store.conversations.filter(isConversation);
  const activeId = conversations.some((conversation) => conversation.id === store.activeId) ? store.activeId : undefined;
  return { version: 1, activeId: activeId, conversations: conversations };
}

/**
 * Makes a history for the mediator from the visible chat, after a reload: the system prompt, then each question,
 * and each answer as the respond call that gave it. The model then knows what was asked and answered before.
 * @param systemMessage The mediator's system prompt
 */
export function rebuildMediatorChat(visible: META_LMMMessage[], systemMessage: LLMMessage): META_LMMMessage[] {
  const chat: META_LMMMessage[] = [{ ...systemMessage }];
  visible.forEach((message) => {
    if (message.role === "user") {
      chat.push({ role: "user", content: message.content });
    } else if (message.role === "assistant") {
      const answer = message.content.replace(/\[\[(\d+)\]\]\(#source-\d+\)/g, "[$1]");
      chat.push({
        role: "assistant",
        type: "json",
        content: JSON.stringify(
          {
            answer_certainty: 1,
            explain_certainty: "This answer was given earlier in the conversation.",
            plan: "",
            information_needed: [],
            function: `respond(answer=${JSON.stringify(answer)})`,
          },
          null,
          2,
        ),
      });
    }
  });
  return chat;
}
