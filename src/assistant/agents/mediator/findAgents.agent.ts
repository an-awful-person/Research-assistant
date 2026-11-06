import { Subscription } from "rxjs";
import z from "zod";
import { AbstractAgent, type MediatorAccessableAgent } from "../../../interfaces/agents.interface";
import { type Service } from "../../../interfaces/service.interface";
import { ReactiveArray } from "../../../services/reactiveArray.service";
import {
  MESSAGE_ROLES,
  WRONG_JSON_FORMAT,
} from "../../constants/llm.constants";
import { type FindAgentMessage, type LLMMessage } from "../../model/llm.model";
import { AgentsService } from "../../services/agents.service";
import { MediatorService } from "../../services/mediator.service";
import { AssistantService } from "../../services/assistant.service";

export class FindAgentsAgent extends AbstractAgent implements Service {
  private static readonly AGENT_IDS_KEYWORD = "[agentIds]";

  private static readonly DEFAULT_FIND_AGENTS_SYSTEM_MESSAGE = `You are an assistant that should separate parameters from functions.

    For example if you have a function like this:

    myFunction(1, 2, 'some word')

    You should return the following JSON:
    {
        "name": "myFunction"
    }

    Please remove any " or ' at the beginning and end of the parameters.

    The functions expected by the user are:
    ${FindAgentsAgent.AGENT_IDS_KEYWORD}

Your answer should be in the following JSON format:
{
    "name": string; //The name of the function in string format
    "parameters": string[]; //The parameters of the function in string format
}
`;

  private _systemMessageDescription =
    FindAgentsAgent.DEFAULT_FIND_AGENTS_SYSTEM_MESSAGE;

  protected _id = "findAgents";

  protected _jsonSchema = z.toJSONSchema(z.object({
    name:z.string()
  }))

  private _agents: ReactiveArray<MediatorAccessableAgent>;

  private _assistantService: AssistantService;

  private _subscriptions: Subscription[] = [];

  constructor(
    assistantService: AssistantService,
    agentsService:AgentsService,
    agents: ReactiveArray<MediatorAccessableAgent>,
  ) {
    super(agentsService);
    this._agents = agents;
    this._assistantService = assistantService;

    this.refreshSystemMessage(this._agents.value);
  }

  init() {
    this._subscriptions.push(
      this._agents.listener().subscribe((agents) => {
        this.refreshSystemMessage(agents);
      }),
    );
  }

  exit() {
    this._subscriptions.forEach((sub) => sub.unsubscribe());
  }

  get agentUsageDescription(): string {
    return this._systemMessageDescription;
  }

  main(input: string[]): Promise<string> {
    this.refreshSystemMessage(this._agents.value);

    return new Promise((resolve) => {
      this.agentsService.currentStatus.set(
        "Find agents to consult",
      );

      const findFunctionCall: LLMMessage[] = [
        {
          role: MESSAGE_ROLES.SYSTEM,
          content: this.agentUsageDescription,
        },
        {
          role: MESSAGE_ROLES.USER,
          content: input[0],
        },
      ];

      this.findResults(findFunctionCall).then((result) => {
        resolve(
          result !== undefined
            ? JSON.stringify(result, null, 2)
            : JSON.stringify({ error: "platform not found" }),
        );
      });
    });
  }

  findResults(calls: LLMMessage[], chatID?: string): Promise<string> {
    const chatService: MediatorService =
      this._assistantService.mediatorService;
    const openChatID = chatID ?? chatService.createID(this.id);
    if (chatID === undefined) {
      chatService.addChat(openChatID);
      calls.forEach((call) => {
        chatService.pushMessage(openChatID, call);
      });
    }

    return new Promise<string>((resolve) => {
      this.findAgent(calls, openChatID).then((result) => {
          const resultObject = JSON.parse(result) as FindAgentMessage;
          const resultString = JSON.stringify(resultObject, null, 2);
          if (resultObject.name !== undefined && resultObject.parameters !== undefined) {
            chatService.pushMessage(openChatID, {
              role: MESSAGE_ROLES.ASSISTANT,
              content: resultString,
            });
            resolve(resultString);
          } else {
            const assistantMessage = {
              role: MESSAGE_ROLES.ASSISTANT,
              content: resultString,
            };
            calls.push(assistantMessage);
            chatService.pushMessage(openChatID, assistantMessage);

            calls.push(WRONG_JSON_FORMAT);
            chatService.pushMessage(openChatID, WRONG_JSON_FORMAT);
            this.findResults(calls, chatID).then((result) => {
              resolve(result);
            });
          }
        });
    });
  }

