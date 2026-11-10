import { Search } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Link,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useState, type FormEvent, type ReactNode } from "react";
import type { PersonalMcpServer, RegistryServer } from "../model/extensions.model";
import type { McpService } from "../services/mcp.service";
import { fillAddress, ownerEntry, shortName } from "../services/mcpRegistry";

function kindLabel(server: RegistryServer): string {
  if (server.kind === "local") return "Local program";
  if (server.kind === "unsupported") return "Can't be added";
  return server.remote?.header !== undefined ? "Remote, with key" : "Remote";
}

function Details(props: { server: RegistryServer }): ReactNode {
  const { server } = props;
  return (
    <Box sx={{ marginBottom: "1em", overflowWrap: "anywhere" }}>
      {server.description !== "" ? <Typography variant="body2" sx={{ marginBottom: "0.5em" }}>{server.description}</Typography> : null}
      <Typography variant="caption" component="p">
        {server.name}, version {server.version}
      </Typography>
      {server.websiteUrl !== undefined ? (
        <Typography variant="caption" component="p">
          Website: <Link href={server.websiteUrl} target="_blank" rel="noopener noreferrer">{server.websiteUrl}</Link>
        </Typography>
      ) : null}
      {server.repositoryUrl !== undefined ? (
        <Typography variant="caption" component="p">
          Code: <Link href={server.repositoryUrl} target="_blank" rel="noopener noreferrer">{server.repositoryUrl}</Link>
        </Typography>
      ) : null}
    </Box>
  );
}

