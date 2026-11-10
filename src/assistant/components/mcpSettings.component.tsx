import { DeleteOutlined, Refresh } from "@mui/icons-material";
import { Alert, Box, Button, Chip, FormControlLabel, IconButton, Switch, TextField, Tooltip, Typography } from "@mui/material";
import { useState, type ReactNode } from "react";
import { McpTryDialog } from "./mcpTry.component";
import { useReactive } from "../../services/reactive.service";
import { McpToolAgent } from "../agents/tools/mcp/mcpTool.agent";
import type { McpKeyProblem, McpServer, PersonalMcpServer } from "../model/extensions.model";
import type { McpService } from "../services/mcp.service";
import type { AssistantService } from "../services/assistant.service";
import { McpSearchComponent } from "./mcpSearch.component";

function ToolSwitch(props: { agent: McpToolAgent; service: McpService }): ReactNode {
  const [enabled, setEnabled] = useState<boolean>(props.agent.enabled.value);
  useReactive(props.agent.enabled, setEnabled);
  const { tool } = props.agent;
  // If the dialog is open: only what is on screen.
  const [trying, setTrying] = useState<boolean>(false);
  return (
    <Box data-testid="mcp-tool" sx={{ marginBottom: "0.5em" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <FormControlLabel
        sx={{ overflowWrap: "anywhere", alignItems: "center", flex: "1 1 0", minWidth: 0, marginRight: 0 }}
        control={<Switch checked={enabled} disabled={!props.agent.canBeEnabled} onChange={() => props.agent.toggleEnabled()} slotProps={{ input: { "aria-label": `Use tool ${tool.name}` } }} />}
        label={
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.5em", flexWrap: "wrap" }}>
            {tool.name}
            <Tooltip title={tool.readOnly ? "The server says this only reads. That is its own claim, so only switch on tools from servers you trust." : "Asks you before every call."}>
              <Chip size="small" variant="outlined" color={tool.readOnly ? "default" : "warning"} label={tool.readOnly ? "Read-only" : "Can change things"} />
            </Tooltip>
          </Box>
        }
      />
      <Button size="small" onClick={() => setTrying(true)} sx={{ minHeight: 44, minWidth: 44, flexShrink: 0, textTransform: "none" }} aria-label={`Try tool ${tool.name}`} data-testid="mcp-try-button">
        Try
      </Button>
      </Box>
      {trying ? <McpTryDialog agent={props.agent} service={props.service} onClose={() => setTrying(false)} /> : null}
      {tool.description !== "" ? (
        <Typography variant="caption" component="p" sx={{ color: "text.secondary", marginLeft: "3.5em", overflowWrap: "anywhere" }}>
          {tool.description.length > 240 ? `${tool.description.slice(0, 240)}…` : tool.description}
        </Typography>
      ) : null}
    </Box>
  );
}

/** Sets or removes the key of someone's own server. The key itself is never shown again. */
function KeyForm(props: { server: PersonalMcpServer; service: McpService; onDone: () => void }): ReactNode {
  const [headerName, setHeaderName] = useState(props.server.headerName || "Authorization");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const hasKey = props.server.headerValue !== "";

  const save = async () => {
    setBusy(true);
    setProblem(undefined);
    const failure = await props.service.updatePersonalKey(props.server.id, headerName, value);
    setBusy(false);
    if (failure === undefined) props.onDone();
    else setProblem(failure);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75em", marginTop: "0.75em" }} data-testid="mcp-key-form">
      <Typography variant="caption">{hasKey ? "A key is set. Enter a new one to replace it, or leave this empty to remove it." : "No key is set. It's stored only in this browser."}</Typography>
      <TextField size="small" label="Header name" value={headerName} onChange={(event) => setHeaderName(event.target.value)} slotProps={{ htmlInput: { "data-testid": "mcp-key-header" } }} />
      <TextField size="small" label="Key" type="password" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} slotProps={{ htmlInput: { "data-testid": "mcp-key-value" } }} />
      {problem !== undefined ? <Alert severity="error" sx={{ overflowWrap: "anywhere" }} data-testid="mcp-key-form-problem">{problem}</Alert> : null}
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: "0.5em" }}>
        <Button onClick={props.onDone} sx={{ minHeight: 44, textTransform: "none" }}>Cancel</Button>
        <Button variant="outlined" disabled={busy} onClick={() => void save()} sx={{ minHeight: 44, textTransform: "none" }} data-testid="mcp-key-save">
          {busy ? "Checking…" : "Save"}
        </Button>
      </Box>
    </Box>
  );
}

