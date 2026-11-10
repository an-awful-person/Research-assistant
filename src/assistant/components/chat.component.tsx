import { AddComment, Menu, MenuOpen } from "@mui/icons-material";
import { Box, Card, IconButton, Tooltip } from "@mui/material";
import { type JSX, useState } from "react";
import { useReactive } from "../../services/reactive.service";
import { type META_LMMMessage } from "../model/llm.model";
import { AssistantService } from "../services/assistant.service";
import { AgentsService } from "../services/agents.service";
import { MediatorService } from "../services/mediator.service";
import { ChatInputComponent } from "./chatInput.component";
import { ChatMessagesComponent } from "./chatMessages.component";
import { ActivityStatusComponent } from "./activity.component";
import { McpApprovalComponent } from "./mcpApproval.component";

export function ChatComponent(props: {
  assistantService: AssistantService;
  menuOpen: boolean;
  onToggleMenu: () => void;
  /** Smaller margins, for phones and narrow windows. */
  compact: boolean;
}): JSX.Element {
  const chatService = props.assistantService.mediatorService;

  const [activeChats, setActiveChats] = useState<Map<string, META_LMMMessage[]>>(
    chatService.activeChats.value,
  );
  useReactive(chatService.activeChats, setActiveChats);
  const [status, setStatus] = useState<string>(chatService.agentsService.currentStatus.value);
  useReactive(chatService.agentsService.currentStatus, setStatus);
  // The map is the same object after a change, so the number of messages is what tells React it changed.
  const [visibleCount, setVisibleCount] = useState<number>(activeChats.get(MediatorService.VISIBLE_CHAT_ID)?.length ?? 0);
  useReactive(chatService.activeChats, (chats) => setVisibleCount(chats.get(MediatorService.VISIBLE_CHAT_ID)?.length ?? 0));

  const busy = status !== AgentsService.CLOSE_STATUS;
  const floating = props.compact ? { bgcolor: "background.paper", boxShadow: 2, "&:hover": { bgcolor: "background.paper" } } : {};
  const newButton = (
    <Tooltip title={busy ? "Wait until the current answer is done" : "New conversation"}>
      <span>
        <IconButton
          onClick={() => props.assistantService.conversationsService.newConversation()}
          aria-label="New conversation"
          disabled={busy || visibleCount === 0}
          sx={{ width: 44, height: 44, ...floating, "&.Mui-disabled": { ...(props.compact ? { bgcolor: "background.paper" } : {}) } }}
          data-testid="chat-new"
        >
          <AddComment />
        </IconButton>
      </span>
    </Tooltip>
  );

  const menuLabel = props.menuOpen ? "Hide menu" : "Show menu";
  const menuButton = (
    <Tooltip title={menuLabel}>
      <IconButton
        onClick={props.onToggleMenu}
        aria-label={menuLabel}
        aria-expanded={props.menuOpen}
        sx={{
          width: 44,
          height: 44,
          // On phones it floats over the messages, so it needs its own background.
          ...floating,
        }}
      >
        {props.menuOpen ? <MenuOpen sx={{ transform: "scaleX(-1)" }} /> : <Menu />}
      </IconButton>
    </Tooltip>
  );

  return (
    <Card
      sx={{
        flex: "1 1 auto",
        minWidth: 0,
        // Phones keep every bit of space for the conversation.
        margin: props.compact ? "0.25em" : "1em",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {props.compact ? (
        <Box sx={{ position: "absolute", top: "0.5em", right: "0.5em", zIndex: 2, display: "flex", gap: "0.5em" }}>
          {visibleCount > 0 ? newButton : null}
          {menuButton}
        </Box>
      ) : (
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: "0.25em", padding: "0.25em 1em 0 1em" }}>
          {newButton}
          {menuButton}
        </Box>
      )}

      <Box
        sx={
          props.compact
            ? { flex: "1 1 auto", overflowY: "auto", padding: "0.5em 0.75em" }
            : {
                flex: "1 1 auto",
                overflowY: "auto",
                padding: "1em",
                outline: (theme) => `1px solid ${theme.palette.divider}`,
                margin: "0.25em 1em 0 1em",
                borderRadius: "0.5em",
              }
        }
      >
        <ChatMessagesComponent
          messages={activeChats.get(MediatorService.VISIBLE_CHAT_ID) ?? []}
          chatService={props.assistantService.mediatorService}
          chatId={MediatorService.VISIBLE_CHAT_ID}
          disableEditting
        />
      </Box>

      <Box sx={{ flexGrow: 0, padding: props.compact ? "0 0.5em 0.5em 0.5em" : "0.25em 1em 1em 1em" }}>
        <McpApprovalComponent assistantService={props.assistantService} />
        <ActivityStatusComponent assistantService={props.assistantService} />
        <ChatInputComponent chatService={props.assistantService.mediatorService} showHint={!props.compact} />
      </Box>
    </Card>
  );
}
