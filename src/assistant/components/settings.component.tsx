import {
  Box,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
} from "@mui/material";
import { useState, type ReactNode } from "react";
import type { ThemeDefinition } from "../../constants/theme.constants";
import { useReactive } from "../../services/reactive.service";
import type { ThemeService } from "../../services/theme.service";
import type { TemperatureService } from "../services/temperature.service";
import { GeneralTemperatureComponent } from "./temperatureSlider.component";

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

export function SettingsComponent(props: {
  themeService: ThemeService;
  temperatureService: TemperatureService;
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
      <GeneralTemperatureComponent service={props.temperatureService} />
    </Box>
  );
}
