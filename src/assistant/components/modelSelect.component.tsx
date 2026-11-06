import { Refresh } from "@mui/icons-material";
import {
  Alert,
  Box,
  FormControl,
  FormLabel,
  IconButton,
  Link,
  MenuItem,
  Select,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState, type ReactNode } from "react";
import { useReactive } from "../../services/reactive.service";
import { LLMApiService } from "../services/llmApi.service";
import type { InstalledModel, InstalledModelsStatus, ModelService } from "../services/model.service";

/** Chooses "Use general" in an agent's list. Model names can't be empty, so this can't clash with one. */
const USE_GENERAL = "";

function describe(model: InstalledModel): string {
  const gigabytes = model.size / 1e9;
  const size = gigabytes >= 1 ? `${gigabytes.toFixed(1)} GB` : `${Math.round(model.size / 1e6)} MB`;
  return `${model.name} · ${size}`;
}

/**
 * Reads the installed models and the state of the list, which every model choice needs.
 */
function useInstalledModels(service: ModelService): { installed: InstalledModel[]; status: InstalledModelsStatus } {
  const [installed, setInstalled] = useState<InstalledModel[]>(service.installed.value);
  const [status, setStatus] = useState<InstalledModelsStatus>(service.status.value);
  useReactive(service.installed, setInstalled);
  useReactive(service.status, setStatus);
  return { installed, status };
}

/**
 * The options of a model list. A chosen model that isn't installed stays in the list, so it can still be seen.
 */
function modelOptions(installed: InstalledModel[], chosen: string | undefined): ReactNode[] {
  const options = installed.map((model) => (
    <MenuItem key={model.name} value={model.name}>
      {describe(model)}
    </MenuItem>
  ));
  if (chosen !== undefined && chosen !== USE_GENERAL && !installed.some((model) => model.name === chosen)) {
    options.unshift(
      <MenuItem key={chosen} value={chosen}>
        {chosen} · not installed
      </MenuItem>,
    );
  }
  return options;
}

function NotInstalledWarning(props: { model: string }): ReactNode {
  return (
    <Alert severity="warning" sx={{ marginTop: "0.5em" }} data-testid="model-not-installed">
      {props.model} isn't installed, so questions that use it will fail. Install it with <code>ollama pull {props.model}</code>, or
      pick another model.
    </Alert>
  );
}

/**
 * The model of the mediator and of all agents without one of their own.
 */
export function GeneralModelComponent(props: { service: ModelService }): ReactNode {
  const [general, setGeneral] = useState<string>(props.service.general.value);
  useReactive(props.service.general, setGeneral);
  const { installed, status } = useInstalledModels(props.service);

  return (
    <Box data-testid="general-model">
      <FormControl fullWidth>
        <FormLabel id="general-model-label">Model</FormLabel>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.25em", marginTop: "0.5em" }}>
          {/* minWidth 0 lets the list shrink, so the refresh button fits next to it in a narrow menu. */}
          <Select
            size="small"
            sx={{ flex: "1 1 auto", minWidth: 0 }}
            labelId="general-model-label"
            value={general}
            onChange={(event) => props.service.setGeneral(event.target.value)}
            data-testid="general-model-select"
          >
            {modelOptions(installed, general)}
          </Select>
          <Tooltip title="Look for newly installed models">
            <IconButton aria-label="Refresh the list of models" onClick={() => props.service.refresh()}>
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>
      </FormControl>
      {status === "unreachable" ? (
        <Alert severity="error" sx={{ marginTop: "0.5em" }} data-testid="models-unreachable">
          Ollama can't be reached, so the installed models can't be listed. Check that it is running on the computer
          running the assistant.
        </Alert>
      ) : status === "ready" && !props.service.isInstalled(general) ? (
        <NotInstalledWarning model={general} />
      ) : null}
      <Typography variant="caption" component="p" sx={{ marginTop: "0.5em" }}>
        Used by the mediator, and by each agent you haven't picked a model for. To add a model, run{" "}
        <code>ollama pull &lt;name&gt;</code> on the computer running the assistant, for example{" "}
        <code>ollama pull llama3.2</code>, then press refresh. The{" "}
        <Link href="https://ollama.com/library" target="_blank" rel="noopener noreferrer">
          Ollama library
        </Link>{" "}
        lists the models. Larger models answer better, but need more memory and are slower.
      </Typography>
      <Typography variant="caption" component="p" sx={{ marginTop: "0.25em", color: "text.secondary" }}>
        Finding the relevant parts of long papers and documents always uses {LLMApiService.DEFAULT_EMBEDDING_MODEL}.
      </Typography>
    </Box>
  );
}

/**
 * The model of one agent, which follows the general model until the user picks another one.
 */
export function AgentModelComponent(props: { service: ModelService; agentId: string }): ReactNode {
  const [general, setGeneral] = useState<string>(props.service.general.value);
  const [own, setOwn] = useState<string | undefined>(props.service.agents.get(props.agentId));
  useReactive(props.service.general, setGeneral);
  useReactive(props.service.agents, (agents) => setOwn(agents.get(props.agentId)));
  const { installed, status } = useInstalledModels(props.service);

  const isSet = own !== undefined;

  return (
    <Box sx={{ textAlign: "left", marginBottom: "0.5em" }} data-testid={`${props.agentId}-model`}>
      <Select
        size="small"
        fullWidth
        value={own ?? USE_GENERAL}
        displayEmpty
        inputProps={{ "aria-label": "Agent model" }}
        onChange={(event) =>
          event.target.value === USE_GENERAL
            ? props.service.clearForAgent(props.agentId)
            : props.service.setForAgent(props.agentId, event.target.value)
        }
        data-testid={`${props.agentId}-model-select`}
      >
        <MenuItem value={USE_GENERAL}>Use general ({general})</MenuItem>
        {modelOptions(installed, own)}
      </Select>
      <Typography variant="caption" component="p" sx={{ marginTop: "0.25em" }} data-testid={`${props.agentId}-model-text`}>
        {isSet ? `Model: ${own}` : `Model not set: uses the general model (${general})`}
      </Typography>
      {isSet && status === "ready" && !props.service.isInstalled(own) ? <NotInstalledWarning model={own} /> : null}
    </Box>
  );
}
