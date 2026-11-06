export type UploadedDocumentStatus = "reading" | "indexing" | "ready" | "failed";

/** A document the user uploaded, which is kept in memory for this session. */
export type UploadedDocument = {
    id:string;
    name:string;
    status:UploadedDocumentStatus;
    /** The text per page, or the whole text as one part for files without pages. */
    parts:string[];
    hasPages:boolean;
    words:number;
    /** If long documents can only be searched after indexing, and that worked. */
    isSearchable:boolean;
    /** The first words of its text, which tell the model what it is about. */
    opening?:string;
    notice?:string;
    error?:string;
}

export type DocumentAgentResponse = {
    document:string;
    question:string;
}

export type DocumentAnswerResponse = {
    answer:string;
    usedPassages:string[];
}
