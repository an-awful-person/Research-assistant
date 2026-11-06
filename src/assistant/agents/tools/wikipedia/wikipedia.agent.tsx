import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  Link,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState, type ReactNode } from "react";
import z from "zod";
import { API_METHOD } from "../../../../constants/api.constants";
import { CITE_SOURCES_NOTE } from "../../../constants/llm.constants";
import { POPUP_TYPE } from "../../../../constants/popup.constants";
import { AbstractMediatorAccessibleAgent } from "../../../../interfaces/agents.interface";
import { HtmlUtils } from "../../../../services/html.service";
import { Reactive, useReactive } from "../../../../services/reactive.service";
import type {
  WikipediaAgentResponse,
  WikipediaAuthorizationResponse,
  WikipediaCredentials,
  WikipediaSearchPages,
  WikipediaSearchPagesResponse,
} from "../../../model/wikipedia.model";
import { AgentTemperatureComponent } from "../../../components/temperatureSlider.component";
import { AgentModelComponent } from "../../../components/modelSelect.component";
import { AgentsService } from "../../../services/agents.service";
import type { AssistantService } from "../../../services/assistant.service";
import type { SharedKeys } from "../../../services/sharedKeys.service";
import {
  WIKIPEDIA_MAX_SEARCHES,
  WikipediaSearchPagesAgent,
  type FindWikipediaPageResponseMessage,
} from "./wikipediaSearchPages.agent";
import {
  WikipediaSummaryPageAgent,
  type SummaryWikipediaPageResponseMessage,
} from "./wikipediaSummaryPage.agent";
import { LLMApiService } from "../../../services/llmApi.service";
import type { TemperatureService } from "../../../services/temperature.service";
import type { ModelService } from "../../../services/model.service";

type WikipediaAuthorizationHeaders = { Authorization: string };

export class WikipediaAgent extends AbstractMediatorAccessibleAgent {
  private static readonly CREDENTIALS_STORAGE_KEY = "wikipediaAgentCredentials";

  private static readonly SEARCH_RESULTS = 10;
  private static readonly PASSAGES_PER_PAGE = 6;
  private static readonly FALLBACK_WORDS = 1200;
  private static readonly SECTIONS_WITHOUT_ARTICLE_TEXT = [
    "references",
    "notes",
    "citations",
    "external links",
    "see also",
    "bibliography",
    "further reading",
    "footnotes",
    "sources",
    "works cited",
  ];

  /** Renew tokens slightly before they expire, so one can't expire during a search. */
  private static readonly TOKEN_EXPIRY_MARGIN_MS = 60_000;

  protected _agentUsageDescription = `
    /**
     * A function to search wikipedia for a topic.
     * @param topic The topic to search for.
     * @param question The question you want the topic to answer. This is to narrow down the information and to focus the intent of the wikipedia search. Be as clear with your intent as can be to prevent receiving the wrong information.

     * @returns The answers found per wikipedia page, with its title and link. Only the listed pages were read, so name the page each answer came from.
     * @example
     * wikipediaAgent("The Matrix", "What is the main character's name?");
     * /
    wikipediaAgent(topic:string, question:string): string;
    `;
  protected _id = "wikipediaAgent";

  protected _jsonSchema = z.toJSONSchema(
    z.object({
      topic: z.string().describe("The topic to search for"),
      question: z
        .string()
        .describe(
          "The question you want the topic to answer. This is to narrow down the information and to focus the intent of the wikipedia search. Be as clear with your intent as can be to prevent receiving the wrong information.",
        ),
    }),
  );

  protected _name = "Wikipedia agent";

  protected _description = `This is an agent that can search wikipedia using an API. 
  It will search a term along with a question. 
  The agent will return the answer to the question to the best of its ability. 
  The agent will also list the pages it has used for an answer so that they can be traced for reference.`;

