import { Box, Drawer, useMediaQuery, useTheme } from "@mui/material";
import { type JSX, useState } from "react";
import type { ThemeService } from "../../services/theme.service";
import { AssistantService } from "../services/assistant.service";
import { ChatComponent } from "./chat.component";
import { SideMenuComponent } from "./sidemenu.component";

/** Width of the side menu on wide screens. */
const MENU_WIDTH = "min(30vw, 480px)";
/** Width of the side menu when it slides over the chat on narrow screens. */
const NARROW_MENU_WIDTH = "min(420px, 90vw)";

export function AssistantComponent(props: {
  assistantService: AssistantService;
  themeService: ThemeService;
}): JSX.Element {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down("md"));

  // Purely visual: whether the menu is shown, per layout, and which tab it shows.
  const [wideMenuOpen, setWideMenuOpen] = useState<boolean>(false);
  const [narrowMenuOpen, setNarrowMenuOpen] = useState<boolean>(false);
  const [tab, setTab] = useState<number>(0);

  const menuOpen = isNarrow ? narrowMenuOpen : wideMenuOpen;
  const toggleMenu = () => (isNarrow ? setNarrowMenuOpen(!narrowMenuOpen) : setWideMenuOpen(!wideMenuOpen));

  const menu = (
    <SideMenuComponent
      assistantService={props.assistantService}
      themeService={props.themeService}
      tab={tab}
      onTabChange={setTab}
    />
  );

  return (
    <Box sx={{ position: "absolute", inset: 0, display: "flex", overflow: "hidden" }}>
      <ChatComponent
        assistantService={props.assistantService}
        menuOpen={menuOpen}
        onToggleMenu={toggleMenu}
        compact={isNarrow}
      />

      {isNarrow ? (
        <Drawer
          variant="temporary"
          anchor="right"
          open={narrowMenuOpen}
          onClose={() => setNarrowMenuOpen(false)}
          slotProps={{ paper: { sx: { width: NARROW_MENU_WIDTH } } }}
        >
          {menu}
        </Drawer>
      ) : (
        <Drawer
          variant="persistent"
          anchor="right"
          open={wideMenuOpen}
          sx={{
            width: wideMenuOpen ? MENU_WIDTH : 0,
            flexShrink: 0,
            transition: theme.transitions.create("width", {
              duration: wideMenuOpen
                ? theme.transitions.duration.enteringScreen
                : theme.transitions.duration.leavingScreen,
            }),
          }}
          slotProps={{
            paper: {
              sx: {
                position: "absolute",
                width: `calc(${MENU_WIDTH} - 1em)`,
                top: "1em",
                bottom: "1em",
                right: "1em",
                height: "auto",
                borderRadius: 1,
                border: "none",
                boxShadow: 1,
              },
            },
          }}
        >
          {menu}
        </Drawer>
      )}
    </Box>
  );
}
