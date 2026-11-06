export type DoctrineDocument = {
    source:string;
    ref:string;
    title:string;
    date:string | null;
    provenance:string;
    url:string;
    designation?:string;
}

export type DoctrineSearchResponse = {
    documents:DoctrineDocument[];
    requestedDesignation:string | null;
    furtherReading:{ title:string; date:string | null; url:string }[];
    failedSources:string[];
}

export type DoctrineTextResponse = {
    distribution:{ status:"public" | "restricted" | "unknown"; statement:string };
    pages:string[];
    pageUrl:string;
}

export type DoctrineAgentResponse = {
    topic:string;
    question:string;
}
