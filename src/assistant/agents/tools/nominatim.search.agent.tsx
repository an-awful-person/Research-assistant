import z from "zod";
import { AbstractMediatorAccessibleAgent } from "../../../interfaces/agents.interface";
import { AssistantService } from "../../services/assistant.service";
import {
  type NominatimJsonModel,
  type NominatimJsonModelSimplified,
} from "../../model/nominatim.model";
import { MediatorService } from "../../services/mediator.service";
import { type LLMMessage } from "../../model/llm.model";
import { MESSAGE_ROLES } from "../../constants/llm.constants";
import { AgentTemperatureComponent } from "../../components/temperatureSlider.component";
import { AgentsService } from "../../services/agents.service";
import type { TemperatureService } from "../../services/temperature.service";
import {
  Box,
  Checkbox,
  Divider,
  FormControlLabel,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useReactive } from "../../../services/reactive.service";

export class NominatimSearchAgent extends AbstractMediatorAccessibleAgent {
  protected _jsonSchema = z.toJSONSchema(
    z.object({
      search: z.string(),
    }),
  );
  protected _assistantService: AssistantService;

  public static readonly ID = "nominatimSearchAgent";

  protected _id = NominatimSearchAgent.ID;

  protected _agentUsageDescription = `
    /**
     * Searches for geolocations based on search terms.
     * @param search A string containing the term you are looking for.

     * @returns returns location information if it was found.
     * @example
     * ${NominatimSearchAgent.ID}("London");
     * /
    ${NominatimSearchAgent.ID}(coordinates:string): string;
    `;

  protected _name = "Nominatim search agent";

  protected _description = `This agent is meant to give the system access to search for geospatial names such as cities, streets, or countries and return a coordinate. 
  The system uses a Nominatim API call to achieve this. 
  It is possible to retreive more information, such as polygons, but to prevent clogging the context window this is currently ignored.`;

  private _maxAttempts: number = 5;

  private _chatService: MediatorService;

  constructor(
    agentsService: AgentsService,
    assistantService: AssistantService,
  ) {
    super(agentsService);
    this._assistantService = assistantService;
    this._chatService = assistantService.mediatorService;
  }

  get temperatureService(): TemperatureService {
    return this._assistantService.temperatureService;
  }

  /**
   * Callable from a mediator
   * @param input
   * @returns
   */
  main(input: string[]): Promise<string> {
    return new Promise<string>((resolve) => {
      try {
        const correctInput: boolean = input !== undefined && input.length > 0;

        if (!correctInput) {
          resolve(
            `The input in ${NominatimSearchAgent.ID} is incorrect. The agent received the following input ${JSON.stringify(
              input,
            )} but expects a search term {search:'Amsterdam'}`,
          );
        } else {
          const search: { search: string } = JSON.parse(input[0]);

          //Adding the full mediator context to determine the actual parameters
          const fullContext: LLMMessage[] = JSON.parse(
            JSON.stringify(
              this._chatService.activeChats.get(
                MediatorService.MEDIATOR_AGENT_ID,
              ) ?? [],
            ),
          );
          this.nominatimSearch(search.search, fullContext).then((result) => {
            resolve(result);
          });
        }
      } catch (error) {
        resolve(
          `The agent could not handle the input and got the following error: ${error}`,
        );
      }
    });
  }

  /**
   * Use this if you want to use outside a mediator
   * @param searchTerm
   * @param context
   * @returns
   */
  nominatimSearch(searchTerm: string, context: LLMMessage[]): Promise<string> {
    return new Promise<string>((resolve) => {
      this._agentsService.currentStatus.set(
        `Nominatim search for '${searchTerm}'`,
      );
      this._assistantService.nominatimService
        .searchCall(searchTerm)
        .then((results) => {
          const simplified = this.getSimplifiedResults(results);
          this.evaluateResults(searchTerm, context, simplified, results).then(
            (answer) => {
              resolve(answer);
            },
          );
        });
    });
  }

  /**
   * Only crucial information to safe tokens and improve focus.
   * @param results
   * @returns
   */
  getSimplifiedResults(
    results: NominatimJsonModel[],
  ): NominatimJsonModelSimplified[] {
    const simplify: NominatimJsonModelSimplified[] = [];
    results.forEach((result) => {
      simplify.push({
        display_name: result.display_name,
        place_id: result.place_id,
        address: result.address,
        addresstype: result.addresstype,
        extratags: result.extratags,
        lat: result.lat,
        lon: result.lon,
      });
    });
    return simplify;
  }

