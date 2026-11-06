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

  const gap = props.compact ? "0.5em" : "1em";
  const menuLabel = props.menuOpen ? "Hide menu" : "Show menu";

  return (
    <Card
      sx={{
        flex: "1 1 auto",
        minWidth: 0,
        margin: gap,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "flex-end", padding: `0.25em ${gap} 0 ${gap}` }}>
        <Tooltip title={menuLabel}>
          <IconButton onClick={props.onToggleMenu} aria-label={menuLabel} aria-expanded={props.menuOpen} size="small">
            {props.menuOpen ? <MenuOpen sx={{ transform: "scaleX(-1)" }} /> : <Menu />}
          </IconButton>
        </Tooltip>
      </Box>

      <Box
        sx={{
          flex: "1 1 auto",
          overflowY: "auto",
          padding: gap,
          outline: (theme) => `1px solid ${theme.palette.divider}`,
          margin: `0.25em ${gap} 0 ${gap}`,
          borderRadius: "0.5em",
        }}
      >
        <ChatMessagesComponent
          messages={activeChats.get(MediatorService.VISIBLE_CHAT_ID) ?? []}
          chatService={props.assistantService.mediatorService}
          chatId={MediatorService.VISIBLE_CHAT_ID}
          disableEditting
        />

        <ChatStatusComponent assistantService={props.assistantService} />
      </Box>

      <Box sx={{ flexGrow: 0, padding: gap }}>
        <ChatInputComponent chatService={props.assistantService.mediatorService} showHint={!props.compact} />
      </Box>
    </Card>
  );
}
