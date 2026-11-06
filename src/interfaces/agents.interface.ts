/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReactElement } from "react";
import { type ZodStandardJSONSchemaPayload } from "zod/v4/core";
import type { AgentsService } from "../assistant/services/agents.service";
import { Reactive } from "../services/reactive.service";

export interface Agent {

    /**
     * The actual function that will be called by the agent.
     * @param input 
     * @returns 
     */
    main:(input:string[]) => Promise<string>;

    /**
     * The id of the agent.
     */
    id:string;

    /**
     * Agents system to consult
     */
    agentsService:AgentsService

    /**
     * If the agent is enabled for use
     */
    enabled:Reactive<boolean>;

    /**
     * If the agent can currently be enabled. Some agents need something first, like credentials.
     */
    canBeEnabled:boolean;

    /**
     * Enables or disables the agent as the user's own choice, which is remembered.
     */
    toggleEnabled:() => void;

}

export interface MediatorAccessableAgent extends Agent {
    /**
     * Keep firm, the expected inputs and outputs and the purpose of the agent.
     */
    agentUsageDescription:string;
    
    /**
     * JSON schema expected as input
     */
    jsonSchema: ZodStandardJSONSchemaPayload<any>;

    /**
     * Human recognizable name of the agent.
     */
    name:string;

    /**
     * A short description of the agent and its intent.
     */
    description:string;

    /**
     * A react object that will appear inside the agent options.
     * This is to edit the agent settings using the interface.
     */
    settings: ReactElement<any>;
}

export abstract class AbstractAgent implements Agent {
    protected abstract _id:string;
    abstract main(input: string[]): Promise<string>;
    protected _agentsService: AgentsService;
    protected _enabled: Reactive<boolean>;

    constructor(agentsService:AgentsService, enabled:boolean = true){
        this._agentsService = agentsService;
        this._enabled = new Reactive<boolean>(enabled);
    }

    get agentsService(): AgentsService {
        return this._agentsService;
    }

    get id():string{
        return this._id;
    }

    get enabled():Reactive<boolean>{
        return this._enabled;
    }

    get canBeEnabled():boolean{
        return true;
    }

    toggleEnabled():void{
        const enabled = !this._enabled.value;
        if(enabled && !this.canBeEnabled){
            return;
        }
        this._enabled.set(enabled);
        this._agentsService.rememberEnabled(this.id, enabled);
    }
}

export abstract class AbstractMediatorAccessibleAgent extends AbstractAgent implements MediatorAccessableAgent {
    protected abstract _agentUsageDescription:string;
    protected abstract _jsonSchema:ZodStandardJSONSchemaPayload<any>;
    protected abstract _name:string;
    protected abstract _description:string;
    protected abstract _settings: ReactElement<any>;

    get agentUsageDescription():string{
        return this._agentUsageDescription;
    }

    get jsonSchema(): ZodStandardJSONSchemaPayload<any>{
        return this._jsonSchema;
    }

    get name(): string{
        return this._name;
    }

    get description():string {
        return this._description;
    }

    get settings(): ReactElement<any> {
        return this._settings;
    }
}