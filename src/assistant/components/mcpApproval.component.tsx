import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Typography } from "@mui/material";
import { useState, type ReactNode } from "react";
import { useReactive } from "../../services/reactive.service";
import type { McpApproval, McpKeyProblem } from "../model/extensions.model";
import type { AssistantService } from "../services/assistant.service";

/**
 * Sits above the question box: the MCP call that is waiting for your answer, and the tools that are auto-confirmed.
 */
export function McpApprovalComponent(props: { assistantService: AssistantService }): ReactNode {
  const service = props.assistantService.mcpService;
  const agents = props.assistantService.mediatorService.agentsService.agents;
  const [approval, setApproval] = useState<McpApproval | undefined>(service.approval.value);
  const [autoConfirmed, setAutoConfirmed] = useState<string[]>(service.autoConfirmed.value);
  useReactive(service.approval, setApproval);
  useReactive(service.autoConfirmed, setAutoConfirmed);
  const [keyProblem, setKeyProblem] = useState<McpKeyProblem | undefined>(service.keyProblem.value);
  useReactive(service.keyProblem, setKeyProblem);
  // The checkbox of this request: only what is on screen.
  const [autoConfirm, setAutoConfirm] = useState<boolean>(false);

  const answer = (allowed: boolean) => {
    service.answer(allowed, allowed && autoConfirm);
    setAutoConfirm(false);
  };

  return (
    <>
      {keyProblem !== undefined ? (
        <Alert severity="warning" onClose={() => service.dismissKeyProblem()} sx={{ marginBottom: "0.5em", textAlign: "left", overflowWrap: "anywhere", "& .MuiAlert-message": { minWidth: 0 } }} data-testid="mcp-key-problem">
          <Typography variant="subtitle2">{keyProblem.serverName} needs a key</Typography>
          <Typography variant="body2">{keyProblem.message}</Typography>
          <Typography variant="body2" sx={{ marginTop: "0.25em" }}>
            {keyProblem.origin === "personal" ? "Add a key in the MCP servers tab." : "The computer's owner needs to set its key in config/mcp.json."}
          </Typography>
        </Alert>
      ) : null}
      {autoConfirmed.length > 0 ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "0.5em", padding: "0.25em 0" }} data-testid="mcp-auto-confirmed">
          {autoConfirmed.map((id) => (
            <Chip
              key={id}
              size="small"
              color="warning"
              variant="outlined"
              label={`Auto-confirm: ${agents.value.find((agent) => agent.id === id)?.name ?? id}`}
              onDelete={() => service.stopAutoConfirm(id)}
              sx={{ maxWidth: "100%" }}
            />
          ))}
        </Box>
      ) : null}
      {approval !== undefined ? (
        <Alert severity="warning" icon={false} role="alertdialog" aria-label="Allow this tool to run?" sx={{ marginBottom: "0.5em", textAlign: "left", "& .MuiAlert-message": { width: "100%", minWidth: 0 } }} data-testid="mcp-approval">
          <Typography variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>
            Allow {approval.label} to run? It can change things outside the assistant.
          </Typography>
          <Box component="pre" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "30vh", overflowY: "auto", fontSize: "0.8rem", margin: "0.5em 0" }} data-testid="mcp-approval-values">
            {JSON.stringify(approval.values, null, 2)}
          </Box>
          <FormControlLabel
            control={<Checkbox checked={autoConfirm} onChange={(event) => setAutoConfirm(event.target.checked)} data-testid="mcp-auto-confirm" />}
            label="Auto-confirm this tool in this conversation"
          />
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: "0.5em" }}>
            <Button color="inherit" onClick={() => answer(false)} sx={{ minHeight: 44 }} data-testid="mcp-deny">
              Deny
            </Button>
            <Button variant="contained" color="warning" onClick={() => answer(true)} sx={{ minHeight: 44 }} data-testid="mcp-allow">
              Allow
            </Button>
          </Box>
        </Alert>
      ) : null}
    </>
  );
}
