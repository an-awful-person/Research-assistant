import { ArrowUpward } from "@mui/icons-material";
import { Box, IconButton, InputBase, Paper, Tooltip, Typography } from "@mui/material";
import { type JSX, type KeyboardEvent, useState } from "react";
import { useReactive } from "../../services/reactive.service";
import { AgentsService } from "../services/agents.service";
import { MediatorService } from "../services/mediator.service";

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
          maxRows={8}
          fullWidth
          inputProps={{ "aria-label": "Your question" }}
          sx={{ alignSelf: "center", paddingY: "0.35em", lineHeight: 1.5 }}
        />
        <Tooltip title={busy ? "Wait until the current answer is done" : "Send"}>
          {/* The span keeps the tooltip working while the button is disabled. */}
          <span>
            <IconButton
              aria-label="Send"
              onClick={send}
              disabled={!canSend}
              sx={{
                bgcolor: "primary.main",
                color: "primary.contrastText",
                "&:hover": { bgcolor: "primary.dark" },
                "&.Mui-disabled": { bgcolor: "action.disabledBackground", color: "action.disabled" },
              }}
              size="small"
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
