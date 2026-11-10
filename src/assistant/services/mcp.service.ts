import { environment } from "../../constants/environment.constants";
import { type Service } from "../../interfaces/service.interface";
import { Reactive } from "../../services/reactive.service";
import { McpToolAgent } from "../agents/tools/mcp/mcpTool.agent";
import type { McpApproval, McpKeyProblem, McpResult, McpServer, McpTool, PersonalMcpServer, RegistryServer } from "../model/extensions.model";
import type { AssistantService } from "./assistant.service";
import { headerValueFor, parseRegistry, searchWord } from "./mcpRegistry";
import { toolId } from "./mcpSchema";
import { Subscription } from "rxjs";

const STORAGE_KEY = "mcpPersonalServers";
const REGISTRY = "https://registry.modelcontextprotocol.io/v0.1/servers";

/**
 * Connects the tools of MCP servers to the mediator: servers the owner of this computer listed, and remote servers
 * people added themselves. Tools start switched off, and any tool that can change things asks first.
 */
export class McpService implements Service {
  private _assistantService: AssistantService;
  private _subscriptions: Subscription[] = [];
  private _servers: Reactive<McpServer[]> = new Reactive<McpServer[]>([]);
  private _personal: Reactive<PersonalMcpServer[]> = new Reactive<PersonalMcpServer[]>([]);
  private _configProblem: Reactive<string | undefined> = new Reactive<string | undefined>(undefined);
  private _approval: Reactive<McpApproval | undefined> = new Reactive<McpApproval | undefined>(undefined);
  private _autoConfirmed: Reactive<string[]> = new Reactive<string[]>([]);
  private _settle: ((allowed: boolean) => void) | undefined = undefined;
  private _keyProblem: Reactive<McpKeyProblem | undefined> = new Reactive<McpKeyProblem | undefined>(undefined);

  constructor(assistantService: AssistantService) {
    this._assistantService = assistantService;
  }

  init(): void {
    const stored = this._assistantService.storageService.getLocally<unknown>(STORAGE_KEY);
    this._personal.set(Array.isArray(stored) ? (stored as PersonalMcpServer[]).filter((server) => typeof server?.id === "string" && typeof server?.url === "string") : []);
    // Auto-confirm only ever lasts for one conversation.
    this._subscriptions.push(this._assistantService.conversationsService.activeId.listener().subscribe(() => this.clearAutoConfirm()));
    void this.refresh();
  }

  exit(): void {
    this._subscriptions.forEach((subscription) => subscription.unsubscribe());
    this._subscriptions = [];
  }

  get servers(): Reactive<McpServer[]> {
    return this._servers;
  }

  get personal(): Reactive<PersonalMcpServer[]> {
    return this._personal;
  }

  get configProblem(): Reactive<string | undefined> {
    return this._configProblem;
  }

  /** The call that is waiting for the user's answer. */
  get approval(): Reactive<McpApproval | undefined> {
    return this._approval;
  }

  /** The last tool that couldn't be used because its server wants a key. */
  get keyProblem(): Reactive<McpKeyProblem | undefined> {
    return this._keyProblem;
  }

  dismissKeyProblem(): void {
    this._keyProblem.set(undefined);
  }

  private clearKeyProblem(serverId: string): void {
    if (this._keyProblem.value?.serverId === serverId) {
      this._keyProblem.set(undefined);
    }
  }

  get autoConfirmed(): Reactive<string[]> {
    return this._autoConfirmed;
  }

  private get api() {
    return `${environment.researchApiUrl}/mcp`;
  }

  /** Asks every server what it offers, and makes its tools available. */
  async refresh(): Promise<void> {
    const owner = await this.loadOwnerServers();
    const personal = await Promise.all(this._personal.value.map((server) => this.loadPersonalServer(server)));
    const servers = [...owner, ...personal];
    this._servers.set(servers);

    const agentsService = this._assistantService.mediatorService.agentsService;
    const used = new Set<string>();
    agentsService.replaceExtensionAgents(
      servers.flatMap((server) =>
        server.tools.map((tool) => new McpToolAgent(this._assistantService, agentsService, server, tool, toolId(server.origin, server.name, tool.name, used))),
      ),
    );
  }