  private _wikipediaSearchPageUrl = `https://api.wikimedia.org/core/v1/wikipedia/en/search/page`;
  private _wikipediaPageUrl = `https://en.wikipedia.org/w/rest.php/v1/page/`;
  private _wikipediaArticleUrl = `https://en.wikipedia.org/wiki/`;
  private _wikipediaAuthorizeUrl = `https://meta.wikimedia.org/w/rest.php/oauth2/access_token`;

  private _assistantService: AssistantService;

  private _credentials: Reactive<WikipediaCredentials | undefined> =
    new Reactive<WikipediaCredentials | undefined>(undefined);

  private _accessToken: Reactive<string> = new Reactive<string>("");
  private _accessTokenExpiresAt: number = 0;

  private _wikipediaSearchPagesAgent: WikipediaSearchPagesAgent;
  private _wikipediaSummaryPageAgent: WikipediaSummaryPageAgent;

  constructor(
    assistantService: AssistantService,
    agentsService: AgentsService,
  ) {
    super(agentsService, false);
    this._assistantService = assistantService;
    this._agentsService = agentsService;

    this._wikipediaSearchPagesAgent = new WikipediaSearchPagesAgent(
      this._assistantService,
      this._id,
    );

    this._wikipediaSummaryPageAgent = new WikipediaSummaryPageAgent(
      this._assistantService,
      this._id,
    );

    this.loadCredentials();
    // Agents live as long as the page, like this subscription.
    assistantService.sharedKeysService.keys.listener().subscribe(() => this.followSharedKey());
    assistantService.sharedKeysService.ready.listener().subscribe(() => this.followSharedKey());
  }

  /** A key shared by the computer running the assistant comes before the user's own. */
  get usesSharedKey(): boolean {
    return this._assistantService.sharedKeysService.keys.value.wikipedia;
  }

  get sharedKeys(): Reactive<SharedKeys> {
    return this._assistantService.sharedKeysService.keys;
  }

  private followSharedKey(): void {
    this.resetAccessToken();
    if (this.usesSharedKey) {
      this._enabled.set(!this._agentsService.isDisabledByUser(this.id));
    } else if (this._credentials.value === undefined) {
      this._enabled.set(false);
    } else {
      this.requestAutorization();
    }
    this._agentsService.refreshAgentDescriptions();
  }

  get temperatureService(): TemperatureService {
    return this._assistantService.temperatureService;
  }

  get modelService(): ModelService {
    return this._assistantService.modelService;
  }

  get canBeEnabled(): boolean {
    return this.usesSharedKey || this._credentials.value !== undefined;
  }

  get credentials(): Reactive<WikipediaCredentials | undefined> {
    return this._credentials;
  }

  async main(input: string[]): Promise<string> {
    try {
      const { topic, question }: WikipediaAgentResponse = JSON.parse(input[0]);
      if (!topic || !question) {
        return "The Wikipedia agent needs both a topic and a question.";
      }

      await this._assistantService.sharedKeysService.whenReady();
      const accessToken = await this.getValidAccessToken();
      if (accessToken === "") {
        return this.usesSharedKey
          ? "Could not authorize with Wikipedia: the shared Wikipedia key on the computer running this assistant was not accepted. Tell the user, so the owner of that computer can check it."
          : "Could not authorize with Wikipedia. Ask the user to check the client ID and client secret in the Wikipedia agent settings.";
      }
      const authorization = { Authorization: `Bearer ${accessToken}` };

      const pages = await this.searchPages(topic, authorization);
      if (pages.length === 0) {
        return `No Wikipedia pages were found for: ${topic}`;
      }

      const selectedPages = await this.selectPages(pages, topic, question);
      if (selectedPages.length === 0) {
        return `None of the Wikipedia pages found for "${topic}" are relevant to the question.`;
      }

      const answers = [];
      for (const page of selectedPages) {
        answers.push(await this.answerFromPage(page, question, authorization));
      }
      return JSON.stringify({
        note: `Only the pages listed here were read. Do not claim anything about pages that are not listed. ${CITE_SOURCES_NOTE}`,
        pages: answers,
      });
    } catch (error) {
      console.error("wikipedia agent failed", error);
      return `The Wikipedia agent could not complete the search: ${error}`;
    }
  }

