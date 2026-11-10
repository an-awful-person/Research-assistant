import { ArrowUpward } from "@mui/icons-material";
import { Box, Chip, IconButton, InputBase, List, ListItemButton, ListItemText, Paper, Tooltip, Typography, useMediaQuery } from "@mui/material";
import { type JSX, type KeyboardEvent, useState } from "react";
import { useReactive } from "../../services/reactive.service";
import { MESSAGE_ROLES } from "../constants/llm.constants";
import type { Skill } from "../model/extensions.model";
import type { META_LMMMessage } from "../model/llm.model";
import { AgentsService } from "../services/agents.service";
import { MediatorService } from "../services/mediator.service";
import { ExternalProgressComponent } from "./activity.component";
import { ExportMenuComponent } from "./exportMenu.component";

function hasAnswers(chats: Map<string, META_LMMMessage[]>): boolean {
  return (chats.get(MediatorService.VISIBLE_CHAT_ID) ?? []).some((message) => message.role === MESSAGE_ROLES.ASSISTANT);
}

/**
 * The box to type a question in. Enter sends it and Shift+Enter starts a new line.
 */
export function ChatInputComponent(props: {
  chatService: MediatorService;
  /** Shows which keys send and add a line, which only makes sense with a keyboard. */
  showHint?: boolean;
}): JSX.Element {
  const agentsService = props.chatService.agentsService;

  const [chatInput, setChatInput] = useState<string>(props.chatService.currentTextInput.value);
  const [status, setStatus] = useState<string>(agentsService.currentStatus.value);
  useReactive(props.chatService.currentTextInput, setChatInput);
  useReactive(agentsService.currentStatus, setStatus);
  const [answered, setAnswered] = useState<boolean>(hasAnswers(props.chatService.activeChats.value));
  useReactive(props.chatService.activeChats, (chats) => setAnswered(hasAnswers(chats)));

  // Phones held sideways have little height, so the box grows less.
  const isShort = useMediaQuery("(max-height: 500px)");
  const busy = status !== AgentsService.CLOSE_STATUS;
  const canSend = !busy && (chatInput ?? "").trim() !== "";

  const skillsService = props.chatService.assistantService.skillsService;
  const [skills, setSkills] = useState<Skill[]>(skillsService.enabledSkills);
  const [forced, setForced] = useState<string | undefined>(skillsService.forced.value);
  const refreshSkills = () => setSkills(skillsService.enabledSkills);
  useReactive(skillsService.skills, refreshSkills);
  useReactive(skillsService.disabled, refreshSkills);
  useReactive(skillsService.forced, setForced);
  // Which line of the skill list is highlighted: only what is on screen.
  const [highlighted, setHighlighted] = useState<number>(0);

  const typedSkill = /^\/([a-z0-9-]*)$/i.exec(chatInput ?? "")?.[1]?.toLowerCase();
  const matches = typedSkill === undefined ? [] : skills.filter((skill) => skill.name.includes(typedSkill)).slice(0, 6);
  const forcedSkill = skills.find((skill) => skill.id === forced);

  const chooseSkill = (skill: Skill) => {
    skillsService.force(skill.id);
    props.chatService.currentTextInput.set("");
    setHighlighted(0);
  };

  const send = () => {
    if (canSend) props.chatService.submitDecodingMessage();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (matches.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted((highlighted + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
        event.preventDefault();
        chooseSkill(matches[Math.min(highlighted, matches.length - 1)]);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      {matches.length > 0 ? (
        <Paper variant="outlined" sx={{ marginBottom: "0.5em", maxHeight: "35vh", overflowY: "auto" }} data-testid="skill-picker">
          <List dense disablePadding role="listbox" aria-label="Skills">
            {matches.map((skill, index) => (
              <ListItemButton
                key={skill.id}
                role="option"
                aria-selected={index === Math.min(highlighted, matches.length - 1)}
                selected={index === Math.min(highlighted, matches.length - 1)}
                onClick={() => chooseSkill(skill)}
                sx={{ minHeight: 44 }}
              >
                <ListItemText primary={`/${skill.name}`} secondary={skill.description} slotProps={{ secondary: { noWrap: true } }} />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      ) : null}
      {forcedSkill !== undefined ? (
        <Chip
          size="small"
          color="primary"
          variant="outlined"
          label={`Skill for this question: ${forcedSkill.name}`}
          onDelete={() => skillsService.force(undefined)}
          sx={{ marginBottom: "0.5em", maxWidth: "100%" }}
          data-testid="skill-forced"
        />
      ) : null}
      <Paper
        variant="outlined"
        sx={{
          display: "flex",
          alignItems: "flex-end",
          gap: "0.5em",
          padding: "0.5em 0.5em 0.5em 1.1em",
          // The progress bar of outside requests runs along the top edge, inside the rounded corners.
          position: "relative",
          overflow: "hidden",
          borderRadius: "24px",
          bgcolor: "background.default",
          transition: (theme) => theme.transitions.create(["border-color", "box-shadow"]),
          "&:focus-within": {
            borderColor: "primary.main",
            boxShadow: (theme) => `0 0 0 1px ${theme.palette.primary.main}`,
          },
        }}
      >
        <ExternalProgressComponent progressService={props.chatService.assistantService.apiService.progressService} />
        <InputBase
          value={chatInput ?? ""}
          onChange={(event) => props.chatService.currentTextInput.set(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask a research question…"
          multiline
          minRows={1}
          maxRows={isShort ? 4 : 8}
          fullWidth
          inputProps={{ "aria-label": "Your question" }}
          sx={{ alignSelf: "center", paddingY: "0.35em", lineHeight: 1.5 }}
        />
        <ExportMenuComponent service={props.chatService.assistantService.exportService} hasAnswers={answered} busy={busy} />
        <Tooltip title={busy ? "Wait until the current answer is done" : "Send"}>
          {/* The span keeps the tooltip working while the button is disabled. */}
          <span>
            <IconButton
              aria-label="Send"
              onClick={send}
              disabled={!canSend}
              sx={{
                width: 40,
                height: 40,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                "&:hover": { bgcolor: "primary.dark" },
                "&.Mui-disabled": { bgcolor: "action.disabledBackground", color: "action.disabled" },
              }}
            >
              <ArrowUpward fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Paper>
      {props.showHint ? (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ textAlign: "center", marginTop: "0.4em" }}>
          Enter to send, Shift+Enter for a new line
        </Typography>
      ) : null}
    </Box>
  );
}
