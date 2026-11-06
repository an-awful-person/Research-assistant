import type { Service } from "../../interfaces/service.interface";
import { Reactive } from "../../services/reactive.service";
import { ReactiveMap } from "../../services/reactiveMap.service";
import type { StorageService } from "../../services/storage.service";
import { LLMApiService } from "./llmApi.service";

/** A chat model that is installed in Ollama. */
export type InstalledModel = {
  name: string;
  /** In bytes. */
  size: number;
  parameterSize: string;
};

export type InstalledModelsStatus = "loading" | "ready" | "unreachable";

/**
 * The models of the model calls: a general one, and one for each agent the user has chosen one for.
 * Like the temperature, an agent follows the general model until the user picks another one for it.
 */
export class ModelService implements Service {
  private static readonly GENERAL_STORAGE_KEY = "modelGeneral";
  private static readonly AGENTS_STORAGE_KEY = "modelAgents";

  private _storageService: StorageService;
  private _llmApiService: LLMApiService;

  private _general: Reactive<string> = new Reactive<string>(LLMApiService.DEFAULT_MODEL);
  private _agents: ReactiveMap<string> = new ReactiveMap<string>();

  private _installed: Reactive<InstalledModel[]> = new Reactive<InstalledModel[]>([]);
  private _status: Reactive<InstalledModelsStatus> = new Reactive<InstalledModelsStatus>("loading");

  constructor(storageService: StorageService, llmApiService: LLMApiService) {
    this._storageService = storageService;
    this._llmApiService = llmApiService;
    this.load();
  }

  init() {
    this.refresh();
  }

  exit() {}

  /**
   * The model of the mediator, and of each agent without one of its own.
   */
  get general(): Reactive<string> {
    return this._general;
  }

  /**
   * The models the user has chosen for specific agents.
   */
  get agents(): ReactiveMap<string> {
    return this._agents;
  }

  /**
   * The chat models installed in Ollama, without embedding models, which can't answer.
   */
  get installed(): Reactive<InstalledModel[]> {
    return this._installed;
  }

  get status(): Reactive<InstalledModelsStatus> {
    return this._status;
  }

  /**
   * @param agentId The id of an agent. Its sub-agents use the same one.
   * @returns The model that agent should use now
   */
  forAgent(agentId: string): string {
    return this._agents.get(agentId) ?? this._general.value;
  }

  /**
   * @returns If a model is installed, or true while that isn't known yet
   */
  isInstalled(name: string): boolean {
    return this._status.value !== "ready" || this._installed.value.some((model) => model.name === name);
  }

  setGeneral(name: string): void {
    this._general.set(name);
    this._storageService.setLocally(ModelService.GENERAL_STORAGE_KEY, name);
  }

  setForAgent(agentId: string, name: string): void {
    if (this._agents.get(agentId) !== name) {
      this._agents.add(agentId, name);
      this.saveAgents();
    }
  }

  /**
   * Makes an agent follow the general model again.
   */
  clearForAgent(agentId: string): void {
    this._agents.delete(agentId);
    this.saveAgents();
  }

  /**
   * Asks Ollama which models are installed.
   */
  async refresh(): Promise<void> {
    this._status.set("loading");
    try {
      const models = await this._llmApiService.listModels();
      this._installed.set(
        models
          .filter((model) => !ModelService.isEmbeddingModel(model.name, model.family))
          .map((model) => ({ name: model.name, size: model.size, parameterSize: model.parameterSize }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      this._status.set("ready");
    } catch (error) {
      console.warn("could not list the installed models", error);
      this._status.set("unreachable");
    }
  }

  private static isEmbeddingModel(name: string, family: string): boolean {
    return /embed/i.test(name) || /bert/i.test(family);
  }

  private saveAgents(): void {
    this._storageService.setLocally(ModelService.AGENTS_STORAGE_KEY, Object.fromEntries(this._agents.value));
  }

  private load(): void {
    const general = this._storageService.getLocally<unknown>(ModelService.GENERAL_STORAGE_KEY);
    if (this.isValid(general)) {
      this._general.set(general);
    }

    const agents = this._storageService.getLocally<unknown>(ModelService.AGENTS_STORAGE_KEY);
    if (typeof agents === "object" && agents !== null) {
      Object.entries(agents).forEach(([agentId, name]) => {
        if (this.isValid(name)) {
          this._agents.add(agentId, name);
        }
      });
    }
  }

  private isValid(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "" && value.length <= 200;
  }
}
