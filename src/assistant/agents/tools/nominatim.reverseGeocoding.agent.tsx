import { type Coordinate } from "ol/coordinate";
import z from "zod";
import { AbstractMediatorAccessibleAgent } from "../../../interfaces/agents.interface";
import { MAP_PROJECTION } from "../../../models/map.model";
import { AssistantService } from "../../services/assistant.service";
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

export class NominatimReverseGeocodingAgent extends AbstractMediatorAccessibleAgent {
  protected _jsonSchema = z.toJSONSchema(
    z.object({
      coordinate: z
        .array(z.number())
        .length(2)
        .describe("Coordinate, [latitude ,longitude]"),
    }),
  );
  protected _assistantService: AssistantService;

  public static readonly ID = "nominatimReverseGeocodingAgent";

  protected _id = NominatimReverseGeocodingAgent.ID;

  protected _agentUsageDescription = `
    /**
     * Reverse geocoding generates an address from a coordinate given as latitude and longitude.
     * @param coordinate The latitude and longitude as an array of 2 numbers

     * @returns Detailed information about the location such as in which country it is placed. If the location is within a city. Other geocoding information.
     * @example
     * ${NominatimReverseGeocodingAgent.ID}([52.3451141, 4.8409387]);
     * /
    ${NominatimReverseGeocodingAgent.ID}(coordinate:number[]): string;
    `;

  protected _name = "Nominatim Reverse Geocoding Agent";

  protected _description =
    "This agent can retreive geolocation information such as the name of a city or country based on a given coordinate. This gives the system access to understand where coordinates are based. The system uses a Nominatim API to get this answer. Response information is limited to geospatial names only.";

  constructor(assistantService: AssistantService) {
    super(assistantService.mediatorService.agentsService);
    this._assistantService = assistantService;
    this._agentsService = assistantService.mediatorService.agentsService;
  }

  main(input: string[]): Promise<string> {
    return new Promise<string>((resolve) => {
      try {
        const correctInput: boolean =
          input !== undefined &&
          input.length > 0 &&
          Array.isArray(JSON.parse(input[0]).coordinate);

        if (!correctInput) {
          resolve(
            `The input in ${NominatimReverseGeocodingAgent.ID} is incorrect. The agent received the following input ${JSON.stringify(
              input,
            )} but expects a Coordinate array, which is an array with 2 numbers in them such as '[51.5073219,-0.1276474]'`,
          );
        } else {
          const coordinate: { coordinate: Coordinate } = JSON.parse(input[0]);
          this._assistantService.nominatimService
            .reverseGeocodingCall(
              // The agent gets latitude first, as people write it, and the map code uses longitude first.
              [coordinate.coordinate[1], coordinate.coordinate[0]],
              MAP_PROJECTION.EPSG_4326,
            )
            .then((result) => {
              resolve(JSON.stringify(result));
            })
            .catch((error) => {
              resolve(`The agent could not look up this coordinate: ${error}`);
            });
        }
      } catch (error) {
        resolve(
          `The agent could not handle the input and got the following error: ${error}`,
        );
      }
    });
  }
  protected _settings = (<RespondAgentSettings agent={this} />);
}

// eslint-disable-next-line react-refresh/only-export-components
function RespondAgentSettings(props: {
  agent: NominatimReverseGeocodingAgent;
}) {
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
    </Box>
  );
}
