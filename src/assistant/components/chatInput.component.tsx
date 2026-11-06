import { ArrowUpward } from "@mui/icons-material";
import { Box, IconButton, InputBase, Paper, Tooltip, Typography, useMediaQuery } from "@mui/material";
import { type JSX, type KeyboardEvent, useState } from "react";
import { useReactive } from "../../services/reactive.service";
import { MESSAGE_ROLES } from "../constants/llm.constants";
import type { META_LMMMessage } from "../model/llm.model";
import { AgentsService } from "../services/agents.service";
import { MediatorService } from "../services/mediator.service";
import { ExportMenuComponent } from "./exportMenu.component";

function hasAnswers(chats: Map<string, META_LMMMessage[]>): boolean {
  return (chats.get(MediatorService.VISIBLE_CHAT_ID) ?? []).some((message) => message.role === MESSAGE_ROLES.ASSISTANT);
}

/**
 * The box to type a question in. Enter sends it and Shift+Enter starts a new line.
 */
export function ChatInputComponent(props: {
  chatService: MediatorService;
  /** Shows which keys send and add a line, which only makes sense with a keyboard. */
  showHint?: boolean;
}): JSX.Element {
  const agentsService = props.chatService.agentsService;

  const [chatInput, setChatInput] = useState<string>(props.chatService.currentTextInput.value);
  const [status, setStatus] = useState<string>(agentsService.currentStatus.value);
  useReactive(props.chatService.currentTextInput, setChatInput);
  useReactive(agentsService.currentStatus, setStatus);
  const [answered, setAnswered] = useState<boolean>(hasAnswers(props.chatService.activeChats.value));
  useReactive(props.chatService.activeChats, (chats) => setAnswered(hasAnswers(chats)));

  // Phones held sideways have little height, so the box grows less.
  const isShort = useMediaQuery("(max-height: 500px)");
  const busy = status !== AgentsService.CLOSE_STATUS;
  const canSend = !busy && (chatInput ?? "").trim() !== "";

  const send = () => {
    if (canSend) props.chatService.submitDecodingMessage();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Paper
        variant="outlined"
        sx={{
          display: "flex",
          alignItems: "flex-end",
          gap: "0.5em",
          padding: "0.5em 0.5em 0.5em 1.1em",
          borderRadius: "24px",
          bgcolor: "background.default",
          transition: (theme) => theme.transitions.create(["border-color", "box-shadow"]),
          "&:focus-within": {
            borderColor: "primary.main",
            boxShadow: (theme) => `0 0 0 1px ${theme.palette.primary.main}`,
          },
        }}
      >
        <InputBase
          value={chatInput ?? ""}
          onChange={(event) => props.chatService.currentTextInput.set(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask a research question…"
          multiline
          minRows={1}
          maxRows={isShort ? 4 : 8}
          fullWidth
          inputProps={{ "aria-label": "Your question" }}
          sx={{ alignSelf: "center", paddingY: "0.35em", lineHeight: 1.5 }}
        />
        <ExportMenuComponent service={props.chatService.assistantService.exportService} hasAnswers={answered} busy={busy} />
        <Tooltip title={busy ? "Wait until the current answer is done" : "Send"}>
          {/* The span keeps the tooltip working while the button is disabled. */}
          <span>
            <IconButton
              aria-label="Send"
              onClick={send}
              disabled={!canSend}
              sx={{
                width: 40,
                height: 40,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                "&:hover": { bgcolor: "primary.dark" },
                "&.Mui-disabled": { bgcolor: "action.disabledBackground", color: "action.disabled" },
              }}
            >
              <ArrowUpward fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Paper>
      {props.showHint ? (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ textAlign: "center", marginTop: "0.4em" }}>
          Enter to send, Shift+Enter for a new line
        </Typography>
      ) : null}
    </Box>
  );
}