  /**
   * Stores the user's credentials in this browser, enables the agent and requests an access token.
   * @param clientId The Wikimedia client ID
   * @param clientSecret The Wikimedia client secret
   */
  saveCredentials(clientId: string, clientSecret: string): void {
    const credentials: WikipediaCredentials = {
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    };
    if (credentials.clientId === "" || credentials.clientSecret === "") {
      return;
    }

    this._assistantService.storageService.setLocally(
      WikipediaAgent.CREDENTIALS_STORAGE_KEY,
      credentials,
    );
    this.applyCredentials(credentials);
    // Saving credentials turns the agent on, which an earlier choice to disable it shouldn't undo on the next visit.
    this._agentsService.forgetEnabled(this.id);
  }

  /**
   * Removes the user's credentials from this browser and disables the agent.
   */
  clearCredentials(): void {
    this._assistantService.storageService.removeLocally(
      WikipediaAgent.CREDENTIALS_STORAGE_KEY,
    );
    this._credentials.set(undefined);
    if (!this.usesSharedKey) {
      this.resetAccessToken();
      this._enabled.set(false);
    }
  }

  private loadCredentials(): void {
    const credentials =
      this._assistantService.storageService.getLocally<WikipediaCredentials>(
        WikipediaAgent.CREDENTIALS_STORAGE_KEY,
      );
    if (credentials?.clientId && credentials?.clientSecret) {
      this.applyCredentials(credentials);
    }
  }

  private applyCredentials(credentials: WikipediaCredentials): void {
    this._credentials.set(credentials);
    this.resetAccessToken();
    this._enabled.set(true);
    // Until the server has said whether it shares a key, the user's own isn't used.
    if (this._assistantService.sharedKeysService.ready.value && !this.usesSharedKey) {
      this.requestAutorization();
    }
  }

  private resetAccessToken(): void {
    this._accessToken.set("");
    this._accessTokenExpiresAt = 0;
  }

  /**
   * @returns The current access token, or a new one if it is missing or expired. Empty if authorization failed.
   */
  private getValidAccessToken(): Promise<string> {
    const isValid =
      this._accessToken.value !== "" &&
      Date.now() <
        this._accessTokenExpiresAt - WikipediaAgent.TOKEN_EXPIRY_MARGIN_MS;
    return isValid
      ? Promise.resolve(this._accessToken.value)
      : this.requestAutorization();
  }

  private requestAutorization(): Promise<string> {
    return this.usesSharedKey ? this.requestSharedToken() : this.requestOwnToken();
  }

  /**
   * The research server turns the shared key into a token, so the key itself stays on that computer.
   */
  private requestSharedToken(): Promise<string> {
    return this._assistantService.apiService
      .simpleGet(this._assistantService.sharedKeysService.wikipediaTokenUrl, { silent: true })
      .then(async (response) => {
        const json: { accessToken?: string; expiresIn?: number } = await response.json();
        if (!response.ok || !this.usesSharedKey) {
          return "";
        }
        this._accessToken.set(json.accessToken ?? "");
        this._accessTokenExpiresAt = Date.now() + (json.expiresIn ?? 0) * 1000;
        return this._accessToken.value;
      })
      .catch((error) => {
        console.error("the shared wikipedia key could not be used", error);
        return "";
      });
  }

