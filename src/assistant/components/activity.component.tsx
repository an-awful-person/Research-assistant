import { Box, CircularProgress, LinearProgress, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";
import { useReactive } from "../../services/reactive.service";
import type { ProgressService } from "../../services/progress.service";
import { AgentsService } from "../services/agents.service";
import type { AssistantService } from "../services/assistant.service";

/**
 * One line above the input box that says what the assistant is doing. It always takes its height, so the
 * conversation doesn't jump when it appears.
 */
export function ActivityStatusComponent(props: { assistantService: AssistantService }): ReactNode {
  const agentsService = props.assistantService.mediatorService.agentsService;
  const [status, setStatus] = useState<string>(agentsService.currentStatus.value);
  useReactive(agentsService.currentStatus, setStatus);

  const busy = status !== AgentsService.CLOSE_STATUS;
  const text = busy ? `${status.charAt(0).toUpperCase()}${status.slice(1)}…` : "";

  return (
    <Box
      role="status"
      aria-live="polite"
      data-testid="activity-status"
      title={busy ? text : undefined}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "0.5em",
        minHeight: "1.75em",
        padding: "0 1.1em",
        color: "text.secondary",
        minWidth: 0,
      }}
    >
      {busy ? (
        <>
          <CircularProgress size={14} thickness={5} color="inherit" sx={{ flexShrink: 0 }} />
          <Typography variant="caption" noWrap sx={{ minWidth: 0 }}>
            {text}
          </Typography>
        </>
      ) : null}
    </Box>
  );
}

/**
 * A thin bar along the top edge of the input box while a source outside this computer is being asked.
 * The box around it needs position: relative and overflow: hidden.
 */
export function ExternalProgressComponent(props: { progressService: ProgressService }): ReactNode {
  const [count, setCount] = useState<number>(props.progressService.loadingCounter.value);
  useReactive(props.progressService.loadingCounter, setCount);

  if (count <= 0) {
    return null;
  }
  return (
    <LinearProgress
      aria-label="Waiting for an outside source"
      data-testid="external-progress"
      sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 3 }}
    />
  );
}
