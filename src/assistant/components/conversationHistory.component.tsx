import { AddComment, DeleteOutlined, DeleteSweep } from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useState, type ReactNode } from "react";
import { useReactive } from "../../services/reactive.service";
import { AgentsService } from "../services/agents.service";
import type { AssistantService } from "../services/assistant.service";
import type { ConversationSummary } from "../services/conversationStore";

const BUSY = "Wait until the current answer is done";

function describe(conversation: ConversationSummary): string {
  const questions = `${conversation.questions} question${conversation.questions === 1 ? "" : "s"}`;
  const updated = dayjs(conversation.updated);
  const when = updated.isSame(dayjs(), "year") ? updated.format("D MMM, HH:mm") : updated.format("D MMM YYYY");
  return `${questions} · ${when}`;
}

/** Asks before something is deleted for good. */
function ConfirmDialog(props: { open: boolean; title: string; text: string; action: string; onConfirm: () => void; onClose: () => void }): ReactNode {
  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="xs" fullWidth data-testid="confirm-dialog">
      <DialogTitle sx={{ overflowWrap: "anywhere" }}>{props.title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{props.text}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ padding: "0 1.5em 1.25em 1.5em" }}>
        <Button onClick={props.onClose} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button color="error" variant="contained" onClick={props.onConfirm} sx={{ minHeight: 44 }} data-testid="confirm-delete">
          {props.action}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * The conversations kept in this browser: start a new one, switch to another, or delete them.
 */
export function ConversationHistoryComponent(props: {
  assistantService: AssistantService;
  /** Called after switching, so on a phone the menu gets out of the way. */
  onOpened?: () => void;
}): ReactNode {
  const service = props.assistantService.conversationsService;
  const agentsService = props.assistantService.mediatorService.agentsService;

  const [conversations, setConversations] = useState<ConversationSummary[]>(service.conversations.value);
  const [activeId, setActiveId] = useState<string | undefined>(service.activeId.value);
  const [status, setStatus] = useState<string>(agentsService.currentStatus.value);
  useReactive(service.conversations, setConversations);
  useReactive(service.activeId, setActiveId);
  useReactive(agentsService.currentStatus, setStatus);
  // Which deletion is being confirmed: only what is on screen.
  const [confirm, setConfirm] = useState<ConversationSummary | "all" | undefined>(undefined);

  const busy = status !== AgentsService.CLOSE_STATUS;
  const isNew = activeId === undefined;

  const open = (id: string) => {
    service.switchTo(id);
    props.onOpened?.();
  };
  const startNew = () => {
    service.newConversation();
    props.onOpened?.();
  };
  const confirmDelete = () => {
    if (confirm === "all") service.deleteAll();
    else if (confirm !== undefined) service.delete(confirm.id);
    setConfirm(undefined);
  };

  return (
    <Box sx={{ textAlign: "left", display: "flex", flexDirection: "column", minHeight: "100%" }} data-testid="conversation-history">
      <Box sx={{ padding: "0.75em 1em 0.25em 1em" }}>
        <Tooltip title={busy ? BUSY : ""}>
          <span>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AddComment />}
              onClick={startNew}
              disabled={busy || isNew}
              sx={{ minHeight: 44, textTransform: "none" }}
              data-testid="history-new"
            >
              New conversation
            </Button>
          </span>
        </Tooltip>
      </Box>

      {conversations.length === 0 ? (
        <Typography variant="body2" sx={{ padding: "1em", color: "text.secondary" }} data-testid="history-empty">
          No conversations yet. They appear here after your first question.
        </Typography>
      ) : (
        <List data-testid="history-list">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeId;
            return (
              <ListItem
                key={conversation.id}
                disablePadding
                secondaryAction={
                  <Tooltip title={isActive && busy ? BUSY : "Delete conversation"} placement="left">
                    <span>
                      <IconButton
                        edge="end"
                        aria-label={`Delete conversation '${conversation.title}'`}
                        onClick={() => setConfirm(conversation)}
                        disabled={isActive && busy}
                        sx={{ width: 44, height: 44 }}
                      >
                        <DeleteOutlined />
                      </IconButton>
                    </span>
                  </Tooltip>
                }
              >
                <ListItemButton
                  selected={isActive}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => open(conversation.id)}
                  disabled={busy && !isActive}
                  sx={{ minHeight: 56, paddingRight: "3.5em" }}
                  data-testid="history-item"
                >
                  <ListItemText
                    primary={conversation.title}
                    secondary={describe(conversation)}
                    slotProps={{ primary: { sx: { overflowWrap: "anywhere", fontWeight: isActive ? 600 : undefined } } }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      )}

      <Box sx={{ marginTop: "auto", padding: "0.5em 1em 1em 1em" }}>
        {conversations.length > 0 ? (
          <Tooltip title={busy ? BUSY : ""}>
            <span>
              <Button
                fullWidth
                color="error"
                variant="outlined"
                startIcon={<DeleteSweep />}
                onClick={() => setConfirm("all")}
                disabled={busy}
                sx={{ minHeight: 44, textTransform: "none" }}
                data-testid="history-delete-all"
              >
                Delete all conversations
              </Button>
            </span>
          </Tooltip>
        ) : null}
        <Typography variant="caption" component="p" sx={{ color: "text.secondary", marginTop: "0.75em" }}>
          Conversations and their sources are kept in this browser until you delete them. What the agents did is kept
          until you reload the page.
        </Typography>
      </Box>

      <ConfirmDialog
        open={confirm !== undefined}
        title={confirm === "all" ? "Delete all conversations?" : `Delete '${confirm?.title ?? ""}'?`}
        text={
          confirm === "all"
            ? `All ${conversations.length} conversation${conversations.length === 1 ? "" : "s"} and their sources are deleted from this browser. This can't be undone.`
            : "The conversation and its sources are deleted from this browser. This can't be undone."
        }
        action={confirm === "all" ? "Delete all" : "Delete"}
        onConfirm={confirmDelete}
        onClose={() => setConfirm(undefined)}
      />
    </Box>
  );
}