/** What a server would get, and the key it needs, before it's added. */
function AddDialog(props: { server: RegistryServer; service: McpService; onClose: () => void; onAdded: () => void }): ReactNode {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const remote = props.server.remote;
  const variables = remote?.variables ?? [];
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(variables.map((variable) => [variable.name, variable.default])));
  const [key, setKey] = useState("");
  const [headerName, setHeaderName] = useState(remote?.header?.name ?? "Authorization");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  if (remote === undefined) {
    return null;
  }

  const address = fillAddress(remote.url, values);
  const needsKey = remote.header?.required === true && key.trim() === "";

  const add = async () => {
    if (address === undefined) return;
    setBusy(true);
    setProblem(undefined);
    const failure = await props.service.addPersonal({
      name: shortName(props.server),
      url: address,
      headerName: headerName.trim() || "Authorization",
      headerValue: key.trim(),
    });
    setBusy(false);
    if (failure === undefined) props.onAdded();
    else setProblem(failure);
  };

  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm" fullScreen={isPhone} data-testid="mcp-add-dialog">
      <DialogTitle sx={{ overflowWrap: "anywhere" }}>{shortName(props.server)}</DialogTitle>
      <DialogContent>
        <Details server={props.server} />
        <Alert severity="info" sx={{ marginBottom: "1em" }}>
          Anyone can publish to this registry, and being listed doesn't mean a server is safe. What its tools are given goes to this server. Its tools start off.
        </Alert>
        <Typography variant="body2" sx={{ overflowWrap: "anywhere", marginBottom: "1em" }} data-testid="mcp-add-address">
          Address: {address ?? remote.url}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75em" }}>
          {variables.map((variable) => (
            <TextField
              key={variable.name}
              size="small"
              label={variable.name}
              helperText={variable.description}
              value={values[variable.name] ?? ""}
              onChange={(event) => setValues({ ...values, [variable.name]: event.target.value })}
              slotProps={{ htmlInput: { "data-testid": `mcp-variable-${variable.name}` } }}
            />
          ))}
          {remote.header !== undefined ? (
            <TextField
              size="small"
              type="password"
              autoComplete="off"
              label={`${remote.header.name}${remote.header.required ? "" : " (optional)"}`}
              helperText={remote.header.description || undefined}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              slotProps={{ htmlInput: { "data-testid": "mcp-add-key" } }}
            />
          ) : (
            <>
              <TextField
                size="small"
                type="password"
                autoComplete="off"
                label="Key (optional)"
                helperText="Some servers need one even if the registry doesn't say. You can also add it later."
                value={key}
                onChange={(event) => setKey(event.target.value)}
                slotProps={{ htmlInput: { "data-testid": "mcp-add-key" } }}
              />
              {key.trim() !== "" ? (
                <TextField size="small" label="Header name" value={headerName} onChange={(event) => setHeaderName(event.target.value)} slotProps={{ htmlInput: { "data-testid": "mcp-add-header" } }} />
              ) : null}
            </>
          )}
        </Box>
        {problem !== undefined ? (
          <Alert severity="error" sx={{ marginTop: "1em", overflowWrap: "anywhere" }} data-testid="mcp-add-dialog-problem">
            {problem}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ padding: "0.5em 1.5em 1.25em 1.5em" }}>
        <Button onClick={props.onClose} sx={{ minHeight: 44 }}>Cancel</Button>
        <Button variant="contained" disabled={busy || address === undefined || needsKey} onClick={() => void add()} sx={{ minHeight: 44 }} data-testid="mcp-add-confirm">
          {busy ? "Connecting…" : "Add server"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** A browser can't start a program, so this gives the computer's owner what to paste. */
function LocalDialog(props: { server: RegistryServer; onClose: () => void }): ReactNode {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const entry = ownerEntry(props.server);
  const [copied, setCopied] = useState(false);
  // The clipboard only exists on https and localhost pages, and others open this over plain http.
  const canCopy = typeof navigator.clipboard?.writeText === "function";

  const copy = () => {
    if (entry !== undefined) void navigator.clipboard.writeText(entry.text).then(() => setCopied(true));
  };

  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm" fullScreen={isPhone} data-testid="mcp-local-dialog">
      <DialogTitle sx={{ overflowWrap: "anywhere" }}>{shortName(props.server)}</DialogTitle>
      <DialogContent>
        <Details server={props.server} />
        <Alert severity="warning" sx={{ marginBottom: "1em" }}>
          This is a program that runs on the computer, so it can't be added from a browser. Anyone can publish to this registry: only install what you trust.
        </Alert>
        {entry !== undefined ? (
          <>
            <Typography variant="body2">
              The computer's owner can add this inside <code>mcpServers</code> in <code>config/mcp.json</code>, and restart the assistant:
            </Typography>
            <Box component="pre" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "0.8rem", userSelect: "all" }} data-testid="mcp-owner-entry">
              {entry.text}
            </Box>
            {entry.notes.map((note) => (
              <Typography key={note} variant="caption" component="p">{note}</Typography>
            ))}
          </>
        ) : (
          <Typography variant="body2" data-testid="mcp-no-entry">
            There is no ready entry for this one, so follow its own documentation.
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ padding: "0.5em 1.5em 1.25em 1.5em" }}>
        {entry !== undefined && canCopy ? <Button onClick={copy} sx={{ minHeight: 44 }}>{copied ? "Copied" : "Copy"}</Button> : null}
        <Button onClick={props.onClose} sx={{ minHeight: 44 }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Finds servers in the official MCP registry. Nothing is asked until the user searches. */
export function McpSearchComponent(props: { service: McpService; personal: PersonalMcpServer[] }): ReactNode {
  // All of this is only what is on screen.
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<RegistryServer[] | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState<RegistryServer | undefined>(undefined);
  const [added, setAdded] = useState<string | undefined>(undefined);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim() === "" || searching) return;
    setSearching(true);
    setProblem(undefined);
    try {
      setResults(await props.service.searchRegistry(query));
    } catch (error) {
      setResults(undefined);
      setProblem(error instanceof Error ? error.message : "The search failed.");
    } finally {
      setSearching(false);
    }
  };

  const isAdded = (server: RegistryServer) => server.remote !== undefined && props.personal.some((known) => known.url === server.remote?.url);

  return (
    <Box data-testid="mcp-search">
      <form onSubmit={(event) => void search(event)}>
        <TextField
          fullWidth
          size="small"
          label="Search for MCP servers"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          slotProps={{
            htmlInput: { "data-testid": "mcp-search-input", enterKeyHint: "search", maxLength: 200 },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton type="submit" aria-label="Search for MCP servers" edge="end" disabled={searching || query.trim() === ""} sx={{ width: 44, height: 44 }}>
                    {searching ? <CircularProgress size={20} /> : <Search />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
      </form>
      <Typography variant="caption" component="p" sx={{ color: "text.secondary", marginTop: "0.25em" }}>
        Searches the official MCP registry, which gets one word of your search.
      </Typography>
      {problem !== undefined ? <Alert severity="error" sx={{ marginTop: "0.5em" }} data-testid="mcp-search-problem">{problem}</Alert> : null}
      {added !== undefined ? (
        <Alert severity="success" onClose={() => setAdded(undefined)} sx={{ marginTop: "0.5em", overflowWrap: "anywhere" }} data-testid="mcp-added-note">
          {added} is added. Switch on the tools you want under Your own servers.
        </Alert>
      ) : null}
      {results !== undefined && results.length === 0 ? (
        <Typography variant="body2" sx={{ marginTop: "0.75em", color: "text.secondary" }} data-testid="mcp-search-empty">
          Nothing found. The registry only looks in names, so try one word from a name, like "arxiv" or "wiki".
        </Typography>
      ) : null}
      {results !== undefined && results.length > 0 ? (
        <List disablePadding sx={{ marginTop: "0.5em", maxHeight: "50vh", overflowY: "auto", border: 1, borderColor: "divider", borderRadius: "8px" }} data-testid="mcp-results">
          {results.map((server) => {
            const added = isAdded(server);
            return (
              <ListItemButton
                key={server.name}
                disabled={added || server.kind === "unsupported"}
                onClick={() => setOpen(server)}
                sx={{ minHeight: 44 }}
                data-testid="mcp-result"
              >
                <ListItemText
                  sx={{ overflowWrap: "anywhere" }}
                  primary={shortName(server)}
                  secondary={
                    <Box component="span" sx={{ display: "flex", flexDirection: "column", gap: "0.25em" }}>
                      {server.description !== "" ? <span>{server.description.length > 200 ? `${server.description.slice(0, 200)}…` : server.description}</span> : null}
                      <span>{server.publisher}{added ? " · Added" : ""}</span>
                      <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: "0.5em", flexWrap: "wrap" }}>
                        <Chip size="small" variant="outlined" color={server.kind === "remote" ? "primary" : "default"} label={kindLabel(server)} />
                        {server.reason !== undefined ? <span>{server.reason}</span> : null}
                      </Box>
                    </Box>
                  }
                  slotProps={{ secondary: { component: "div" } }}
                />
              </ListItemButton>
            );
          })}
        </List>
      ) : null}
      {open?.kind === "remote" ? <AddDialog
          key={open.name}
          server={open}
          service={props.service}
          onClose={() => setOpen(undefined)}
          onAdded={() => {
            setAdded(shortName(open));
            setOpen(undefined);
          }}
        /> : null}
      {open?.kind === "local" ? <LocalDialog key={open.name} server={open} onClose={() => setOpen(undefined)} /> : null}
    </Box>
  );
}