  private requestOwnToken(): Promise<string> {
    const credentials = this._credentials.value;
    if (credentials === undefined) {
      return Promise.resolve("");
    }

    const params = new URLSearchParams();
    params.append("client_id", credentials.clientId);
    params.append("client_secret", credentials.clientSecret);
    params.append("grant_type", "client_credentials");

    const options = {
      method: API_METHOD.POST,
      formData: params.toString(),
      formDataRaw: true,
      contentType: "application/x-www-form-urlencoded",
    };

    return this._assistantService.apiService
      .rawApiCall(`${this._wikipediaAuthorizeUrl}`, options)
      .then((response) => response.json())
      .then((json: Partial<WikipediaAuthorizationResponse>) => {
        // The credentials were changed or removed while this request was running.
        if (credentials !== this._credentials.value) {
          return this._accessToken.value;
        }
        this._accessToken.set(json.access_token ?? "");
        this._accessTokenExpiresAt = Date.now() + (json.expires_in ?? 0) * 1000;
        return this._accessToken.value;
      })
      .catch((error) => {
        console.error("wikipedia authorization failed", error);
        return "";
      });
  }

  private async searchPages(
    topic: string,
    authorization: WikipediaAuthorizationHeaders,
  ): Promise<WikipediaSearchPages[]> {
    this._agentsService.currentStatus.set(`Search wikipedia pages for: ${topic}`);

    const response = await this._assistantService.apiService.apiCall<WikipediaSearchPagesResponse>(
      `${this._wikipediaSearchPageUrl}?q=${encodeURIComponent(topic)}&limit=${WikipediaAgent.SEARCH_RESULTS}`,
      undefined,
      authorization,
    );
    if (!Array.isArray(response.pages)) {
      throw new Error("Wikipedia search did not return any pages");
    }
    return response.pages;
  }

  private async selectPages(
    pages: WikipediaSearchPages[],
    topic: string,
    question: string,
  ): Promise<WikipediaSearchPages[]> {
    // A page that is asked for by its exact title doesn't need a model to pick it.
    const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const namedPage = pages.find((page) => normalize(page.title) === normalize(topic));
    if (namedPage !== undefined) {
      return [namedPage];
    }

    this._agentsService.currentStatus.set("Pick relevant wikipedia pages");
    const candidates = pages.map((page) => ({
      key: page.key,
      title: page.title,
      description: page.description,
    }));
    const result: FindWikipediaPageResponseMessage = JSON.parse(
      await this._wikipediaSearchPagesAgent.main([JSON.stringify(candidates), topic, question]),
    );

    // The model may return keys that were not in the list, such as its answer for no matching page.
    return pages
      .filter((page) => (result.keys ?? []).includes(page.key))
      .slice(0, WIKIPEDIA_MAX_SEARCHES);
  }

  private async answerFromPage(
    page: WikipediaSearchPages,
    question: string,
    authorization: WikipediaAuthorizationHeaders,
  ) {
    const url = `${this._wikipediaArticleUrl}${page.key}`;
    const answer = { title: page.title, url: url };

    let text: { content: string; basedOn: string };
    try {
      text = await this.findText(page, question, authorization);
    } catch (error) {
      console.error("wikipedia page could not be read", error);
      return { ...answer, basedOn: "nothing", answer: `The page "${page.title}" could not be read.` };
    }

    this._agentsService.currentStatus.set(`Answer from wikipedia page: ${page.title}`);
    const result: SummaryWikipediaPageResponseMessage = JSON.parse(
      await this._wikipediaSummaryPageAgent.main([text.content, question]),
    );

    const id = this._assistantService.evidenceService.registerSource(
      `Wikipedia: ${page.title}`,
      url,
      text.content,
      result.summary ?? "",
      result.originalParagraphs ?? [],
    );

    if (id === undefined) {
      return {
        ...answer,
        basedOn: text.basedOn,
        answer: result.summary,
        note: "This could not be traced back to the text of the page, so it may not be cited. Don't present it as coming from the page.",
      };
    }
    return { id: id, ...answer, basedOn: text.basedOn, answer: `${result.summary} [${id}]` };
  }