function ServerCard(props: { server: McpServer; agents: McpToolAgent[]; onRemove?: () => void; personal?: PersonalMcpServer; service: McpService; keyProblem?: McpKeyProblem }): ReactNode {
  const { server } = props;
  // If the key form is open: only what is on screen.
  const [editingKey, setEditingKey] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [test, setTest] = useState<{ ok: boolean; ms: number; toolCount: number; problem?: string } | undefined>(undefined);

  const runTest = async () => {
    setTesting(true);
    setTest(undefined);
    setTest(await props.service.testServer(server));
    setTesting(false);
  };
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: "8px", padding: "0.75em", marginTop: "0.75em" }} data-testid="mcp-server">
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5em", flexWrap: "wrap" }}>
        <Typography variant="subtitle1" sx={{ flex: "1 1 auto", overflowWrap: "anywhere" }}>
          {server.name}
        </Typography>
        {server.origin === "owner" ? <Chip size="small" variant="outlined" label={server.shared ? "Shared on the network" : "This computer only"} /> : null}
        <Button size="small" disabled={testing} onClick={() => void runTest()} sx={{ minHeight: 44, textTransform: "none", marginLeft: "auto" }} data-testid="mcp-test-button" aria-label={`Test ${server.name}`}>
          {testing ? "Testing…" : "Test"}
        </Button>
        {props.personal !== undefined ? (
          <Button size="small" onClick={() => setEditingKey(!editingKey)} sx={{ minHeight: 44, textTransform: "none" }} data-testid="mcp-key-button" aria-label={`Key for ${server.name}`}>
            {props.personal.headerValue !== "" ? "Change key" : "Add key"}
          </Button>
        ) : null}
        {props.onRemove !== undefined ? (
          <Tooltip title="Remove server" placement="left">
            <IconButton aria-label={`Remove server ${server.name}`} onClick={props.onRemove} sx={{ width: 44, height: 44 }}>
              <DeleteOutlined />
            </IconButton>
          </Tooltip>
        ) : null}
      </Box>
      {test !== undefined ? (
        <Alert severity={test.ok ? "success" : "error"} onClose={() => setTest(undefined)} sx={{ marginTop: "0.5em", overflowWrap: "anywhere" }} data-testid="mcp-test-result">
          {test.ok ? `Working: ${test.ms} ms, ${test.toolCount} tool${test.toolCount === 1 ? "" : "s"}.` : `Not working: ${test.problem ?? "It could not be reached."}`}
          {test.ok ? (
            <Typography variant="caption" component="p">
              Some servers only check a key when a tool runs. Use Try on a tool to be sure.
            </Typography>
          ) : null}
        </Alert>
      ) : null}
      {server.problem !== undefined && !(test !== undefined && !test.ok) ? (
        <Alert severity="error" sx={{ marginTop: "0.5em", overflowWrap: "anywhere" }} data-testid="mcp-server-problem">
          {server.problem}
        </Alert>
      ) : null}
      {props.keyProblem?.serverId === server.id ? (
        <Alert severity="warning" sx={{ marginTop: "0.5em", overflowWrap: "anywhere" }} data-testid="mcp-server-key-problem">
          {props.keyProblem.message}
        </Alert>
      ) : null}
      {editingKey && props.personal !== undefined ? <KeyForm server={props.personal} service={props.service} onDone={() => setEditingKey(false)} /> : null}
      {server.ready && props.agents.length === 0 ? (
        <Typography variant="caption">This server offers no tools.</Typography>
      ) : null}
      <Box sx={{ marginTop: "0.5em" }}>
        {props.agents.map((agent) => (
          <ToolSwitch agent={agent} service={props.service} key={agent.id} />
        ))}
      </Box>
    </Box>
  );
}

