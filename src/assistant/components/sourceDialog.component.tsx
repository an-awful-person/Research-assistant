import { Close, OpenInNew } from "@mui/icons-material";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Utils } from "../../services/utils.service";
import type { ReferenceModel } from "../model/reference.model";

/**
 * An overview of what was retrieved from a source, and which answers it was used for.
 */
export function SourceDialogComponent(props: {
  reference: ReferenceModel | undefined;
  onClose: () => void;
}): ReactNode {
  const reference = props.reference;
  const fullScreen = useMediaQuery(useTheme().breakpoints.down("md"));

  return (
    <Dialog open={reference !== undefined} onClose={props.onClose} maxWidth="md" fullWidth fullScreen={fullScreen} scroll="paper">
      <DialogTitle sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5em" }}>
        <span>{reference?.source}</span>
        <Tooltip title="Close">
          <IconButton onClick={props.onClose} aria-label="Close source">
            <Close />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent dividers data-testid="source-dialog-content" sx={{ textAlign: "left", overflowWrap: "anywhere" }}>
        {reference === undefined ? null : (
          <>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              First retrieved on {reference.firstRetrieved}.{" "}
              {Utils.isWebLink(reference.url) ? (
                <Link href={reference.url} target="_blank" rel="noopener noreferrer" color="inherit" data-testid="source-link">
                  Open source <OpenInNew sx={{ fontSize: "0.9em", verticalAlign: "middle" }} />
                </Link>
              ) : null}
            </Typography>

            <Typography variant="h6" sx={{ marginTop: "1em" }}>
              Information retrieved
            </Typography>
            {reference.retrieved.map((item) => (
              <Box key={`${item.url}:${item.quote}`} sx={{ margin: "0.5em 0" }} data-testid="source-quote">
                <Typography variant="body2" component="blockquote" sx={{ margin: 0, paddingLeft: "0.75em", borderLeft: "2px solid", borderColor: "divider" }}>
                  {item.quote}
                </Typography>
                {item.url !== reference.url && Utils.isWebLink(item.url) ? (
                  <Link href={item.url} target="_blank" rel="noopener noreferrer" color="inherit" variant="caption">
                    Open this part of the source
                  </Link>
                ) : null}
                {!Utils.isWebLink(item.url) && item.url.includes("#page=") ? (
                  <Typography variant="caption" data-testid="source-quote-page">
                    Page {item.url.split("#page=")[1]}
                  </Typography>
                ) : null}
              </Box>
            ))}

            <Divider sx={{ margin: "1em 0" }} />

            <Typography variant="h6">Used in</Typography>
            {reference.usedIn.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }} data-testid="source-not-cited">
                This source was read, but no answer could be traced back to it.
              </Typography>
            ) : (
              reference.usedIn.map((use, index) => (
                <Box key={index} sx={{ margin: "0.75em 0" }} data-testid="source-use">
                  <Typography variant="subtitle2">{use.question}</Typography>
                  {/* Answers are Markdown. Like in the chat, nothing in them can make the browser load something. */}
                  <Typography variant="body2" component="div" sx={{ "& p": { margin: "0.25em 0" }, overflowWrap: "anywhere" }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      disallowedElements={["img"]}
                      unwrapDisallowed
                      components={{
                        a: ({ href, children }) => (
                          <Link href={href} target="_blank" rel="noopener noreferrer">
                            {children}
                          </Link>
                        ),
                      }}
                    >
                      {use.answer}
                    </ReactMarkdown>
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {use.date}
                  </Typography>
                </Box>
              ))
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