  findAgent(calls: LLMMessage[], chatID: string, attempts:number = 0){
    const chatService: MediatorService =
      this._assistantService.mediatorService;
    return new Promise<string>((resolve) => {
      this._assistantService.llmApiService
        .jsonCall<FindAgentMessage>(calls, this._jsonSchema).then(
          (agentName) => {
            const name = agentName.name;
            const agent = this._agents.value.find(a => a.id === name);
            if(agent){
              const ASSISTANT_MESSAGE: LLMMessage = {
                role: MESSAGE_ROLES.ASSISTANT,
                content: JSON.stringify(agentName)
              }
              calls.push(ASSISTANT_MESSAGE);
              chatService.pushMessage(chatID, ASSISTANT_MESSAGE);

              chatService.agentsService.currentStatus.set(`Found agent ${name}. Collecting parameters`);
              this.resolveAgentParameters(agent, calls,chatID).then(parameters => {
                resolve(JSON.stringify({
                  name:name,
                  parameters:[parameters]
                }))
              })
            } else if (attempts < 3) {
              const ASSISTANT_MESSAGE: LLMMessage = {
                role:MESSAGE_ROLES.ASSISTANT,
                content:JSON.stringify(agentName)
              }

              const COULD_NOT_FIND_AGENT_MESSAGE: LLMMessage = {
                role:MESSAGE_ROLES.USER,
                content:`Could not find the agent ${name}. Please make sure the name is spelled correctly and uses the correct upper and lowercases.`
              }

              calls.push(ASSISTANT_MESSAGE)
              chatService.pushMessage(chatID, ASSISTANT_MESSAGE);
              calls.push(COULD_NOT_FIND_AGENT_MESSAGE);
              chatService.pushMessage(chatID, COULD_NOT_FIND_AGENT_MESSAGE);
              chatService.agentsService.currentStatus.set(`Could not find agent ${name}, retry attemt ${attempts}`,
          );
              this.findAgent(calls, chatID, attempts+1);
            } else {
              resolve(`Could not find an agent named ${name}`);
            }
          }
        )
    })
  }

  resolveAgentParameters(agent:MediatorAccessableAgent, calls: LLMMessage[], chatID: string){
    const chatService: MediatorService =
      this._assistantService.mediatorService;
    return new Promise<string>((resolve) => {
      const NOW_FIND_PARAMETERS_MESSAGE: LLMMessage = {
        role: MESSAGE_ROLES.USER,
        content:`The existing agent ${agent.id} exists. Could you return the functions parameters?`
      }

      calls.push(NOW_FIND_PARAMETERS_MESSAGE);
      chatService.pushMessage(chatID, NOW_FIND_PARAMETERS_MESSAGE);

      //Adding the full mediator context to determine the actual parameters
      const mediatorChat = JSON.parse(JSON.stringify(chatService.activeChats.get(MediatorService.MEDIATOR_AGENT_ID) ?? []))
      const fullContext = mediatorChat;
      calls.forEach(message => {
        if(message.role == MESSAGE_ROLES.SYSTEM) message.role = MESSAGE_ROLES.ASSISTANT
        fullContext.push(message)
      });

      this._assistantService.llmApiService
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .jsonCall<any>(fullContext, agent.jsonSchema).then(
          parameters => {
            chatService.agentsService.currentStatus.set(`Collected agent ${agent.id} parameters.`);
            resolve(JSON.stringify(parameters))
          }
        ).catch(e => {
            const ASSISTANT_MESSAGE = {
              role: MESSAGE_ROLES.ASSISTANT,
              content:String(e)
            }

            calls.push(ASSISTANT_MESSAGE);
            chatService.pushMessage(chatID, ASSISTANT_MESSAGE);
            chatService.agentsService.currentStatus.set(`Unable to make LLM call.`);
            resolve(JSON.stringify(String(e)));
        });
    });
  }

  refreshSystemMessage(agents:MediatorAccessableAgent[]) {
    this._systemMessageDescription =
      FindAgentsAgent.DEFAULT_FIND_AGENTS_SYSTEM_MESSAGE.replace(
        FindAgentsAgent.AGENT_IDS_KEYWORD,
        agents
          .filter((agent) => agent.enabled.value)
          .map((agent) => agent.id)
          .join(", "),
      );
  }
}

