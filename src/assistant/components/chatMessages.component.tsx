/* eslint-disable react-hooks/set-state-in-effect */
import { Delete, Edit } from "@mui/icons-material";
import { Box, Card, CardContent, Chip, Divider, IconButton, Link, TextField, Tooltip, Typography } from "@mui/material";
import { type JSX, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MESSAGE_ROLES } from "../constants/llm.constants";
import { type META_LMMMessage } from "../model/llm.model";
import type { EvidenceModel, SourceWarning } from "../model/reference.model";
import { Utils } from "../../services/utils.service";
import { MediatorService } from "../services/mediator.service";

export function ChatMessagesComponent<T extends MediatorService>(props: {
  messages: META_LMMMessage[];
  chatService: T;
  chatId: string;
  disableEditting?: boolean
}): JSX.Element {
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<META_LMMMessage[]>(props.messages);

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
      <Box sx={{textAlign:'left'}}>
        {props.message.type === "json" ? (
          <pre style={{ whiteSpace: "pre-wrap" }}>
            <code>{text}</code>
          </pre>
        ) : (
          <div>
            {/* Text can come from search results, which shouldn't be able to make the browser load something. */}
            <ReactMarkdown
              disallowedElements={["img"]}
              unwrapDisallowed
              components={{
                // Conversations are only kept in memory, so links shouldn't navigate away from them.
                a: ({ href, children }) => {
                  const number = href?.startsWith("#source-") ? Number(href.slice("#source-".length)) : undefined;
                  if (number !== undefined) {
                    return <SourceNumber number={number} citation={props.message.citations?.find((citation) => citation.number === number)} />;
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
            sx={{ display: "flex" }}
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
                title={props.message.failedAttempts.map((reason, index) => (
                  <div key={index}>{index + 1}. {reason.split(/(?<=\.)\s/)[0]}</div>
                ))}
              >
                <Chip
                  label={`${props.message.failedAttempts.length} failed attempt${props.message.failedAttempts.length === 1 ? "" : "s"}`}
                  color="warning"
                  variant="outlined"
                  size="small"
                  sx={{ margin: "0 0.5em" }}
                  data-testid="failed-attempts"
                />
              </Tooltip>
            ) : null}
            <Box>
              {
                props.message.citations?.map(citation => {
                  const hasOneLink = citation.items.length === 1;
                  return (
                    <Tooltip
                      key={citation.source}
                      title={
                        <Box sx={{ maxHeight: "20em", overflowY: "auto" }}>
                          {citation.items.some((item) => item.automatic) ? <AutomaticNote /> : null}
                          {citation.items.map((item) => (
                            <Box key={item.url} sx={{ marginBottom: "0.5em" }}>
                              {item.quotes.map((quote, index) => (
                                <div key={index}>"{quote}"</div>
                              ))}
                              {hasOneLink || !Utils.isWebLink(item.url) ? null : (
                                <Link href={item.url} target="_blank" rel="noopener noreferrer" color="inherit" data-testid="citation-link">
                                  Open this source
                                </Link>
                              )}
                            </Box>
                          ))}
                        </Box>
                      }
                    >
                      <Chip
                        label={`${citation.number === undefined ? "" : `${citation.number} `}${hasOneLink ? citation.source : `${citation.source} (${citation.items.length})`}`}
                        {...(hasOneLink && Utils.isWebLink(citation.items[0].url)
                          ? { component: "a", href: citation.items[0].url, target: "_blank", rel: "noopener noreferrer", clickable: true }
                          : {})}
                        sx={{margin:'0 0.5em', marginTop:'-1em'}}
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
                <Tooltip title="This answer could not be traced back to a source that was read. It may come from the model's own knowledge, so check it before relying on it.">
                  <Chip
                    label="No verified source"
                    color="warning"
                    variant="outlined"
                    sx={{margin:'0 0.5em', marginTop:'-1em'}}
                    size={'small'}
                    data-testid="unverified-source"
                  />
                </Tooltip>
              ) : null}
            </Box>
            {!props.disableEditting ? (
              <Box sx={{ visibility: buttonsVisible ? "visible" : "hidden" }}>
                <IconButton
                  size={"small"}
                  aria-label="Edit message"
                  sx={{ margin: "-12px 0 0 0.5em" }}
                  onClick={() => {
                    setEdit(!edit);
                  }}
                  color={edit ? "primary" : "default"}
                >
                  <Edit />
                </IconButton>
                <IconButton size={"small"} aria-label="Delete message" sx={{ margin: "-12px 0 0 0" }} onClick={() => {
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
    <Tooltip title={props.warning.message}>
      <Chip
        label={WARNING_LABELS[props.warning.kind]}
        color="warning"
        variant="outlined"
        sx={{ margin: "0 0.5em", marginTop: "-1em" }}
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
 * The number of a source in the text of an answer, which shows what it is based on and opens the source.
 */
function SourceNumber(props: { number: number; citation: EvidenceModel | undefined }): JSX.Element {
  const item = props.citation?.items[0];
  const label = <sup data-testid="source-number">[{props.number}]</sup>;
  return (
    <Tooltip
      title={
        props.citation === undefined ? "" : (
          <Box sx={{ maxHeight: "20em", overflowY: "auto" }}>
            <div style={{ fontWeight: 500, marginBottom: "0.5em" }}>{props.citation.source}</div>
            {props.citation.items.some((candidate) => candidate.automatic) ? <AutomaticNote /> : null}
            {props.citation.items.flatMap((candidate) => candidate.quotes).slice(0, 4).map((quote, index) => (
              <div key={index} style={{ marginBottom: "0.25em" }}>"{quote}"</div>
            ))}
          </Box>
        )
      }
    >
      {item !== undefined && Utils.isWebLink(item.url) ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>{label}</a>
      ) : (
        <span>{label}</span>
      )}
    </Tooltip>
  );
}
