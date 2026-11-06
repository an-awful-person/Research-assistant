import z from "zod";
import { AbstractAgent } from "../../../interfaces/agents.interface";
import type { AssistantService } from "../../services/assistant.service";
import { MediatorService } from "../../services/mediator.service";
import { MESSAGE_ROLES } from "../../constants/llm.constants";
import type { AgentsService } from "../../services/agents.service";
import type { META_LMMMessage } from "../../model/llm.model";

export type ReferenceAgentResponseType = {
    sources: string[];
}

export class ReferenceAgent extends AbstractAgent {    
        protected _id = 'referenceAgent';

        protected _jsonSchema = z.toJSONSchema(z.object({sources: z.array(z.string())}))    

        private _assistantAgent:AssistantService;

        constructor(assistantAgent:AssistantService, agentsService:AgentsService){
            super(agentsService);

            this._assistantAgent = assistantAgent;
        }

        /**
         * Should be added when the reponse message from the response agent is known but not implemented in the chat yet.
         * The agent will get the current chat, add the known response and ask if any known sources was used to generate the response.
         * @param input response message
         * @returns a list of sources if they were used.
         */
        main(input: string[]): Promise<string>{
            const chatService:MediatorService = this._assistantAgent.mediatorService;

            return new Promise<string>((resolve) => {
                
                this.agentsService.currentStatus.set('Adding references');
                
                const openChatID = chatService.createID(this.id);
                chatService.addChat(openChatID);

                const mediatorChat = JSON.parse(JSON.stringify(chatService.activeChats.get(MediatorService.MEDIATOR_AGENT_ID) ?? []));
                const assistantMessage: META_LMMMessage = {
                    role:MESSAGE_ROLES.ASSISTANT,
                    content: input[0]
                }
                mediatorChat.push(assistantMessage);
                chatService.pushMessage(openChatID, assistantMessage);
                
                const requestMessage: META_LMMMessage = {
                    role:MESSAGE_ROLES.USER,
                    content:`
                    The system has the following list of references saved. Were any of these references used to generate this answer?

                    The references are defined in the following way:
                    {
                        source:string; //name of the source used. If the source is wikipedia, the search term used is still important.
                        referencedText:string[]; //The text from the actual article that was used as a reference.
                        usedForParagraph:string[]; //The generated text that the source was used to help generate.
                    }
                    
                    ${JSON.stringify(Array.from(this._assistantAgent.references.value.entries()))}

                    please respond in the following format:
                    {
                        sources:string[]; //Where the sources are the sources are exactly the same used references 'source'.
                    }
                    `
                }
                mediatorChat.push(requestMessage);
                chatService.pushMessage(openChatID, requestMessage);

                this._assistantAgent.llmApiService.jsonCall<ReferenceAgentResponseType>(mediatorChat,this._jsonSchema, { temperature: 1.0 }).then(
                    references => {
                        chatService.pushMessage(openChatID, {
                            role:MESSAGE_ROLES.ASSISTANT,
                            content:JSON.stringify(references)
                        })
                        resolve(JSON.stringify(references))
                    }
                );
            });
        }
}