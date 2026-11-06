import {
  Close,
  Description,
  QuestionAnswer,
  Settings,
  Source,
  SupportAgent,
} from "@mui/icons-material";
import { Box, Card, IconButton, Tab, Tabs, Tooltip } from "@mui/material";
import { type ReactNode } from "react";
import type { ThemeService } from "../../services/theme.service";
import type { AssistantService } from "../services/assistant.service";
import { AgentsSettingsComponent } from "./agentsSettings.component";
import { ConversationsList } from "./conversationsList.component";
import { DocumentsComponent } from "./documents.component";
import { SettingsComponent } from "./settings.component";
import { SourcesListComponent } from "./sourcesList.component";

export function SideMenuComponent(props: {
  assistantService: AssistantService;
  themeService: ThemeService;
  /** The tab shown, kept by the parent so it survives closing the menu. */
  tab: number;
  onTabChange: (tab: number) => void;
  /** Closes the menu. Only given where it slides over the chat, on narrow screens, which also get tab labels. */
  onClose?: () => void;
}): ReactNode {
  const isNarrow = props.onClose !== undefined;
  const value = props.tab;

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    props.onTabChange(newValue);
  };

  return (
    <Card
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxShadow: "none",
        borderRadius: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          height: "100%",
          width: "100%",
        }}
      >
        <Box
          sx={{
            width: "100%",
            height: "100%",
            overflowY: "auto",
            borderRight: "1px solid",
            borderColor: "divider",
          }}
        >
          <TabPanel value={value} index={0}>
            <AgentsSettingsComponent
              assistantService={props.assistantService}
            />
          </TabPanel>
          <TabPanel value={value} index={1}>
            <ConversationsList assistantService={props.assistantService}/>
          </TabPanel>
          <TabPanel value={value} index={2}>
            <SourcesListComponent assistantService={props.assistantService} />
          </TabPanel>
          <TabPanel value={value} index={3}>
            <DocumentsComponent service={props.assistantService.documentsService} />
          </TabPanel>
          <TabPanel value={value} index={4}>
            <SettingsComponent
              themeService={props.themeService}
              temperatureService={props.assistantService.temperatureService}
              modelService={props.assistantService.modelService}
            />
          </TabPanel>
        </Box>
        {/* In pixels: a width in em would follow each element's own font size, which put the tabs off centre. */}
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "stretch", flexShrink: 0, width: isNarrow ? 72 : 64 }}>
          {isNarrow ? (
            <IconButton onClick={props.onClose} aria-label="Close menu" sx={{ alignSelf: "center", margin: "0.25em 0", width: 44, height: 44 }}>
              <Close />
            </IconButton>
          ) : null}
          <Tabs
            orientation="vertical"
            sx={{ width: "100%" }}
            value={value}
            onChange={handleChange}
          >
            {TABS.map((tab, index) => (
              <Tooltip key={tab.short} title={tab.title} placement="left">
                <Tab
                  icon={tab.icon}
                  // Phones can't hover for the tooltip, so they get a short label.
                  label={isNarrow ? tab.short : undefined}
                  aria-label={tab.title}
                  sx={{ width: "100%", maxWidth: "none", minWidth: 0, minHeight: isNarrow ? 64 : 48, paddingX: 0.5, fontSize: "0.7rem", textTransform: "none" }}
                  {...a11yProps(index)}
                />
              </Tooltip>
            ))}
          </Tabs>
        </Box>
      </Box>
    </Card>
  );
}

const TABS = [
  { title: "Agents", short: "Agents", icon: <SupportAgent /> },
  { title: "Agent Conversations", short: "Chats", icon: <QuestionAnswer /> },
  { title: "Sources used in conversations", short: "Sources", icon: <Source /> },
  { title: "Documents", short: "Docs", icon: <Description /> },
  { title: "Settings", short: "Settings", icon: <Settings /> },
];

function TabPanel(props: {
  children?: ReactNode;
  index: number;
  value: number;
}) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      tabIndex={0}
      id={`vertical-tabpanel-${index}`}
      aria-labelledby={`vertical-tab-${index}`}
      {...other}
    >
      {value === index && children}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `vertical-tab-${index}`,
    "aria-controls": `vertical-tabpanel-${index}`,
  };
}
