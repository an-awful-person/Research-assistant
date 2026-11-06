import { Close } from "@mui/icons-material";
import { Dialog, DialogContent, DialogTitle, IconButton, Tooltip, useMediaQuery, useTheme } from "@mui/material";
import { useState, type ReactNode } from "react";
import { useReactive } from "../../services/reactive.service";
import type { META_LMMMessage } from "../model/llm.model";
import type { MediatorService } from "../services/mediator.service";
import { ChatMessagesComponent } from "./chatMessages.component";

/**
 * Shows the conversation of an agent, which keeps updating while the agent works.
 */
export function ConversationDialogComponent(props: {
  chatService: MediatorService;
  chatId: string | undefined;
  onClose: () => void;
}): ReactNode {
  const [activeChats, setActiveChats] = useState<Map<string, META_LMMMessage[]>>(
    props.chatService.activeChats.value,
  );

  useReactive(props.chatService.activeChats, setActiveChats);
  const fullScreen = useMediaQuery(useTheme().breakpoints.down("md"));

  return (
    <Dialog open={props.chatId !== undefined} onClose={props.onClose} maxWidth="lg" fullWidth fullScreen={fullScreen} scroll="paper">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {props.chatId}
        <Tooltip title="Close">
          <IconButton onClick={props.onClose} aria-label="Close conversation">
            <Close />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent dividers data-testid="conversation-dialog-content" sx={{ overflowWrap: "anywhere" }}>
        {props.chatId !== undefined ? (
          <ChatMessagesComponent
            messages={activeChats.get(props.chatId) ?? []}
            chatService={props.chatService}
            chatId={props.chatId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
