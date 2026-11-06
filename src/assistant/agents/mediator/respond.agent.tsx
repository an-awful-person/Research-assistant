import z from "zod";
import { AbstractMediatorAccessibleAgent } from "../../../interfaces/agents.interface";
import { KNOWN_FUNCTIONS } from "../../services/agents.service";
import { Box, Typography } from "@mui/material";

export class RespondAgent extends AbstractMediatorAccessibleAgent {
        protected _agentUsageDescription = `/**
         * If you feel that you've gained enough information to answer the question you can respond to the user.
         * Do this only if you gained a certainty of 0.8 or higher of the original question not the function answers after. Or use this if you feel like you can no longer answer the question, but then explain why you can't and what you would need to correctly answer the question.
         * Base your answer only on the results of the functions you used, and don't add details from your own knowledge. If you do use your own knowledge, say so.
         * Cite your sources: the results of functions give each source an id, like S1. Put the id in square brackets after every statement that comes from that source, like "It was released in 2025 [S1]." or "[S1, S3]" for several. Only use ids that functions gave you, and never name a source, like Wikipedia, without its id. Statements without an id are read as your own reasoning or knowledge.
         * 
         * @param answer (string) the answer to the question. The user will only see this answer field, so repeat information from the answer field above if it is necassary.
         * @returns (void) The function will not return a response.
        respond(answer:string):void`;
    
        protected _id = KNOWN_FUNCTIONS.RESPOND;

        protected _jsonSchema = z.toJSONSchema(z.object({response: z.string()})) ;
        
        protected _name = 'Response Agent';
        
        protected _description = "A curcial agent that can not be disabled. This agent is meant to provide the user with an answer once the system 'thinks' it is confident enough to do so."

        main(input: string[]): Promise<string>{
            return new Promise<string>((resolve) => {
                resolve(input[0]);
            });
        }
        protected _settings = <RespondAgentSettings agent={this} />;
}

// eslint-disable-next-line react-refresh/only-export-components
function RespondAgentSettings(props: { agent: RespondAgent }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <Typography variant="caption" sx={{ textAlign: "left" }}>
        {props.agent.description}
      </Typography>
    </Box>
  );
}