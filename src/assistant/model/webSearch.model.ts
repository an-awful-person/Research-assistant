export type WebSearchAgentResponse = {
    query:string;
    question:string;
}

export type WebSearchPage = {
    title:string;
    url:string;
    host:string;
    description:string;
    date:string | null;
    engines:string[];
}

export type ReadPageAgentResponse = {
    url:string;
    question:string;
}

export type ReadPageResponse = {
    url:string;
    title:string;
    text:string;
    truncated:boolean;
}

/** What a source was asked, and what came of it. */
export type SearchAttempt = {
    source:string;
    query:string;
    found?:number;
    error?:string;
}

export type WebSearchResponse = {
    results:WebSearchPage[];
    used:string[];
    failed:string[];
    searches:SearchAttempt[];
}
