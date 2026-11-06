import { Alert, Box, Typography } from "@mui/material";
import { useState, type ReactNode } from "react";
import { useReactive } from "../../services/reactive.service";
import type { SearchEnginesStatus, WebSearchService } from "../services/webSearch.service";

/**
 * Explains how the free search works, and shows how the search engines did in the last search.
 */
export function SearchStatusComponent(props: {
  service: WebSearchService;
  agentId: string;
}): ReactNode {
  const [status, setStatus] = useState<SearchEnginesStatus | undefined>(props.service.lastStatus.value);

  useReactive(props.service.lastStatus, setStatus);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5em", textAlign: "left" }}>
      <Alert severity="info" data-testid={`${props.agentId}-search-info`}>
        This uses DuckDuckGo and a local SearXNG together, without a key or costs. Both read the result pages of search
        engines automatically, which those engines can block and their terms may not allow, so this is meant for personal use.
        SearXNG needs Docker, and starts with the application.
      </Alert>
      <Typography variant="caption" data-testid={`${props.agentId}-search-status`}>
        {status === undefined
          ? "No search has been done since this page was opened."
          : `Last search answered by: ${status.used.join(", ")}.${status.failed.length > 0 ? ` Failed: ${status.failed.join(", ")}.` : ""}`}
      </Typography>
      {status?.failed.includes("SearXNG") ? (
        <Typography variant="caption" data-testid={`${props.agentId}-searxng-help`}>
          If you haven't set up SearXNG: install Docker, on Linux run "sudo usermod -aG docker $USER", log in again and restart the application. The first start downloads it, which takes a while.
        </Typography>
      ) : null}
    </Box>
  );
}
