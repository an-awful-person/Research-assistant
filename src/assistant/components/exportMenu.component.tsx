import { FileDownloadOutlined } from "@mui/icons-material";
import {
  CircularProgress,
  IconButton,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import { useState, type ReactNode } from "react";
import { useReactive } from "../../services/reactive.service";
import type { ExportFormat, ExportKind, ExportService } from "../services/export.service";

/**
 * The button next to Send that saves the conversation, or a report of it, as Markdown or PDF.
 */
export function ExportMenuComponent(props: {
  service: ExportService;
  /** If the conversation has an answer to save. */
  hasAnswers: boolean;
  /** If the assistant is still answering, so the conversation isn't finished. */
  busy: boolean;
}): ReactNode {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [writingReport, setWritingReport] = useState<boolean>(props.service.writingReport.value);
  useReactive(props.service.writingReport, setWritingReport);

  const disabled = !props.hasAnswers || props.busy || writingReport;
  const title = writingReport
    ? "Writing the report…"
    : !props.hasAnswers
      ? "Save conversation (after the first answer)"
      : props.busy
        ? "Wait until the current answer is done"
        : "Save conversation";

  const choose = (kind: ExportKind, format: ExportFormat) => {
    setAnchor(null);
    void props.service.save(kind, format);
  };

  return (
    <>
      <Tooltip title={title}>
        {/* The span keeps the tooltip working while the button is disabled. */}
        <span>
          <IconButton
            aria-label="Save conversation"
            aria-haspopup="menu"
            aria-expanded={anchor !== null}
            aria-busy={writingReport}
            onClick={(event) => setAnchor(event.currentTarget)}
            disabled={disabled}
            sx={{ width: 40, height: 40 }}
            data-testid="export-button"
          >
            {writingReport ? <CircularProgress size={20} data-testid="export-progress" /> : <FileDownloadOutlined />}
          </IconButton>
        </span>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        // Long explanations wrap instead of being cut off on phones.
        slotProps={{ list: { dense: true, sx: { maxWidth: "20em", "& .MuiMenuItem-root": { whiteSpace: "normal" } } } }}
        data-testid="export-menu"
      >
        <ListSubheader sx={{ lineHeight: "2.5em" }}>Conversation and sources</ListSubheader>
        <MenuItem onClick={() => choose("conversation", "md")} data-testid="export-conversation-md">
          <ListItemText primary="Markdown (.md)" />
        </MenuItem>
        <MenuItem onClick={() => choose("conversation", "pdf")} data-testid="export-conversation-pdf">
          <ListItemText primary="PDF" secondary="Opens the print dialog: choose Save as PDF" />
        </MenuItem>
        <ListSubheader sx={{ lineHeight: "2.5em" }}>Report of the conclusions</ListSubheader>
        <MenuItem onClick={() => choose("report", "md")} data-testid="export-report-md">
          <ListItemText primary="Markdown (.md)" secondary="Written by the model, takes a moment" />
        </MenuItem>
        <MenuItem onClick={() => choose("report", "pdf")} data-testid="export-report-pdf">
          <ListItemText primary="PDF" secondary="Written by the model, then the print dialog opens" />
        </MenuItem>
      </Menu>
    </>
  );
}
