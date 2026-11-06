import { Chat, Delete } from "@mui/icons-material";
import { Box, Divider, IconButton, List, ListItem, ListItemText, Tooltip } from "@mui/material";
import { useState, type ReactNode } from "react";
import { useReactive } from "../../services/reactive.service";
import { MESSAGE_ROLES } from "../constants/llm.constants";
import type { META_LMMMessage } from "../model/llm.model";
import type { AssistantService } from "../services/assistant.service";
import { MediatorService } from "../services/mediator.service";
import { ConversationDialogComponent } from "./conversationDialog.component";

const MAX_SEARCH_LENGTH = 120;

function agentConversations(chats: Map<string, META_LMMMessage[]>): [string, META_LMMMessage[]][] {
  return Array.from(chats.entries()).filter(([name]) => name !== MediatorService.VISIBLE_CHAT_ID);
}

/**
 * Conversations of a call start with what was searched for, which shows what has been tried.
 */
function describeConversation(messages: META_LMMMessage[]): string {
  const count = `${messages.length} message${messages.length === 1 ? "" : "s"}`;
  if (messages[0]?.role !== MESSAGE_ROLES.USER) {
    return count;
  }
  const search = messages[0].content.replace(/\n+/g, " · ");
  return `${search.length > MAX_SEARCH_LENGTH ? `${search.slice(0, MAX_SEARCH_LENGTH).trim()}...` : search} · ${count}`;
}

export function ConversationsList(props: {
  assistantService: AssistantService;
}): ReactNode {
  const mediatorChatService = props.assistantService.mediatorService;

  const [conversations, setConversations] = useState<[string, META_LMMMessage[]][]>(
    agentConversations(mediatorChatService.activeChats.value),
  );
  const [openConversation, setOpenConversation] = useState<string | undefined>(undefined);

  useReactive(mediatorChatService.activeChats, (value) => {
    setConversations(agentConversations(value));
  });

  return (
    <Box>
      <List sx={{ overflowY: "auto" }}>
        {conversations.map(([name, messages], index) => {
          return (
            <Box key={name}>
              <ListItem
                sx={{ paddingRight: "6em" }}
                secondaryAction={
                  <Box sx={{ display: "flex", flexDirection: "row" }}>
                    <Tooltip title={"Open conversation"} placement="left">
                      <IconButton onClick={() => setOpenConversation(name)} aria-label={`Open conversation ${name}`}>
                        <Chat />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={"Delete conversation from memory"} placement="bottom">
                      <IconButton>
                        <Delete />
                      </IconButton>
                    </Tooltip>
                  </Box>
                }
              >
                <ListItemText
                  primary={name}
                  secondary={describeConversation(messages)}
                  sx={{ overflowWrap: "anywhere" }}
                />
              </ListItem>
              {index < conversations.length - 1 ? <Divider sx={{ margin: "0.5em" }} /> : null}
            </Box>
          );
        })}
      </List>
      <ConversationDialogComponent
        chatService={mediatorChatService}
        chatId={openConversation}
        onClose={() => setOpenConversation(undefined)}
      />
    </Box>
  );
}