  /**
   * @returns The most relevant passages of a page, or its start if they can't be searched
   */
  private async findText(
    page: WikipediaSearchPages,
    question: string,
    authorization: WikipediaAuthorizationHeaders,
  ): Promise<{ content: string; basedOn: string }> {
    const ragService = this._assistantService.ragService;
    const documentId = `wikipedia:${page.key}`;
    const markdown = ragService.has(documentId)
      ? undefined
      : await this.fetchPageText(page.key, authorization);

    try {
      if (markdown !== undefined) {
        this._agentsService.currentStatus.set(`Index wikipedia page: ${page.title}`);
        await ragService.index(documentId, markdown);
      }
      this._agentsService.currentStatus.set(`Search wikipedia page: ${page.title}`);
      const passages = await ragService.search(documentId, question, WikipediaAgent.PASSAGES_PER_PAGE);
      return {
        content: [`Title: ${page.title}`, ...passages].join("\n\n"),
        basedOn: "relevant passages",
      };
    } catch (error) {
      console.error("wikipedia page could not be searched", error);
      this._assistantService.popupService.throwPopup(
        `Answering from the start of the page only, because the full page could not be searched. Is the embedding model installed? Run: ollama pull ${LLMApiService.DEFAULT_EMBEDDING_MODEL}`,
        POPUP_TYPE.ERROR,
        10000,
      );
      const start = (markdown ?? (await this.fetchPageText(page.key, authorization)))
        .split(/\s+/)
        .slice(0, WikipediaAgent.FALLBACK_WORDS)
        .join(" ");
      return { content: `Title: ${page.title}\n\n${start}`, basedOn: "start of the page" };
    }
  }

  private async fetchPageText(
    key: string,
    authorization: WikipediaAuthorizationHeaders,
  ): Promise<string> {
    this._agentsService.currentStatus.set(`Collect wikipedia page: ${key}`);

    const response = await this._assistantService.apiService.rawApiCall(
      `${this._wikipediaPageUrl}${encodeURIComponent(key)}/html`,
      undefined,
      authorization,
    );
    if (!response.ok) {
      throw new Error(`Wikipedia returned status ${response.status} for ${key}`);
    }

    const doc = new DOMParser().parseFromString(await response.text(), "text/html");
    this.removeNonArticleContent(doc);
    this.tablesToText(doc);
    doc.querySelectorAll("a").forEach((link) => link.replaceWith(link.textContent ?? ""));
    HtmlUtils.simplifyDocument(doc);

    const markdown = HtmlUtils.toMarkdown(doc.body);
    if (markdown.trim() === "") {
      throw new Error(`The Wikipedia page ${key} has no text`);
    }
    return markdown;
  }

  /**
   * Removes what doesn't help to answer questions: references, navigation, edit links and so on.
   */
  private removeNonArticleContent(doc: Document): void {
    doc
      .querySelectorAll(
        "style, script, link, meta, figure, .mw-editsection, sup.reference, .reference, .navbox, .navbox-styles, .hatnote, .metadata, .ambox, .sidebar, .mw-references-wrap, ol.references, .reflist, .portalbox, .noprint, [role=navigation], .shortdescription",
      )
      .forEach((element) => element.remove());

    doc.querySelectorAll("section").forEach((section) => {
      const heading = section.querySelector("h2")?.textContent?.trim().toLowerCase() ?? "";
      if (WikipediaAgent.SECTIONS_WITHOUT_ARTICLE_TEXT.includes(heading)) {
        section.remove();
      }
    });
  }

  /**
   * Infoboxes and tables often hold the facts that are asked for, so each row is kept as a line of text.
   */
  private tablesToText(doc: Document): void {
    doc.querySelectorAll("table").forEach((table) => {
      table.querySelectorAll("tr").forEach((row) => {
        const cells = Array.from(row.children)
          .map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "")
          .filter((cell) => cell !== "");
        if (cells.length > 0) {
          const line = doc.createElement("p");
          line.textContent = cells.join(" | ");
          table.before(line);
        }
      });
      table.remove();
    });
  }

  protected _settings = (<WikipediaAgentSettings agent={this} />);
}

