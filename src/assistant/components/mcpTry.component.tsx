import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useState, type ReactNode } from "react";
import type { McpToolAgent } from "../agents/tools/mcp/mcpTool.agent";
import type { McpResult } from "../model/extensions.model";
import type { McpService } from "../services/mcp.service";
import { flattenSchema, parseToolValues } from "../services/mcpSchema";

const MAX_SHOWN = 4000;

function resultStatus(result: McpResult): { severity: "success" | "warning" | "error"; text: string } {
  if (result.needsKey) return { severity: "warning", text: "This server needs a key, or refused the one it has." };
  return result.isError ? { severity: "error", text: "The tool reported an error." } : { severity: "success", text: "It worked." };
}

/** Runs one tool by hand, to check that a server really works. Nothing goes to the model. */
export function McpTryDialog(props: { agent: McpToolAgent; service: McpService; onClose: () => void }): ReactNode {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const { tool, server } = props.agent;
  const schema = flattenSchema(tool.inputSchema);
  // All of this is only what is on screen.
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<McpResult | undefined>(undefined);

  const run = async () => {
    const parsed = parseToolValues(schema, raw);
    if ("problem" in parsed) {
      setProblem(parsed.problem);
      return;
    }
    setProblem(undefined);
    setResult(undefined);
    setRunning(true);
    setResult(await props.service.tryTool(server, tool.name, parsed.values));
    setRunning(false);
  };

  const status = result === undefined ? undefined : resultStatus(result);

  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm" fullScreen={isPhone} data-testid="mcp-try-dialog">
      <DialogTitle sx={{ overflowWrap: "anywhere" }}>Try {tool.name}</DialogTitle>
      <DialogContent>
        <Typography variant="caption" component="p" sx={{ marginBottom: "1em", overflowWrap: "anywhere" }}>
          From {server.name}. The result is only shown here: it doesn't go to the model.
        </Typography>
        {!tool.readOnly ? (
          <Alert severity="warning" sx={{ marginBottom: "1em" }} data-testid="mcp-try-warning">
            This tool can change things, and running it here really does so.
          </Alert>
        ) : null}
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75em", paddingTop: "0.25em" }}>
          {Object.entries(schema.properties).map(([name, property]) => {
            const isRequired = schema.required.includes(name);
            const isJson = property.type === "array" || property.type === "object";
            const label = `${name}${isRequired ? " (required)" : ""}`;
            const helper = `${property.description ?? ""}${isJson ? `${property.description ? " " : ""}Write this as JSON.` : ""}`;
            return property.type === "boolean" ? (
              <TextField key={name} select size="small" label={label} helperText={helper} value={raw[name] ?? ""} onChange={(event) => setRaw({ ...raw, [name]: event.target.value })} slotProps={{ htmlInput: { "data-testid": `mcp-try-field-${name}` } }}>
                <MenuItem value="">Not set</MenuItem>
                <MenuItem value="true">true</MenuItem>
                <MenuItem value="false">false</MenuItem>
              </TextField>
            ) : (
              <TextField
                key={name}
                size="small"
                label={label}
                helperText={helper}
                multiline={isJson}
                value={raw[name] ?? ""}
                onChange={(event) => setRaw({ ...raw, [name]: event.target.value })}
                slotProps={{ htmlInput: { "data-testid": `mcp-try-field-${name}`, ...(property.type === "integer" || property.type === "number" ? { inputMode: "decimal" } : {}) } }}
              />
            );
          })}
        </Box>
        {problem !== undefined ? <Alert severity="error" sx={{ marginTop: "1em" }} data-testid="mcp-try-problem">{problem}</Alert> : null}
        {status !== undefined && result !== undefined ? (
          <Box sx={{ marginTop: "1em" }} data-testid="mcp-try-result">
            <Alert severity={status.severity}>{status.text}</Alert>
            <Box component="pre" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "40vh", overflowY: "auto", fontSize: "0.8rem" }} data-testid="mcp-try-text">
              {result.text.length > MAX_SHOWN ? `${result.text.slice(0, MAX_SHOWN)}\n[Cut off here.]` : result.text}
            </Box>
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ padding: "0.5em 1.5em 1.25em 1.5em" }}>
        <Button onClick={props.onClose} sx={{ minHeight: 44 }}>Close</Button>
        <Button variant="contained" color={tool.readOnly ? "primary" : "warning"} disabled={running} onClick={() => void run()} startIcon={running ? <CircularProgress size={16} color="inherit" /> : undefined} sx={{ minHeight: 44 }} data-testid="mcp-try-run">
          {tool.readOnly ? "Run" : "Run for real"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