  evaluateResults(
    searchTerm: string,
    context: LLMMessage[],
    simplified: NominatimJsonModelSimplified[],
    original: NominatimJsonModel[],
  ) {
    return new Promise<string>((resolve) => {
      this._agentsService.currentStatus.set(`Evaluating Nominatim results`);

      const chatID = this._chatService.createID(this.id);
      this._chatService.addChat(chatID);

      const assistant_summary = {
        role: MESSAGE_ROLES.ASSISTANT,
        content: JSON.stringify(simplified),
      };
      context.push(assistant_summary);
      this._chatService.pushMessage(chatID, assistant_summary);

      const user_request = {
        role: MESSAGE_ROLES.USER,
        content: `Your job is to estimate which search Nominatim geolocation result is the most likely meant based on the context. Respond the place_id. If none of the results seems a likely candidate respond 0.`,
      };
      context.push(user_request);
      this._chatService.pushMessage(chatID, user_request);
      this.evaluateResultsCall(
        context,
        searchTerm,
        simplified,
        original,
        chatID,
      ).then((answer) => {
        resolve(answer);
      });
    });
  }

  evaluateResultsCall(
    context: LLMMessage[],
    searchTerm: string,
    simplified: NominatimJsonModelSimplified[],
    original: NominatimJsonModel[],
    chatID: string,
    attempts: number = 0,
  ) {
    const internal_jsonSchema = z.toJSONSchema(
      z.object({
        place_id: z.number(),
      }),
    );

    return new Promise<string>((resolve) => {
      this._assistantService.llmApiService
        .jsonCall<{ place_id: number }>(context, internal_jsonSchema, {
          temperature: this._assistantService.temperatureService.forAgent(this.id),
        })
        .then((result) => {
          if (result.place_id == 0) {
            resolve(`Could not find a suited match for ${searchTerm}`);
          } else {
            const foundPlace: NominatimJsonModelSimplified | undefined =
              simplified.find((p) => p.place_id == result.place_id);
            if (foundPlace) {
              this._agentsService.currentStatus.set(
                `Found the location ${searchTerm}`,
              );
              this._chatService.pushMessage(chatID, {
                role: MESSAGE_ROLES.ASSISTANT,
                content: JSON.stringify(foundPlace),
              });
              resolve(JSON.stringify(foundPlace));
            } else if (attempts < this._maxAttempts) {
              const result_summary: LLMMessage = {
                role: MESSAGE_ROLES.ASSISTANT,
                content: JSON.stringify(result),
              };
              this._chatService.pushMessage(chatID, result_summary);
              context.push(result_summary);

              const not_found_message: LLMMessage = {
                role: MESSAGE_ROLES.USER,
                content: `Could not find a place with the id ${result.place_id} as its place_id. Are you sure you have the correct id? Please try again.`,
              };
              this._chatService.pushMessage(chatID, not_found_message);
              context.push(not_found_message);
              this._agentsService.currentStatus.set(
                `Evaluating Nominatim results (attempt ${attempts + 1})`,
              );
              this.evaluateResultsCall(
                context,
                searchTerm,
                simplified,
                original,
                chatID,
                attempts + 1,
              ).then((response) => {
                resolve(response);
              });
            } else {
              resolve(`Failed to evaluate a correct match for ${searchTerm}.`);
            }
          }
        });
    });
  }
  protected _settings = (<RespondAgentSettings agent={this} />);
}

// eslint-disable-next-line react-refresh/only-export-components
function RespondAgentSettings(props: { agent: NominatimSearchAgent }) {
  const [enabled, setEnabled] = useState<boolean>(props.agent.enabled.value);

  function check() {
    props.agent.toggleEnabled();
  }

  useReactive(props.agent.enabled, setEnabled);

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <Typography variant="caption" sx={{ textAlign: "left" }}>
        {props.agent.description}
      </Typography>
      <Divider sx={{ margin: "0.5em" }} />
      <Tooltip title="Enable the agent to be used as a tool." placement="left">
        <FormControlLabel
          control={
            <Checkbox
              checked={enabled}
              onChange={() => {
                check();
              }}
            />
          }
          label={"Enable agent"}
        />
      </Tooltip>
      <Divider sx={{ margin: "0.5em" }} />
      <AgentTemperatureComponent service={props.agent.temperatureService} agentId={props.agent.id} />
    </Box>
  );
}