  private async loadOwnerServers(): Promise<McpServer[]> {
    try {
      const response = await this._assistantService.apiService.simpleGet(`${this.api}/servers`, { silent: true });
      if (!response.ok) return [];
      const body = (await response.json()) as { servers: Omit<McpServer, "id" | "origin">[]; problem?: string };
      this._configProblem.set(body.problem);
      return body.servers.map((server) => ({ ...server, id: `owner:${server.name}`, origin: "owner" }));
    } catch (error) {
      console.error("the MCP servers could not be read", error);
      return [];
    }
  }

  /** @returns The server with its tools, or with what is wrong */
  private async loadPersonalServer(server: PersonalMcpServer): Promise<McpServer> {
    const view: McpServer = { id: `personal:${server.id}`, name: server.name, origin: "personal", shared: false, ready: false, tools: [] };
    try {
      const response = await this._assistantService.apiService.silentPost(`${this.api}/personal/tools`, this.credentials(server));
      const body = (await response.json()) as { tools?: McpTool[]; error?: string };
      return response.ok ? { ...view, ready: true, tools: body.tools ?? [] } : { ...view, problem: body.error ?? "It could not be reached." };
    } catch {
      return { ...view, problem: "The research server could not be reached." };
    }
  }

  private credentials(server: PersonalMcpServer) {
    return { url: server.url, headerName: server.headerName, headerValue: headerValueFor(server.headerName, server.headerValue) };
  }

