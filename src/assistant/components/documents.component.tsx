import { CheckCircle, Delete, ErrorOutlined, UploadFile } from "@mui/icons-material";
import { Alert, Box, Button, CircularProgress, IconButton, List, ListItem, ListItemIcon, ListItemText, Tooltip, Typography } from "@mui/material";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { useReactive } from "../../services/reactive.service";
import type { UploadedDocument } from "../model/document.model";
import { DocumentsService } from "../services/documents.service";

function describeDocument(document: UploadedDocument): string {
  switch (document.status) {
    case "reading":
      return "Reading...";
    case "indexing":
      return "Preparing for searching...";
    case "failed":
      return document.error ?? "This file could not be read.";
    case "ready": {
      const words = `${document.words} word${document.words === 1 ? "" : "s"}`;
      return document.hasPages
        ? `${document.parts.length} page${document.parts.length === 1 ? "" : "s"} · ${words}`
        : words;
    }
  }
}

function StatusIcon(props: { document: UploadedDocument }): ReactNode {
  if (props.document.status === "ready") {
    return <CheckCircle color="success" />;
  }
  if (props.document.status === "failed") {
    return <ErrorOutlined color="error" />;
  }
  return <CircularProgress size="1.5em" />;
}

/**
 * Uploads documents and shows which ones there are in this session.
 */
export function DocumentsComponent(props: { service: DocumentsService }): ReactNode {
  const [documents, setDocuments] = useState<UploadedDocument[]>(props.service.documents.value);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const input = useRef<HTMLInputElement>(null);

  useReactive(props.service.documents, setDocuments);

  function drop(event: DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    void props.service.upload(Array.from(event.dataTransfer.files));
  }

  return (
    <Box sx={{ padding: "1em", textAlign: "left", display: "flex", flexDirection: "column", gap: "1em" }}>
      <Box
        data-testid="documents-drop"
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={drop}
        sx={{
          padding: "1.5em 1em",
          textAlign: "center",
          border: "2px dashed",
          borderColor: isDragging ? "primary.main" : "divider",
          borderRadius: "8px",
        }}
      >
        <Typography variant="body2" sx={{ marginBottom: "0.75em" }}>
          Drop Word, PDF, text or Markdown files here
        </Typography>
        <Button variant="contained" startIcon={<UploadFile />} onClick={() => input.current?.click()}>
          Choose files
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={DocumentsService.ACCEPTED_TYPES}
          data-testid="documents-input"
          onChange={(event) => {
            void props.service.upload(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </Box>
      <Alert severity="info" data-testid="documents-note">
        Files are read in this browser and only go to your language model, not to the research server. They are kept
        for this session, so reloading the page clears them.
      </Alert>
      {documents.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }} data-testid="documents-empty">
          No documents uploaded yet.
        </Typography>
      ) : (
        <List data-testid="documents-list" disablePadding>
          {documents.map((document) => (
            <ListItem
              key={document.id}
              disableGutters
              sx={{ paddingRight: "3em" }}
              secondaryAction={
                <Tooltip title="Remove this document" placement="left">
                  <IconButton onClick={() => props.service.remove(document.id)} aria-label={`Remove ${document.name}`}>
                    <Delete />
                  </IconButton>
                </Tooltip>
              }
            >
              <ListItemIcon sx={{ minWidth: "2.5em" }}>
                <StatusIcon document={document} />
              </ListItemIcon>
              <ListItemText
                primary={document.name}
                secondary={
                  <>
                    {describeDocument(document)}
                    {document.notice !== undefined && document.status !== "failed" ? (
                      <Box component="span" sx={{ display: "block", color: "warning.main" }} data-testid="document-warning">
                        {document.notice}
                      </Box>
                    ) : null}
                  </>
                }
                sx={{ overflowWrap: "anywhere" }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
