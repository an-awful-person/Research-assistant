import type { Service } from "../../interfaces/service.interface";
import { Reactive } from "../../services/reactive.service";
import { ReactiveMap } from "../../services/reactiveMap.service";
import type { StorageService } from "../../services/storage.service";
import { LLMApiService } from "./llmApi.service";

/**
 * The temperatures of the model calls: a general one, and one for each agent the user has chosen one for.
 */
export class TemperatureService implements Service {
  private static readonly GENERAL_STORAGE_KEY = "temperatureGeneral";
  private static readonly AGENTS_STORAGE_KEY = "temperatureAgents";

  private _storageService: StorageService;

  private _general: Reactive<number> = new Reactive<number>(LLMApiService.DEFAULT_TEMPERATURE);
  private _agents: ReactiveMap<number> = new ReactiveMap<number>();

  constructor(storageService: StorageService) {
    this._storageService = storageService;
    this.load();
  }

  init() {}

  exit() {}

  /**
   * The temperature of the mediator, and of each agent without one of its own.
   */
  get general(): Reactive<number> {
    return this._general;
  }

  /**
   * The temperatures the user has chosen for specific agents.
   */
  get agents(): ReactiveMap<number> {
    return this._agents;
  }

  /**
   * @param agentId The id of an agent. Its sub-agents use the same one.
   * @returns The temperature that agent should use now
   */
  forAgent(agentId: string): number {
    return this._agents.get(agentId) ?? this._general.value;
  }

  setGeneral(value: number): void {
    this._general.set(value);
    this._storageService.setLocally(TemperatureService.GENERAL_STORAGE_KEY, value);
  }

  setForAgent(agentId: string, value: number): void {
    if (this._agents.get(agentId) !== value) {
      this._agents.add(agentId, value);
      this.saveAgents();
    }
  }

  /**
   * Makes an agent follow the general temperature again.
   */
  clearForAgent(agentId: string): void {
    this._agents.delete(agentId);
    this.saveAgents();
  }

  private saveAgents(): void {
    this._storageService.setLocally(
      TemperatureService.AGENTS_STORAGE_KEY,
      Object.fromEntries(this._agents.value),
    );
  }

  private load(): void {
    const general = this._storageService.getLocally<unknown>(TemperatureService.GENERAL_STORAGE_KEY);
    if (this.isValid(general)) {
      this._general.set(general);
    }

    const agents = this._storageService.getLocally<unknown>(TemperatureService.AGENTS_STORAGE_KEY);
    if (typeof agents === "object" && agents !== null) {
      Object.entries(agents).forEach(([agentId, value]) => {
        if (this.isValid(value)) {
          this._agents.add(agentId, value);
        }
      });
    }
  }

  private isValid(value: unknown): value is number {
    return typeof value === "number" && value >= 0 && value <= 1;
  }
}
