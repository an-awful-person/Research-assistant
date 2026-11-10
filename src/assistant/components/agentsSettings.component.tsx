import { ExpandMore } from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Typography
} from "@mui/material";
import { useState, type ReactNode } from "react";
import type { MediatorAccessableAgent } from "../../interfaces/agents.interface";
import { useReactive } from "../../services/reactive.service";
import {
  type AgentsService
} from "../services/agents.service";
import type { AssistantService } from "../services/assistant.service";

export function AgentsSettingsComponent(props: {
  assistantService: AssistantService;
}): ReactNode {
  const agentsService: AgentsService =
    props.assistantService.mediatorService.agentsService;

  const [agents, setAgents] = useState<MediatorAccessableAgent[]>(
    agentsService.agents.value ?? [],
  );

  useReactive(agentsService.agents, (agents) => {
    setAgents(agents)
  });

  return (
    <Box>
      {agents.filter((agent) => !agent.hiddenFromSettings).map((agent) => {
        return <AgentAccordionComponent agent={agent} key={agent.id} />;
      })}
    </Box>
  );
}

function AgentAccordionComponent(props: {
  agent: MediatorAccessableAgent;
}): ReactNode {
  const [enabled, setEnabled] = useState<boolean>(props.agent.enabled.value);

  useReactive(props.agent.enabled, setEnabled);

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5em",
            width: "100%",
            marginRight: "0.5em",
          }}
        >
          <Typography sx={{ textAlign: "left" }}>{props.agent.name}</Typography>
          <Chip
            label={enabled ? "Enabled" : "Disabled"}
            color={enabled ? "success" : "default"}
            variant="outlined"
            size="small"
            sx={{ flexShrink: 0 }}
            data-testid={`agent-status-${props.agent.id}`}
          />
        </Box>
      </AccordionSummary>
      <AccordionDetails>{props.agent.settings}</AccordionDetails>
    </Accordion>
  );
}
