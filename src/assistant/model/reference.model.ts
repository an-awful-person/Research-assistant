/** A source found during the conversations, with what was retrieved from it and where it was used. */
export type ReferenceModel = {
    id:string;
    source:string;
    url:string;
    firstRetrieved:string;
    retrieved:{ quote:string; url:string }[];
    usedIn:{ question:string; answer:string; date:string }[];
}

/** Lets the parts of one document, like its pages, be listed as a single source. */
export type EvidenceDocument = {
    id:string;
    source:string;
    url:string;
}

export type EvidenceItem = {
    source:string;
    url:string;
    quotes:string[];
    referenceId:string;
    /** If the quotes were picked by code, because the model didn't copy any exactly. */
    automatic?:boolean;
}

/** One source of an answer, with the links and quotes from it that support the answer. */
export type EvidenceModel = {
    source:string;
    /** The number the answer refers to this source by, like [1]. Older answers have none. */
    number?:number;
    items:{ url:string; quotes:string[]; referenceId:string; automatic?:boolean }[];
}

/** Something about the sources of an answer that the reader should know. */
export type SourceWarning = {
    kind:"noSource" | "unsourced" | "notFound" | "unknownId" | "namedNotUsed";
    message:string;
}

/** A source that was read for the current question and given an id, so the answer can cite it as [S1]. */
export type RegisteredSource = {
    id:string;
    source:string;
    url:string;
    referenceId:string;
    text:string;
    quotes:string[];
    automatic:boolean;
}

/** The final answer, with its source ids checked and turned into numbers. */
export type AnswerCheck = {
    text:string;
    citations:EvidenceModel[];
    warnings:SourceWarning[];
}