// eslint-disable-next-line react-refresh/only-export-components
function WikipediaAgentSettings(props: {
  agent: WikipediaAgent;
}): ReactNode {
  const [enabled, setEnabled] = useState<boolean>(props.agent.enabled.value);
  const [credentials, setCredentials] = useState<WikipediaCredentials | undefined>(props.agent.credentials.value);
  const [clientId, setClientId] = useState<string>(props.agent.credentials.value?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState<string>(props.agent.credentials.value?.clientSecret ?? "");

  function check() {
    props.agent.toggleEnabled();
  }

  function removeCredentials() {
    props.agent.clearCredentials();
    setClientId("");
    setClientSecret("");
  }

  const [sharedKeys, setSharedKeys] = useState<SharedKeys>(props.agent.sharedKeys.value);

  useReactive(props.agent.enabled, setEnabled);
  useReactive(props.agent.credentials, setCredentials);
  useReactive(props.agent.sharedKeys, setSharedKeys);

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <Typography variant="caption" sx={{ textAlign: "left" }}>
        {props.agent.description}
      </Typography>
      <Divider sx={{margin:'0.5em'}}/>
      {sharedKeys.wikipedia ? (
        <Alert severity="success" sx={{ textAlign: "left" }} data-testid="wikipedia-credentials-message">
          Using the shared Wikipedia key from the computer running this assistant, so you don't need your own.
          A key you enter below is only used when there is no shared key.
        </Alert>
      ) : credentials === undefined ? (
        <Alert severity="info" sx={{ textAlign: "left" }} data-testid="wikipedia-credentials-message">
          The Wikipedia agent stays disabled until you save your own Wikimedia client ID and client secret.
          To get them, <Link color="inherit" href="https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose/oauth2" target="_blank" rel="noopener noreferrer">register an OAuth 2.0 app</Link> and
          select the "Client credentials" grant type. They are stored only in this browser and sent only to Wikimedia.
        </Alert>
      ) : (
        <Alert severity="success" sx={{ textAlign: "left" }} data-testid="wikipedia-credentials-message">
          Your Wikimedia credentials are saved in this browser and sent only to Wikimedia. Remove them when you finish on a shared computer.
        </Alert>
      )}
      <TextField
        label="Client ID"
        size="small"
        autoComplete="off"
        sx={{ marginTop: "1em" }}
        value={clientId}
        onChange={(event) => setClientId(event.target.value)}
      />
      <TextField
        label="Client secret"
        type="password"
        size="small"
        autoComplete="new-password"
        sx={{ marginTop: "1em" }}
        value={clientSecret}
        onChange={(event) => setClientSecret(event.target.value)}
      />
      <Box sx={{ display: "flex", flexDirection: "row", gap: "0.5em", marginTop: "1em" }}>
        <Button
          variant="contained"
          disabled={clientId.trim() === "" || clientSecret.trim() === ""}
          onClick={() => props.agent.saveCredentials(clientId, clientSecret)}
        >
          Save
        </Button>
        {credentials !== undefined && (
          <Button onClick={removeCredentials}>Remove</Button>
        )}
      </Box>
      <Divider sx={{margin:'0.5em'}}/>
      <Tooltip title="Enable the agent to be used as a tool." placement="left">
      <FormControlLabel
        control={
          <Checkbox
            checked={enabled}
            disabled={credentials === undefined && !sharedKeys.wikipedia}
            onChange={() => {
              check();
            }}
          />
        }
        label={"Enable agent"}
      />
      </Tooltip>
      <Divider sx={{ margin: "0.5em" }} />
      <AgentModelComponent service={props.agent.modelService} agentId={props.agent.id} />
      <AgentTemperatureComponent service={props.agent.temperatureService} agentId={props.agent.id} />
    </Box>
  );
}
