import { Box, Chip, CircularProgress, type SxProps,type Theme } from "@mui/material";
import { type ReactNode, useState } from "react";
import { AgentsService } from "../services/agents.service";
import { AssistantService } from "../services/assistant.service";
import { useReactive } from "../../services/reactive.service";

export function ChatStatusComponent(props: {
  assistantService: AssistantService;
  sx?:SxProps<Theme>
}): ReactNode {
  const agentsService: AgentsService =
    props.assistantService.mediatorService.agentsService;

  const [currentAgentStatus, setCurrentAgentStatus] = useState<
    string | undefined
  >(agentsService.currentStatus.value);

  useReactive(agentsService.currentStatus, setCurrentAgentStatus);

  return (
    <Box sx={{...{ textAlign: "center" }, ...props.sx}}>
      {currentAgentStatus !== AgentsService.CLOSE_STATUS ? (
        <Chip
          label={
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <CircularProgress size={"1em"} sx={{ marginRight: "1em" }} />
              {currentAgentStatus}...
            </Box>
          }
          sx={{ margin: "auto", height: "2em", bgcolor:'background.paper', boxShadow:'0px 5px 10px rgba(0,0,0,0.3)' }}
        />
      ) : null}
    </Box>
  );
}