  /**
   * Adds someone's own remote server, if it can be reached.
   * @returns What is wrong, if it can't be added
   */
  async addPersonal(input: Omit<PersonalMcpServer, "id">): Promise<string | undefined> {
    const server: PersonalMcpServer = { ...input, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` };
    const view = await this.loadPersonalServer(server);
    if (!view.ready) {
      return view.problem ?? "It could not be reached.";
    }
    this.savePersonal([...this._personal.value, server]);
    await this.refresh();
    return undefined;
  }

  /**
   * Sets or removes the key of someone's own server, if the server accepts it.
   * @returns What is wrong, if it couldn't be saved
   */
  async updatePersonalKey(id: string, headerName: string, headerValue: string): Promise<string | undefined> {
    const current = this._personal.value.find((server) => server.id === id);
    if (current === undefined) {
      return "This server was removed.";
    }
    const updated: PersonalMcpServer = { ...current, headerName: headerName.trim() || "Authorization", headerValue: headerValue.trim() };
    const view = await this.loadPersonalServer(updated);
    if (!view.ready) {
      return view.problem ?? "It could not be reached.";
    }
    this.savePersonal(this._personal.value.map((server) => (server.id === id ? updated : server)));
    this.clearKeyProblem(`personal:${id}`);
    await this.refresh();
    return undefined;
  }

  async removePersonal(id: string): Promise<void> {
    this.clearKeyProblem(`personal:${id}`);
    this.savePersonal(this._personal.value.filter((server) => server.id !== id));
    await this.refresh();
  }

  private savePersonal(servers: PersonalMcpServer[]): void {
    this._personal.set(servers);
    this._assistantService.storageService.setLocally(STORAGE_KEY, servers);
  }

  /**
   * Searches the official MCP registry.
   * @returns The servers found
   * @throws Error with what went wrong
   */
  async searchRegistry(query: string): Promise<RegistryServer[]> {
    const word = searchWord(query);
    if (word === undefined) {
      throw new Error("Use a word of at least 3 letters.");
    }
    const params = new URLSearchParams({ search: word, limit: "100", version: "latest" });
    let response: Response;
    try {
      response = await this._assistantService.apiService.simpleGet(`${REGISTRY}?${params.toString()}`, { silent: true });
    } catch {
      throw new Error("The MCP registry couldn't be reached.");
    }
    if (!response.ok) {
      throw new Error("The MCP registry couldn't be searched just now.");
    }
    return parseRegistry(await response.json(), query);
  }

  /**
   * Checks if a server works right now, and updates the list if what it offers has changed.
   * A server can pass this and still refuse its key, because many only check a key when a tool runs.
   */
  async testServer(server: McpServer): Promise<{ ok: boolean; ms: number; toolCount: number; problem?: string }> {
    const started = performance.now();
    let result: { ok: boolean; toolCount: number; problem?: string };
    try {
      if (server.origin === "owner") {
        const response = await this._assistantService.apiService.silentPost(`${this.api}/test`, { server: server.name });
        const body = (await response.json()) as { ok?: boolean; toolCount?: number; problem?: string; error?: string };
        result = response.ok ? { ok: body.ok === true, toolCount: body.toolCount ?? 0, ...(body.problem !== undefined ? { problem: body.problem } : {}) } : { ok: false, toolCount: 0, problem: body.error ?? "It could not be tested." };
      } else {
        const personal = this._personal.value.find((known) => `personal:${known.id}` === server.id);
        if (personal === undefined) {
          return { ok: false, ms: 0, toolCount: 0, problem: "This server was removed." };
        }
        const view = await this.loadPersonalServer(personal);
        result = { ok: view.ready, toolCount: view.tools.length, ...(view.problem !== undefined ? { problem: view.problem } : {}) };
      }
    } catch {
      result = { ok: false, toolCount: 0, problem: "The research server could not be reached." };
    }
    const ms = Math.round(performance.now() - started);
    if (result.ok !== server.ready || result.toolCount !== server.tools.length || result.problem !== server.problem) {
      await this.refresh();
    }
    return { ...result, ms };
  }

  /** Runs a tool with what the user typed. The result is only for the user: nothing goes to the model. */
  tryTool(server: McpServer, tool: string, values: Record<string, unknown>): Promise<McpResult> {
    return this.call(server, tool, values, true);
  }

  /**
   * @param quiet Don't show a warning above the question box, because the caller shows the result itself
   * @returns What the tool returned. A failure becomes an error result, which the mediator can respond to.
   */
  async call(server: McpServer, tool: string, values: Record<string, unknown>, quiet: boolean = false): Promise<McpResult> {
    const personal = server.origin === "personal" ? this._personal.value.find((known) => `personal:${known.id}` === server.id) : undefined;
    if (server.origin === "personal" && personal === undefined) {
      return { text: "This server was removed.", isError: true };
    }
    try {
      const response = personal !== undefined
        ? await this._assistantService.apiService.silentPost(`${this.api}/personal/call`, { ...this.credentials(personal), tool, arguments: values })
        : await this._assistantService.apiService.silentPost(`${this.api}/call`, { server: server.name, tool, arguments: values });
      const body = (await response.json()) as McpResult & { error?: string };
      const result: McpResult = response.ok ? body : { text: body.error ?? "The tool could not be used.", isError: true, needsKey: response.status === 401 };
      if (!result.isError) {
        this.clearKeyProblem(server.id);
      } else if (result.needsKey && !quiet) {
        this._keyProblem.set({ serverId: server.id, serverName: server.name, origin: server.origin, message: result.text.slice(0, 300) });
      }
      return result;
    } catch {
      return { text: "The research server could not be reached.", isError: true };
    }
  }

  /**
   * Waits for the user, unless this tool is auto-confirmed in this conversation. Only a click can answer this.
   * @param values Exactly what will be sent, which is what the user sees
   * @returns If the call is allowed
   */
  approve(agentId: string, label: string, values: Record<string, unknown>): Promise<boolean> {
    if (this._autoConfirmed.value.includes(agentId)) {
      return Promise.resolve(true);
    }
    this._assistantService.mediatorService.agentsService.currentStatus.set("Waiting for your approval");
    return new Promise<boolean>((resolve) => {
      this._settle = resolve;
      this._approval.set({ agentId, label, values });
    });
  }

  /** The user's answer to the call that is waiting. */
  answer(allowed: boolean, autoConfirm: boolean): void {
    const approval = this._approval.value;
    if (approval === undefined) {
      return;
    }
    if (allowed && autoConfirm && !this._autoConfirmed.value.includes(approval.agentId)) {
      this._autoConfirmed.set([...this._autoConfirmed.value, approval.agentId]);
    }
    const settle = this._settle;
    this._settle = undefined;
    this._approval.set(undefined);
    settle?.(allowed);
  }

  stopAutoConfirm(agentId: string): void {
    this._autoConfirmed.set(this._autoConfirmed.value.filter((id) => id !== agentId));
  }

  private clearAutoConfirm(): void {
    if (this._autoConfirmed.value.length > 0) {
      this._autoConfirmed.set([]);
    }
  }
}
