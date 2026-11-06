import { Menu, MenuOpen } from "@mui/icons-material";
import { Box, Card, IconButton, Tooltip } from "@mui/material";
import { type JSX, useState } from "react";
import { useReactive } from "../../services/reactive.service";
import { type META_LMMMessage } from "../model/llm.model";
import { AssistantService } from "../services/assistant.service";
import { MediatorService } from "../services/mediator.service";
import { ChatInputComponent } from "./chatInput.component";
import { ChatMessagesComponent } from "./chatMessages.component";
import { ChatStatusComponent } from "./chatStatus.component";

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
          ...(props.compact ? { bgcolor: "background.paper", boxShadow: 2, "&:hover": { bgcolor: "background.paper" } } : {}),
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
        <Box sx={{ position: "absolute", top: "0.5em", right: "0.5em", zIndex: 2 }}>{menuButton}</Box>
      ) : (
        <Box sx={{ display: "flex", justifyContent: "flex-end", padding: "0.25em 1em 0 1em" }}>{menuButton}</Box>
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

        <ChatStatusComponent assistantService={props.assistantService} />
      </Box>

      <Box sx={{ flexGrow: 0, padding: props.compact ? "0.5em" : "1em" }}>
        <ChatInputComponent chatService={props.assistantService.mediatorService} showHint={!props.compact} />
      </Box>
    </Card>
  );
}
