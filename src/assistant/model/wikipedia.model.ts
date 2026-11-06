export type WikipediaCredentials = {
    clientId:string;
    clientSecret:string;
}

export type WikipediaAuthorizationResponse = {
    token_type:string;
    expires_in: number;
    access_token:string;
}

export type WikipediaSearchPagesResponse = {
    pages:WikipediaSearchPages[];
}

export type WikipediaSearchPages = {
    id:number,
    key:string,
    title:string,
    excerpt:string,
    description:string,
    thumbnail:{
        mimetype:string,
        width:number,
        height:number,
        duration:number,
        url:string
    }
}

export type WikipediaAgentResponse = {
    topic:string,
    question:string
}