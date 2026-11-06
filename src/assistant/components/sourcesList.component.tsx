import { Article } from "@mui/icons-material";
import { Box, IconButton, List, ListItem, ListItemText, ListSubheader, Tooltip, Typography } from "@mui/material";
import { useState, type ReactNode } from "react";
import { useReactive } from "../../services/reactive.service";
import type { ReferenceModel } from "../model/reference.model";
import type { AssistantService } from "../services/assistant.service";
import { SourceDialogComponent } from "./sourceDialog.component";

function describe(reference: ReferenceModel): string {
  const quotes = `${reference.retrieved.length} quote${reference.retrieved.length === 1 ? "" : "s"}`;
  const uses = reference.usedIn.length;
  return uses === 0 ? quotes : `Cited in ${uses} answer${uses === 1 ? "" : "s"} · ${quotes}`;
}

function SourceGroup(props: {
  title: string;
  sources: ReferenceModel[];
  onOpen: (id: string) => void;
}): ReactNode {
  if (props.sources.length === 0) {
    return null;
  }
  return (
    <List subheader={<ListSubheader disableSticky>{props.title}</ListSubheader>} data-testid={`sources-${props.title}`}>
      {props.sources.map((source) => (
        <ListItem
          key={source.id}
          sx={{ paddingRight: "4em" }}
          secondaryAction={
            <Tooltip title="Show what was retrieved and where it was used" placement="left">
              <IconButton onClick={() => props.onOpen(source.id)} aria-label={`Show overview of ${source.source}`}>
                <Article />
              </IconButton>
            </Tooltip>
          }
        >
          <ListItemText primary={source.source} secondary={describe(source)} sx={{ overflowWrap: "anywhere" }} />
        </ListItem>
      ))}
    </List>
  );
}

export function SourcesListComponent(props: {
  assistantService: AssistantService;
}): ReactNode {
  const [sources, setSources] = useState<ReferenceModel[]>(
    Array.from(props.assistantService.references.value.values()),
  );
  const [openSource, setOpenSource] = useState<string | undefined>(undefined);

  useReactive(props.assistantService.references, (value) => {
    setSources(Array.from(value.values()));
  });

  return (
    <Box sx={{ textAlign: "left" }}>
      {sources.length === 0 ? (
        <Typography variant="body2" sx={{ padding: "1em", color: "text.secondary" }} data-testid="sources-empty">
          No sources yet. Sources appear here once an agent has found verified information in them.
        </Typography>
      ) : null}
      <SourceGroup title="Cited in answers" sources={sources.filter((source) => source.usedIn.length > 0)} onOpen={setOpenSource} />
      <SourceGroup title="Read, not cited" sources={sources.filter((source) => source.usedIn.length === 0)} onOpen={setOpenSource} />
      <SourceDialogComponent
        reference={sources.find((source) => source.id === openSource)}
        onClose={() => setOpenSource(undefined)}
      />
    </Box>
  );
}