/** The MCP servers: their tools, and adding your own. */
export function McpSettingsComponent(props: { assistantService: AssistantService }): ReactNode {
  const service = props.assistantService.mcpService;
  const agentsService = props.assistantService.mediatorService.agentsService;
  const [servers, setServers] = useState<McpServer[]>(service.servers.value);
  const [personal, setPersonal] = useState<PersonalMcpServer[]>(service.personal.value);
  const [configProblem, setConfigProblem] = useState<string | undefined>(service.configProblem.value);
  const [agents, setAgents] = useState<McpToolAgent[]>(agentsService.agents.value.filter((agent) => agent instanceof McpToolAgent));
  useReactive(service.servers, setServers);
  useReactive(service.personal, setPersonal);
  useReactive(service.configProblem, setConfigProblem);
  const [keyProblem, setKeyProblem] = useState<McpKeyProblem | undefined>(service.keyProblem.value);
  useReactive(service.keyProblem, setKeyProblem);
  useReactive(agentsService.agents, (value) => setAgents(value.filter((agent) => agent instanceof McpToolAgent)));

  // The form: only what is on screen until it's added.
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [headerName, setHeaderName] = useState("Authorization");
  const [headerValue, setHeaderValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  const add = async () => {
    setBusy(true);
    setProblem(undefined);
    const failure = await service.addPersonal({ name: name.trim(), url: url.trim(), headerName: headerName.trim(), headerValue: headerValue.trim() });
    setBusy(false);
    setProblem(failure);
    if (failure === undefined) {
      setName("");
      setUrl("");
      setHeaderValue("");
    }
  };

  const toolsOf = (server: McpServer) => agents.filter((agent) => agent.server.id === server.id);
  const owner = servers.filter((server) => server.origin === "owner");
  const own = servers.filter((server) => server.origin === "personal");

  return (
    <Box sx={{ textAlign: "left", padding: "1em" }} data-testid="mcp-tab">
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="body2" sx={{ flex: "1 1 auto" }}>
          MCP servers give the assistant extra tools. Every tool starts off. A tool that can change things asks you before each call.
        </Typography>
        <Tooltip title="Look for changes" placement="left">
          <IconButton aria-label="Refresh MCP servers" onClick={() => void service.refresh()} sx={{ width: 44, height: 44 }}>
            <Refresh />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ marginTop: "1em" }}>
        <McpSearchComponent service={service} personal={personal} />
      </Box>

      <Typography variant="overline" component="h3" sx={{ color: "text.secondary", display: "block", marginTop: "1em" }}>
        From the computer's owner
      </Typography>
      {configProblem !== undefined ? <Alert severity="error" sx={{ overflowWrap: "anywhere" }}>{configProblem}</Alert> : null}
      {owner.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }} data-testid="mcp-owner-empty">
          None available here. The owner lists servers in config/mcp.json, and marks the ones others may use as shared.
        </Typography>
      ) : (
        owner.map((server) => <ServerCard key={server.id} server={server} agents={toolsOf(server)} service={service} keyProblem={keyProblem} />)
      )}

      <Typography variant="overline" component="h3" sx={{ color: "text.secondary", display: "block", marginTop: "1.5em" }}>
        Your own servers
      </Typography>
      {own.map((server) => (
        <ServerCard
          key={server.id}
          server={server}
          agents={toolsOf(server)}
          service={service}
          keyProblem={keyProblem}
          personal={personal.find((known) => `personal:${known.id}` === server.id)}
          onRemove={() => void service.removePersonal(server.id.slice("personal:".length))}
        />
      ))}
      {personal.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Add a remote server with its https address. A key is stored only in this browser.
        </Typography>
      ) : null}
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75em", marginTop: "0.75em" }}>
        <TextField size="small" label="Name" value={name} onChange={(event) => setName(event.target.value)} slotProps={{ htmlInput: { "data-testid": "mcp-name", maxLength: 40 } }} />
        <TextField size="small" label="Address (https://…)" value={url} onChange={(event) => setUrl(event.target.value)} slotProps={{ htmlInput: { "data-testid": "mcp-url", inputMode: "url" } }} />
        <TextField size="small" label="Header name" value={headerName} onChange={(event) => setHeaderName(event.target.value)} slotProps={{ htmlInput: { "data-testid": "mcp-header-name" } }} />
        <TextField
          size="small"
          label="Key (optional)"
          type="password"
          autoComplete="off"
          helperText="Just the key is fine: Bearer is added for Authorization."
          value={headerValue}
          onChange={(event) => setHeaderValue(event.target.value)}
          slotProps={{ htmlInput: { "data-testid": "mcp-key" } }}
        />
        <Button variant="outlined" disabled={busy || name.trim() === "" || url.trim() === ""} onClick={() => void add()} sx={{ minHeight: 44, textTransform: "none" }} data-testid="mcp-add">
          {busy ? "Connecting…" : "Add server"}
        </Button>
        {problem !== undefined ? (
          <Alert severity="error" sx={{ overflowWrap: "anywhere" }} data-testid="mcp-add-problem">
            {problem}
          </Alert>
        ) : null}
      </Box>
    </Box>
  );
}
