import type { SearchAttempt } from "./webSearch.model";

export type RedditAgentResponse = {
    topic:string;
    question:string;
}

export type RedditThread = {
    title:string;
    subreddit:string;
    url:string;
    date:string | null;
    excerpts:string[];
}

export type RedditSearchResponse = {
    results:RedditThread[];
    used:string[];
    failed:string[];
    searches:SearchAttempt[];
}
