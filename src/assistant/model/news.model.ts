export type NewsLeadType = "news" | "discussion" | "social";

export type NewsLead = {
    type:NewsLeadType;
    text:string;
    source:string;
    url:string;
    date:string;
}

export type NewsAgentResponse = {
    topic:string;
    question:string;
}

export type GdeltResponse = {
    articles?:{ url:string; title:string; seendate:string; domain:string }[];
}

export type HackerNewsResponse = {
    hits:{ objectID:string; title:string | null; created_at:string }[];
}

export type MastodonStatus = {
    url:string | null;
    content:string;
    created_at:string;
    language:string | null;
    sensitive:boolean;
    account:{ acct:string; bot:boolean };
}
