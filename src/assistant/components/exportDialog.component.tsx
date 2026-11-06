import { Article, Close, Forum, PictureAsPdf, Notes } from "@mui/icons-material";
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useState, type ReactNode } from "react";
import type { ExportFormat, ExportKind, ExportService } from "../services/export.service";

/** A large choice with a title and one line on what it gives. */
function ChoiceCard(props: { selected: boolean; onSelect: () => void; icon: ReactNode; title: string; text: string; testId: string }): ReactNode {
  return (
    <ButtonBase
      role="radio"
      aria-checked={props.selected}
      onClick={props.onSelect}
      data-testid={props.testId}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75em",
        width: "100%",
        textAlign: "left",
        padding: "0.75em 1em",
        borderRadius: "12px",
        border: 2,
        borderColor: props.selected ? "primary.main" : "divider",
        bgcolor: props.selected ? "action.selected" : "transparent",
        "&:focus-visible": { outline: (theme) => `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
      }}
    >
      <Box sx={{ color: props.selected ? "primary.main" : "text.secondary", paddingTop: "0.1em" }}>{props.icon}</Box>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {props.title}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {props.text}
        </Typography>
      </Box>
    </ButtonBase>
  );
}

/**
 * Asks what to save and in which format, in plain words, and then saves it.
 */
export function ExportDialogComponent(props: { service: ExportService; open: boolean; onClose: () => void }): ReactNode {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const [kind, setKind] = useState<ExportKind>("conversation");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [images, setImages] = useState<boolean>(true);

  const save = () => {
    props.onClose();
    void props.service.save(kind, format, { images: images });
  };

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      fullWidth
      maxWidth="xs"
      fullScreen={isPhone}
      aria-labelledby="export-dialog-title"
      data-testid="export-dialog"
    >
      <DialogTitle id="export-dialog-title" sx={{ display: "flex", alignItems: "center", paddingRight: "0.5em" }}>
        <Box sx={{ flex: "1 1 auto" }}>Save conversation</Box>
        <IconButton aria-label="Close" onClick={props.onClose} sx={{ width: 44, height: 44 }}>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="overline" component="h3" sx={{ color: "text.secondary" }}>
          What do you want to save?
        </Typography>
        <Box role="radiogroup" aria-label="What to save" sx={{ display: "flex", flexDirection: "column", gap: "0.5em" }}>
          <ChoiceCard
            selected={kind === "conversation"}
            onSelect={() => setKind("conversation")}
            icon={<Forum />}
            title="Conversation and sources"
            text="Every question and answer, followed by the sources they used."
            testId="export-kind-conversation"
          />
          <ChoiceCard
            selected={kind === "report"}
            onSelect={() => setKind("report")}
            icon={<Article />}
            title="Report"
            text="A report in the style of a scientific paper: introduction, findings, discussion and conclusion, written by your model from this conversation. Takes a moment."
            testId="export-kind-report"
          />
        </Box>

        <Typography variant="overline" component="h3" sx={{ color: "text.secondary", display: "block", marginTop: "1em" }}>
          As
        </Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          value={format}
          onChange={(_event, value: ExportFormat | null) => value !== null && setFormat(value)}
          aria-label="File type"
        >
          <ToggleButton value="pdf" sx={{ minHeight: 48, textTransform: "none", gap: "0.5em" }} data-testid="export-format-pdf">
            <PictureAsPdf fontSize="small" />
            PDF
          </ToggleButton>
          <ToggleButton value="md" sx={{ minHeight: 48, textTransform: "none", gap: "0.5em" }} data-testid="export-format-md">
            <Notes fontSize="small" />
            Markdown
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2" sx={{ color: "text.secondary", marginTop: "0.5em" }} data-testid="export-format-text">
          {format === "pdf"
            ? "A document to read, print or share."
            : "Plain text, to edit or paste into notes. Opens in any text editor."}
        </Typography>

        {kind === "report" ? (
          <Box sx={{ marginTop: "1em" }} data-testid="export-images">
            <FormControlLabel
              control={<Switch checked={images} onChange={(event) => setImages(event.target.checked)} />}
              label="Add photos from Wikimedia Commons"
            />
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Free photos of what the report is about, each with its author and licence. The search words go to Wikimedia.
            </Typography>
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ padding: "0.5em 1.5em 1.25em 1.5em" }}>
        <Button onClick={props.onClose} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} sx={{ minHeight: 44 }} data-testid="export-download">
          Download
        </Button>
      </DialogActions>
    </Dialog>
  );
}
