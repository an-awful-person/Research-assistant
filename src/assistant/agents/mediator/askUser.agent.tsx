import { Box, Typography } from "@mui/material";
import z from "zod";
import { AbstractMediatorAccessibleAgent } from "../../../interfaces/agents.interface";
import { KNOWN_FUNCTIONS } from "../../services/agents.service";

export class AskUserAgent extends AbstractMediatorAccessibleAgent {
  protected _agentUsageDescription = `/**
 * If all else fails or you feel like you are mission crucial information that the other given functions can not provide you can ask the user for the information.
 * Don't use this function if you are using other functions to get the information as well in that case add it to your plan instead.
 * Never use this function to confirm or check information you found, or to ask the user for the answer to their own question. If you found information, use respond and tell the user what you found and where it came from.
 * Explain why you are asking the question and what you are hoping to achieve with the answer of the question.
 * @param question (string) the question to be asked.
 * @returns (void) The question will be asked to the user and the answer will be returned.
 * @example
 * askUser('To answer your question I would need the amount of fire stations in Oosterhout but I could not find that information myself. Do you know how many fire stations Oosterhout has?') // Oosterhout has 1 fire station.
askUser(question:string):void`;

  protected _id = KNOWN_FUNCTIONS.ASK_USER;

  protected _jsonSchema = z.toJSONSchema(z.object({ question: z.string() }));

  protected _name = "Ask User Agent";

  protected _description = `This agent is a primary agent that can not be disabled. The agent is meant to be an option for the system to ask questions back to the user when the LLM 'thinks' a question is unclear or if it 'thinks' that it has exploited all available resources but still can not provide a proper answer.`;

  main(input: string[]): Promise<string> {
    return new Promise<string>((resolve) => {
      resolve(input[0]);
    });
  }

  protected _settings = <AskUserAgentSettings agent={this} />;
}

// eslint-disable-next-line react-refresh/only-export-components
function AskUserAgentSettings(props: { agent: AskUserAgent }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <Typography variant="caption" sx={{ textAlign: "left" }}>
        {props.agent.description}
      </Typography>
    </Box>
  );
}