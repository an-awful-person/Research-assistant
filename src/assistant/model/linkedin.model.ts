import type { SearchAttempt } from "./webSearch.model";

export type LinkedInAgentResponse = {
    topic:string;
    question:string;
}

export type LinkedInResult = {
    title:string;
    kind:"post" | "article" | "event";
    url:string;
    date:string | null;
    excerpts:string[];
}

export type LinkedInSearchResponse = {
    results:LinkedInResult[];
    used:string[];
    failed:string[];
    searches:SearchAttempt[];
}
