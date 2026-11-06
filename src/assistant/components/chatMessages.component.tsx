/* eslint-disable react-hooks/set-state-in-effect */
import { Delete, Edit } from "@mui/icons-material";
import { Box, Card, CardContent, Chip, Divider, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import { type JSX, type ReactNode, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MESSAGE_ROLES } from "../constants/llm.constants";
import { type META_LMMMessage } from "../model/llm.model";
import type { EvidenceModel, SourceWarning } from "../model/reference.model";
import { MediatorService } from "../services/mediator.service";
import { SourceDialogComponent } from "./sourceDialog.component";

/** Phones can't hover, so a tap shows the explanation and keeps it up long enough to read. */
const TOUCH_TOOLTIP = { enterTouchDelay: 0, leaveTouchDelay: 6000 };

/** Where markdown from models and search results can be wider than a phone, it scrolls inside its own box. */
const MARKDOWN_STYLE = {
  overflowWrap: "anywhere",
  "& pre": { overflowX: "auto", maxWidth: "100%" },
  "& .table-scroll": { overflowX: "auto", maxWidth: "100%", margin: "0.5em 0" },
  "& table": { borderCollapse: "collapse", overflowWrap: "normal" },
  "& th, & td": { border: 1, borderColor: "divider", padding: "0.25em 0.5em", textAlign: "left", verticalAlign: "top" },
} as const;

export function ChatMessagesComponent<T extends MediatorService>(props: {
  messages: META_LMMMessage[];
  chatService: T;
  chatId: string;
  disableEditting?: boolean
}): JSX.Element {
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<META_LMMMessage[]>(props.messages);
  // Which source is shown in the dialog: only what is on screen, so it's kept here.
  const [openReferenceId, setOpenReferenceId] = useState<string | undefined>(undefined);
  const references = props.chatService.assistantService.references;
  const openSource = (citation: EvidenceModel | undefined) => {
    const id = citation?.items[0]?.referenceId;
    if (id !== undefined && references.get(id) !== undefined) {
      setOpenReferenceId(id);
    }
  };

  useEffect(() => {
    setMessages(props.messages);

    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [props.messages]);

  function RenderMessage<T extends MediatorService>(props: {
    message: META_LMMMessage;
    chatService: T;
  }): JSX.Element {
    const text = props.message.content;

    return (
      <Box sx={{ textAlign: "left", ...MARKDOWN_STYLE }}>
        {props.message.type === "json" ? (
          <pre style={{ whiteSpace: "pre-wrap" }}>
            <code>{text}</code>
          </pre>
        ) : (
          <div>
            {/* Text can come from search results, which shouldn't be able to make the browser load something. */}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              disallowedElements={["img"]}
              unwrapDisallowed
              components={{
                table: ({ children }) => (
                  <div className="table-scroll">
                    <table>{children}</table>
                  </div>
                ),
                // Conversations are only kept in memory, so links shouldn't navigate away from them.
                a: ({ href, children }) => {
                  const number = href?.startsWith("#source-") ? Number(href.slice("#source-".length)) : undefined;
                  if (number !== undefined) {
                    const citation = props.message.citations?.find((candidate) => candidate.number === number);
                    return <SourceNumber number={number} citation={citation} onOpen={() => openSource(citation)} />;
                  }
                  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                },
              }}
            >
            {text}
            </ReactMarkdown>
          </div>
        )
        }
      </Box>
    );
  }

  function MessageContainer(props:{message:META_LMMMessage, index:number, disableEditting?:boolean, chatService:MediatorService, chatId:string}):JSX.Element{
    const [buttonsVisible, setButtonsVisible] = useState<boolean>(false);
    const [edit, setEdit] = useState<boolean>(false);
    const [newMessage, setNewMessage] = useState<string>(props.message.content);

    return (
      <Card
        elevation={0}
        sx={{
          padding: "0.5em 0em 0em 0em",
          border: "none",
          backgroundColor: "transparent",
        }}
      >
        <CardContent sx={{ padding: 0, "&:last-child": { paddingBottom: 0 } }}>
          <Box
            sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "0.5em", rowGap: "0.25em", paddingBottom: "0.25em" }}
            onMouseOver={() => {
              setButtonsVisible(true);
            }}
            onMouseOut={() => {
              setButtonsVisible(false);
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 500,
                textTransform: "uppercase",
                color: (theme) =>
                  props.message.role === MESSAGE_ROLES.ASSISTANT
                    ? theme.palette.roleColors.assistant
                    : props.message.role === MESSAGE_ROLES.SYSTEM
                    ? theme.palette.roleColors.other
                    : theme.palette.roleColors.user,
              }}
            >
              {props.message.role}
            </Typography>
            {props.message.failedAttempts?.length ? (
              <Tooltip
                {...TOUCH_TOOLTIP}
                title={props.message.failedAttempts.map((reason, index) => (
                  <div key={index}>{index + 1}. {reason.split(/(?<=\.)\s/)[0]}</div>
                ))}
              >
                <Chip
                  label={`${props.message.failedAttempts.length} failed attempt${props.message.failedAttempts.length === 1 ? "" : "s"}`}
                  color="warning"
                  variant="outlined"
                  size="small"
                  data-testid="failed-attempts"
                />
              </Tooltip>
            ) : null}
              {
                props.message.citations?.map(citation => {
                  const hasOneLink = citation.items.length === 1;
                  return (
                    <Tooltip key={`${citation.number ?? ""}${citation.source}`} title={<CitationPassages citation={citation} />}>
                      <Chip
                        label={`${citation.number === undefined ? "" : `${citation.number} `}${hasOneLink ? citation.source : `${citation.source} (${citation.items.length})`}`}
                        onClick={() => openSource(citation)}
                        sx={{ maxWidth: "100%" }}
                        size={'small'}
                        data-testid="citation"
                      />
                    </Tooltip>
                  );
                })
              }
              {props.message.sourceWarnings?.map((warning) => (
                <SourceWarningChip key={warning.kind} warning={warning} />
              ))}
              {props.message.unverified && props.message.sourceWarnings === undefined ? (
                <Tooltip {...TOUCH_TOOLTIP} title="This answer could not be traced back to a source that was read. It may come from the model's own knowledge, so check it before relying on it.">
                  <Chip
                    label="No verified source"
                    color="warning"
                    variant="outlined"
                    size={'small'}
                    data-testid="unverified-source"
                  />
                </Tooltip>
              ) : null}
            {!props.disableEditting ? (
              <Box sx={{ visibility: buttonsVisible ? "visible" : "hidden", marginLeft: "auto" }}>
                <IconButton
                  size={"small"}
                  aria-label="Edit message"
                  onClick={() => {
                    setEdit(!edit);
                  }}
                  color={edit ? "primary" : "default"}
                >
                  <Edit />
                </IconButton>
                <IconButton size={"small"} aria-label="Delete message" onClick={() => {
                  props.chatService.deleteMessage(props.chatId, props.index);
                }}>
                  <Delete />
                </IconButton>
              </Box>
            ) : null}
          </Box>
          <Divider />
          <Typography variant="body2" component="div">
            {edit ? (
              <TextField
                value={newMessage}
                onChange={(event) => {
                  setNewMessage(event.target.value);
                  props.chatService.editMessage(
                    event.target.value,
                    props.message
                  );
                }}
              />
            ) : (
              <RenderMessage
                message={props.message}
                chatService={props.chatService}
              />
            )}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box sx={{ width: "100%", overflowY: "auto" }} ref={chatContainerRef}>
      {messages.map((message: META_LMMMessage, index: number) => {
        return (
          <MessageContainer message={message} index={index} chatService={props.chatService} chatId={props.chatId} disableEditting={props.disableEditting} key={index}/>
        );
      })}
      <SourceDialogComponent
        reference={openReferenceId === undefined ? undefined : references.get(openReferenceId)}
        onClose={() => setOpenReferenceId(undefined)}
      />
    </Box>
  );
}

const WARNING_LABELS: Record<SourceWarning["kind"], string> = {
  noSource: "No verified source",
  unsourced: "Partly unsourced",
  notFound: "Not found in source",
  unknownId: "Unknown source removed",
  namedNotUsed: "Names an unused source",
};

function SourceWarningChip(props: { warning: SourceWarning }): JSX.Element {
  return (
    <Tooltip {...TOUCH_TOOLTIP} title={props.warning.message}>
      <Chip
        label={WARNING_LABELS[props.warning.kind]}
        color="warning"
        variant="outlined"
        size="small"
        data-testid={props.warning.kind === "noSource" ? "unverified-source" : `source-warning-${props.warning.kind}`}
      />
    </Tooltip>
  );
}

function AutomaticNote(): JSX.Element {
  return (
    <div style={{ fontStyle: "italic", marginBottom: "0.5em" }}>
      The model didn't quote this source exactly, so these passages were matched to its answer automatically.
    </div>
  );
}

/**
 * The passages a source was cited for, shown when hovering it.
 */
function CitationPassages(props: { citation: EvidenceModel }): ReactNode {
  return (
    <Box sx={{ maxHeight: "20em", overflowY: "auto" }}>
      <div style={{ fontWeight: 500, marginBottom: "0.5em" }}>{props.citation.source}</div>
      {props.citation.items.some((item) => item.automatic) ? <AutomaticNote /> : null}
      {props.citation.items.flatMap((item) => item.quotes).slice(0, 4).map((quote, index) => (
        <div key={index} style={{ marginBottom: "0.25em" }}>"{quote}"</div>
      ))}
      <div style={{ marginTop: "0.5em", fontStyle: "italic" }}>Click to see the source.</div>
    </Box>
  );
}

/**
 * The number of a source in the text of an answer. Hovering it shows the passages, and clicking or tapping it opens
 * the source with where it was used, instead of leaving the page.
 */
function SourceNumber(props: { number: number; citation: EvidenceModel | undefined; onOpen: () => void }): JSX.Element {
  const label = <sup data-testid="source-number">[{props.number}]</sup>;
  if (props.citation === undefined) {
    return label;
  }
  return (
    <Tooltip title={<CitationPassages citation={props.citation} />}>
      <Box
        component="button"
        type="button"
        onClick={props.onOpen}
        aria-label={`Source ${props.number}: ${props.citation.source}`}
        sx={{
          // A bigger area to tap than the number itself, without moving the text around it.
          padding: "0.6em 0.5em",
          margin: "-0.6em -0.35em",
          border: "none",
          background: "none",
          color: "primary.main",
          font: "inherit",
          cursor: "pointer",
          verticalAlign: "baseline",
        }}
      >
        {label}
      </Box>
    </Tooltip>
  );
}
