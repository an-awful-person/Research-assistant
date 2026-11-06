import { Box, Button, FormLabel, Slider, Tooltip, Typography } from "@mui/material";
import { useState, type ReactNode } from "react";
import { useReactive } from "../../services/reactive.service";
import type { TemperatureService } from "../services/temperature.service";

const EXPLANATION = "Temperature controls how random and creative the text of the language model is.";
const SLIDER_RANGE = { min: 0, max: 1, step: 0.1 };

/**
 * The temperature of the mediator and of all agents without one of their own.
 */
export function GeneralTemperatureComponent(props: { service: TemperatureService }): ReactNode {
  const [general, setGeneral] = useState<number>(props.service.general.value);

  useReactive(props.service.general, setGeneral);

  return (
    <Box data-testid="general-temperature">
      <FormLabel id="general-temperature-label">General temperature: {general}</FormLabel>
      <Tooltip title={EXPLANATION} placement="left">
        <Slider
          {...SLIDER_RANGE}
          aria-labelledby="general-temperature-label"
          value={general}
          valueLabelDisplay="auto"
          onChange={(_event, value) => props.service.setGeneral(value)}
        />
      </Tooltip>
      <Typography variant="caption">
        Used by the mediator, and by each agent you haven't set a temperature for.
      </Typography>
    </Box>
  );
}

/**
 * The temperature of one agent, which has no value until the user uses the slider.
 */
export function AgentTemperatureComponent(props: { service: TemperatureService; agentId: string }): ReactNode {
  const [general, setGeneral] = useState<number>(props.service.general.value);
  const [own, setOwn] = useState<number | undefined>(props.service.agents.get(props.agentId));

  useReactive(props.service.general, setGeneral);
  useReactive(props.service.agents, (agents) => setOwn(agents.get(props.agentId)));

  const isSet = own !== undefined;

  return (
    <Box sx={{ textAlign: "left" }} data-testid={`${props.agentId}-temperature`}>
      <Tooltip title={EXPLANATION} placement="left">
        <Slider
          {...SLIDER_RANGE}
          aria-label="Agent temperature"
          value={own ?? general}
          valueLabelDisplay={isSet ? "auto" : "off"}
          sx={isSet ? undefined : { "& .MuiSlider-thumb, & .MuiSlider-track": { opacity: 0 } }}
          onChange={(_event, value) => props.service.setForAgent(props.agentId, value)}
          // A click on the current value isn't a change, but it does choose that value.
          onChangeCommitted={(_event, value) => props.service.setForAgent(props.agentId, value)}
        />
      </Tooltip>
      <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: "2.25em" }}>
        <Typography variant="caption" data-testid={`${props.agentId}-temperature-text`}>
          {isSet ? `Temperature: ${own}` : `Temperature not set: uses the general temperature (${general})`}
        </Typography>
        {isSet ? (
          <Button size="small" onClick={() => props.service.clearForAgent(props.agentId)}>
            Use general
          </Button>
        ) : null}
      </Box>
    </Box>
  );
}
