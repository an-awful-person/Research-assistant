import { ThemeProvider } from "@mui/material";
import { useState, type ReactNode } from "react";
import type { ThemeDefinition } from "../constants/theme.constants";
import { useReactive } from "../services/reactive.service";
import type { ThemeService } from "../services/theme.service";

export function ThemeComponent(props: {
  themeService: ThemeService;
  children: ReactNode;
}): ReactNode {
  const [theme, setTheme] = useState<ThemeDefinition>(props.themeService.theme.value);

  useReactive(props.themeService.theme, setTheme);

  return <ThemeProvider theme={theme.theme}>{props.children}</ThemeProvider>;
}
