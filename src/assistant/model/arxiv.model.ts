export type OpenAlexWork = {
    id:string;
    title:string | null;
    publication_year:number | null;
    cited_by_count:number | null;
    authorships:{ author:{ display_name:string } }[];
    abstract_inverted_index:Record<string, number[]> | null;
    locations:{ landing_page_url:string | null; pdf_url:string | null }[];
}

export type OpenAlexWorksResponse = {
    results:OpenAlexWork[];
}

export type ArxivPaper = {
    id:string;
    title:string;
    year:number | null;
    citations:number;
    authors:string[];
    abstract:string;
    url:string;
}

export type ArxivAgentResponse = {
    topic:string;
    question:string;
}

export type OpenAlexBudget =
    | { status:"loaded"; remainingUsd:number; limitUsd:number; resetsAt:number }
    | { status:"invalidKey" }
    | { status:"unknown" };
