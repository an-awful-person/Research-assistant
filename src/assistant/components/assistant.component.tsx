import { Box, Drawer, SwipeableDrawer, useMediaQuery, useTheme } from "@mui/material";
import { type JSX, useState } from "react";
import type { ThemeService } from "../../services/theme.service";
import { AssistantService } from "../services/assistant.service";
import { ChatComponent } from "./chat.component";
import { SideMenuComponent } from "./sidemenu.component";

/** Width of the side menu on wide screens. */
const MENU_WIDTH = "min(30vw, 480px)";
/** Width of the side menu when it slides over the chat on narrow screens. */
const NARROW_MENU_WIDTH = "min(420px, 90vw)";

// iOS has its own swipe gestures, which the drawer's animations get in the way of.
const IS_IOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

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
      onClose={isNarrow ? () => setNarrowMenuOpen(false) : undefined}
    />
  );

  return (
    <Box
      sx={{
        // The visible part of the screen, which on phones changes with the address bar and the keyboard.
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        "@supports (height: 100dvh)": { height: "100dvh" },
        boxSizing: "border-box",
        // Keeps everything clear of notches and the home bar.
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        display: "flex",
        overflow: "hidden",
      }}
    >
      <ChatComponent
        assistantService={props.assistantService}
        menuOpen={menuOpen}
        onToggleMenu={toggleMenu}
        compact={isNarrow}
      />

      {isNarrow ? (
        // Swiping it to the right closes it. Swiping to open is off, so it can't get in the way of going back.
        <SwipeableDrawer
          anchor="right"
          open={narrowMenuOpen}
          onClose={() => setNarrowMenuOpen(false)}
          onOpen={() => setNarrowMenuOpen(true)}
          disableSwipeToOpen
          disableBackdropTransition={!IS_IOS}
          disableDiscovery={IS_IOS}
          slotProps={{ paper: { sx: { width: NARROW_MENU_WIDTH, paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" } } }}
        >
          {menu}
        </SwipeableDrawer>
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
