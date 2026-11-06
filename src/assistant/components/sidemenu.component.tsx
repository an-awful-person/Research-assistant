import {
  Description,
  QuestionAnswer,
  Settings,
  Source,
  SupportAgent,
} from "@mui/icons-material";
import { Box, Card, Tab, Tabs, Tooltip } from "@mui/material";
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
}): ReactNode {
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
            />
          </TabPanel>
        </Box>
        <Tabs
          orientation="vertical"
          sx={{ width: "4em", flexShrink: 0 }}
          value={value}
          onChange={handleChange}
        >
          <Tooltip title="Agents" placement="left">
            <Tab
              icon={<SupportAgent />}
              sx={{ textAlign: "center", maxWidth: "4em", minWidth: 0 }}
              {...a11yProps(0)}
            />
          </Tooltip>
          <Tooltip title="Agent Conversations" placement="left">
            <Tab
              icon={<QuestionAnswer />}
              sx={{ textAlign: "center", maxWidth: "4em", minWidth: 0 }}
              {...a11yProps(1)}
            />
          </Tooltip>
          <Tooltip title="Sources used in conversations" placement="left">
            <Tab
              icon={<Source />}
              sx={{ textAlign: "center", maxWidth: "4em", minWidth: 0 }}
              {...a11yProps(2)}
            />
          </Tooltip>
          <Tooltip title="Documents" placement="left">
            <Tab
              icon={<Description />}
              sx={{ textAlign: "center", maxWidth: "4em", minWidth: 0 }}
              {...a11yProps(3)}
            />
          </Tooltip>
          <Tooltip title="Settings" placement="left">
            <Tab
              icon={<Settings />}
              sx={{ textAlign: "center", maxWidth: "4em", minWidth: 0 }}
              {...a11yProps(4)}
            />
          </Tooltip>
        </Tabs>
      </Box>
    </Card>
  );
}

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
