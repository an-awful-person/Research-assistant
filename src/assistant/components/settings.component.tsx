import {
  Alert,
  Box,
  FormControl,
  FormControlLabel,
  FormLabel,
  LinearProgress,
  Radio,
  RadioGroup,
  Typography,
} from "@mui/material";
import { useState, type ReactNode } from "react";
import type { ThemeDefinition } from "../../constants/theme.constants";
import { useReactive } from "../../services/reactive.service";
import type { ThemeService } from "../../services/theme.service";
import type { TemperatureService } from "../services/temperature.service";
import { GeneralTemperatureComponent } from "./temperatureSlider.component";
import { GeneralModelComponent } from "./modelSelect.component";
import type { ModelService } from "../services/model.service";
import type { AgentsService } from "../services/agents.service";
import { LLMApiService } from "../services/llmApi.service";

const EXTENSION_TOKEN_WARNING = 4000;

/**
 * A small preview of the background, text and accent colors of a theme.
 */
function ThemeSwatch(props: { theme: ThemeDefinition }): ReactNode {
  const { palette } = props.theme.theme;
  return (
    <Box
      aria-hidden
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "3px",
        padding: "3px 5px",
        borderRadius: "4px",
        border: "1px solid",
        borderColor: "divider",
        backgroundColor: palette.background.paper,
      }}
    >
      {[palette.text.primary, palette.primary.main, palette.roleColors.user].map((color, index) => (
        <Box key={index} sx={{ width: "9px", height: "9px", borderRadius: "50%", backgroundColor: color }} />
      ))}
    </Box>
  );
}

/** The local models have limited room, and every enabled tool and skill description takes some of it in each request. */
function ExtensionRoomComponent(props: { service: AgentsService }): ReactNode {
  const [tokens, setTokens] = useState<number>(props.service.extensionTokens.value);
  useReactive(props.service.extensionTokens, setTokens);
  const tooMuch = tokens > EXTENSION_TOKEN_WARNING;

  return (
    <Box data-testid="extension-room">
      <FormLabel>Room used by skills and MCP tools</FormLabel>
      <LinearProgress
        variant="determinate"
        color={tooMuch ? "warning" : "primary"}
        value={Math.min(100, (tokens / EXTENSION_TOKEN_WARNING) * 100)}
        aria-label="Room used by skills and MCP tools"
        sx={{ margin: "0.5em 0" }}
      />
      <Typography variant="caption" component="p" data-testid="extension-room-text">
        About {tokens.toLocaleString("en")} of {LLMApiService.CONTEXT_TOKENS.toLocaleString("en")} tokens per request.
      </Typography>
      {tooMuch ? (
        <Alert severity="warning" sx={{ marginTop: "0.5em" }} data-testid="extension-room-warning">
          That is a lot for a local model, which leaves less room for what it finds, and may make it choose worse. Switch
          off the tools and skills you don't need.
        </Alert>
      ) : null}
    </Box>
  );
}

export function SettingsComponent(props: {
  themeService: ThemeService;
  temperatureService: TemperatureService;
  modelService: ModelService;
  agentsService: AgentsService;
}): ReactNode {
  const [theme, setTheme] = useState<ThemeDefinition>(props.themeService.theme.value);

  useReactive(props.themeService.theme, setTheme);

  return (
    <Box sx={{ padding: "1em", textAlign: "left", display: "flex", flexDirection: "column", gap: "1.5em" }}>
      <FormControl>
        <FormLabel id="theme-label">Theme</FormLabel>
        <RadioGroup
          aria-labelledby="theme-label"
          value={theme.id}
          onChange={(event) => props.themeService.setTheme(event.target.value)}
          data-testid="theme-choice"
        >
          {props.themeService.themes.map((option) => (
            <FormControlLabel
              key={option.id}
              value={option.id}
              control={<Radio />}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
                  <ThemeSwatch theme={option} />
                  {option.name}
                </Box>
              }
            />
          ))}
        </RadioGroup>
      </FormControl>
      <GeneralModelComponent service={props.modelService} />
      <GeneralTemperatureComponent service={props.temperatureService} />
      <ExtensionRoomComponent service={props.agentsService} />
    </Box>
  );
}
