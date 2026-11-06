import { FileDownloadOutlined } from "@mui/icons-material";
import { CircularProgress, IconButton, Tooltip } from "@mui/material";
import { useState, type ReactNode } from "react";
import { useReactive } from "../../services/reactive.service";
import type { ExportService } from "../services/export.service";
import { ExportDialogComponent } from "./exportDialog.component";

/**
 * The button next to Send that saves the conversation, or a report of it.
 */
export function ExportMenuComponent(props: {
  service: ExportService;
  /** If the conversation has an answer to save. */
  hasAnswers: boolean;
  /** If the assistant is still answering, so the conversation isn't finished. */
  busy: boolean;
}): ReactNode {
  const [open, setOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(props.service.saving.value);
  useReactive(props.service.saving, setSaving);

  const disabled = !props.hasAnswers || props.busy || saving;
  const title = saving
    ? "Making the document…"
    : !props.hasAnswers
      ? "Save conversation (after the first answer)"
      : props.busy
        ? "Wait until the current answer is done"
        : "Save conversation";

  return (
    <>
      <Tooltip title={title}>
        {/* The span keeps the tooltip working while the button is disabled. */}
        <span>
          <IconButton
            aria-label="Save conversation"
            aria-haspopup="dialog"
            aria-busy={saving}
            onClick={() => setOpen(true)}
            disabled={disabled}
            sx={{ width: 40, height: 40 }}
            data-testid="export-button"
          >
            {saving ? <CircularProgress size={20} data-testid="export-progress" /> : <FileDownloadOutlined />}
          </IconButton>
        </span>
      </Tooltip>
      <ExportDialogComponent service={props.service} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
