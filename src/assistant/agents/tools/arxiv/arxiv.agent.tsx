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
import { POPUP_TYPE } from "../../../../constants/popup.constants";
import { CITE_SOURCES_NOTE } from "../../../constants/llm.constants";
import { AbstractMediatorAccessibleAgent } from "../../../../interfaces/agents.interface";
import { HtmlUtils } from "../../../../services/html.service";
import { Reactive, useReactive } from "../../../../services/reactive.service";
import type {
  ArxivAgentResponse,
  ArxivPaper,
  OpenAlexBudget,
  OpenAlexWork,
  OpenAlexWorksResponse,
} from "../../../model/arxiv.model";
import { AgentTemperatureComponent } from "../../../components/temperatureSlider.component";
import { AgentsService } from "../../../services/agents.service";
import type { AssistantService } from "../../../services/assistant.service";
import type { SharedKeys } from "../../../services/sharedKeys.service";
import type { TemperatureService } from "../../../services/temperature.service";
import {
  ArxivPaperAnswerAgent,
  type ArxivPaperAnswerResponseMessage,
} from "./arxivPaperAnswer.agent";
import {
  ARXIV_MAX_PAPERS,
  ArxivSearchPapersAgent,
  type FindArxivPapersResponseMessage,
} from "./arxivSearchPapers.agent";

const EMBEDDING_INSTALL_COMMAND = "ollama pull nomic-embed-text";

// What OpenAlex charges for a search. Its budget is in dollars, so this turns the budget into searches.
const SEARCH_COST_USD = 0.001;

function formatResetTime(seconds: number): string {
  const amount = seconds < 3600 ? Math.max(1, Math.round(seconds / 60)) : Math.round(seconds / 3600);
  const unit = seconds < 3600 ? "minute" : "hour";
  return `in about ${amount} ${unit}${amount === 1 ? "" : "s"}`;
}

class OpenAlexLimitError extends Error {
  private _resetTime: string;

  /**
   * @param resetSeconds The value of the X-RateLimit-Reset header: the seconds until the limit resets
   */
  constructor(resetSeconds: string | null) {
    super("OpenAlex search limit reached");
    const seconds = Number(resetSeconds);
    this._resetTime = resetSeconds === null || !Number.isFinite(seconds)
      ? "within a day"
      : formatResetTime(seconds);
  }

  get resetTime(): string {
    return this._resetTime;
  }
}

export class ArxivAgent extends AbstractMediatorAccessibleAgent {
  private static readonly API_KEY_STORAGE_KEY = "arxivAgentOpenAlexApiKey";

  // arXiv's terms of use allow one request every 3 seconds, on a single connection.
  private static readonly ARXIV_REQUEST_INTERVAL_MS = 3000;

  private static readonly SEARCH_RESULTS = 6;
  private static readonly SEARCH_ABSTRACT_WORDS = 80;
  private static readonly PASSAGES_PER_PAPER = 6;
  private static readonly MIN_FULL_TEXT_WORDS = 200;
  private static readonly MIN_NAMED_TITLE_WORDS = 3;

  protected _agentUsageDescription = `
    /**
     * A function to search scientific papers on arXiv and answer a question from them.
     * @param topic The subject to search papers for, in a few keywords. If the user names a paper, use its exact full title here.
     * @param question The question the papers should answer. Be as clear with your intent as can be.
     * @returns The answers found per paper, with its title, authors and link. Only the listed papers were read, so name the paper each answer came from, and don't claim anything about other papers.
     * @example
     * arxivAgent("attention transformer models", "What problem does the attention mechanism solve?");
     * /
    arxivAgent(topic:string, question:string): string;
    `;
  protected _id = "arxivAgent";

  protected _jsonSchema = z.toJSONSchema(
    z.object({
      topic: z.string().describe("The subject to search papers for, in a few keywords. If the user names a paper, use its exact full title here."),
      question: z
        .string()
        .describe("The question the papers should answer. Be as clear with your intent as can be."),
    }),
  );

  protected _name = "arXiv agent";

  protected _description = `This is an agent that searches scientific papers on arXiv.
  It picks the papers most relevant to a question and answers from the parts of their text that match it.
  The agent will also list the papers it has used so that they can be traced for reference.`;

  // The arXiv search API can't be called from a browser, so papers are found through OpenAlex.
  private _openAlexWorksUrl = "https://api.openalex.org/works";
  private _openAlexArxivSourceId = "S4306400194";
  // Looking up a single work is free and returns the same budget headers, so any existing work will do.
  private _openAlexBudgetCheckWork = "W2626778328";
  private _arxivHtmlUrl = "https://arxiv.org/html/";
  private _arxivAbstractUrl = "https://arxiv.org/abs/";

  private _assistantService: AssistantService;

  private _apiKey: Reactive<string> = new Reactive<string>("");

  private _budget: Reactive<OpenAlexBudget> = new Reactive<OpenAlexBudget>({ status: "unknown" });
  private _budgetCheck: number = 0;
  private _budgetResetTimer: ReturnType<typeof setTimeout> | undefined;

  private _searchPapersAgent: ArxivSearchPapersAgent;
  private _paperAnswerAgent: ArxivPaperAnswerAgent;

  private _searchCache: Map<string, ArxivPaper[]> = new Map<string, ArxivPaper[]>();

  private _arxivQueue: Promise<unknown> = Promise.resolve();
  private _lastArxivRequestAt: number = 0;

  constructor(assistantService: AssistantService, agentsService: AgentsService) {
    super(agentsService);
    this._assistantService = assistantService;

    this._searchPapersAgent = new ArxivSearchPapersAgent(this._assistantService, this._id);
    this._paperAnswerAgent = new ArxivPaperAnswerAgent(this._assistantService, this._id);

    const savedApiKey = this._assistantService.storageService.getLocally<string>(
      ArxivAgent.API_KEY_STORAGE_KEY,
    );
    if (typeof savedApiKey === "string") {
      this._apiKey.set(savedApiKey);
    }

    // Agents live as long as the page, like these subscriptions. The budget depends on which key is used, which is
    // only known once the server has said whether it shares one.
    assistantService.sharedKeysService.ready.listener().subscribe(() => this.refreshBudget());
    assistantService.sharedKeysService.keys.listener().subscribe(() => this.refreshBudget());
  }

  /** A key shared by the computer running the assistant comes before the user's own. */
  get usesSharedKey(): boolean {
    return this._assistantService.sharedKeysService.keys.value.openalex;
  }

  get sharedKeys(): Reactive<SharedKeys> {
    return this._assistantService.sharedKeysService.keys;
  }

  /** The research server adds the shared key, so it never reaches this browser. */
  private get worksUrl(): string {
    return this.usesSharedKey ? `${this._assistantService.sharedKeysService.openAlexUrl}/works` : this._openAlexWorksUrl;
  }

  /** The user's own key, unless a shared key is used instead. */
  private get ownKey(): string {
    return this.usesSharedKey ? "" : this._apiKey.value;
  }

  get apiKey(): Reactive<string> {
    return this._apiKey;
  }

  get budget(): Reactive<OpenAlexBudget> {
    return this._budget;
  }

  get temperatureService(): TemperatureService {
    return this._assistantService.temperatureService;
  }

  /**
   * Stores the optional OpenAlex API key in this browser. An empty key removes it.
   * @param apiKey The OpenAlex API key
   */
  saveApiKey(apiKey: string): void {
    const trimmedKey = apiKey.trim();
    if (trimmedKey === "") {
      this._assistantService.storageService.removeLocally(ArxivAgent.API_KEY_STORAGE_KEY);
    } else {
      this._assistantService.storageService.setLocally(ArxivAgent.API_KEY_STORAGE_KEY, trimmedKey);
    }
    this._apiKey.set(trimmedKey);
    this.refreshBudget();
  }

  /**
   * Checks the remaining OpenAlex budget, which costs nothing.
   */
  private async refreshBudget(): Promise<void> {
    const check = ++this._budgetCheck;
    const key = this.ownKey === "" ? "" : `&api_key=${encodeURIComponent(this.ownKey)}`;

    try {
      const response = await this._assistantService.apiService.simpleGet(
        `${this.worksUrl}/${this._openAlexBudgetCheckWork}?select=id${key}`,
        { silent: true },
      );
      if (check === this._budgetCheck && !this.updateBudget(response)) {
        this._budget.set({ status: "unknown" });
      }
    } catch (error) {
      console.warn("could not check the OpenAlex budget", error);
      if (check === this._budgetCheck) {
        this._budget.set({ status: "unknown" });
      }
    }
  }

  /**
   * Reads the remaining budget from an OpenAlex response.
   * @returns If the response said anything about the budget
   */
  private updateBudget(response: Response): boolean {
    if (response.status === 401) {
      this._budget.set({ status: "invalidKey" });
      return true;
    }

    const remainingUsd = parseFloat(response.headers.get("X-RateLimit-Remaining-USD") ?? "");
    const limitUsd = parseFloat(response.headers.get("X-RateLimit-Limit-USD") ?? "");
    const resetSeconds = parseFloat(response.headers.get("X-RateLimit-Reset") ?? "");
    if (!Number.isFinite(remainingUsd) || !Number.isFinite(limitUsd) || !Number.isFinite(resetSeconds)) {
      return false;
    }

    this._budget.set({
      status: "loaded",
      remainingUsd: remainingUsd,
      limitUsd: limitUsd,
      resetsAt: Date.now() + resetSeconds * 1000,
    });

    clearTimeout(this._budgetResetTimer);
    this._budgetResetTimer = setTimeout(() => this.refreshBudget(), (resetSeconds + 5) * 1000);
    return true;
  }

  async main(input: string[]): Promise<string> {
    try {
      const { topic, question }: ArxivAgentResponse = JSON.parse(input[0]);
      if (!topic || !question) {
        return "The arXiv agent needs both a topic and a question.";
      }

      const papers = await this.searchPapers(topic, question);
      if (papers.length === 0) {
        return `No arXiv papers were found for: ${topic}`;
      }

      const selectedPapers = await this.selectPapers(papers, topic, question);
      if (selectedPapers.length === 0) {
        return `None of the arXiv papers found for "${topic}" are relevant to the question.`;
      }

      const answers = [];
      for (const paper of selectedPapers) {
        answers.push(await this.answerFromPaper(paper, question));
      }
      return JSON.stringify({
        note: `Only the papers listed here were read. Do not claim anything about papers that are not listed, including that they lack some information. ${CITE_SOURCES_NOTE}`,
        papers: answers,
      });
    } catch (error) {
      if (error instanceof OpenAlexLimitError) {
        return this.handleSearchLimit(error);
      }
      console.error("arxiv agent failed", error);
      return `The arXiv agent could not complete the search: ${error}`;
    }
  }

  private handleSearchLimit(error: OpenAlexLimitError): string {
    const keyAdvice = this._apiKey.value === "" && !this.usesSharedKey
      ? " A free OpenAlex API key in the arXiv agent's settings raises the limit."
      : "";
    this._assistantService.popupService.throwPopup(
      `The daily limit for arXiv searches has been reached. It resets ${error.resetTime}.${keyAdvice}`,
      POPUP_TYPE.ERROR,
      10000,
    );
    return `arXiv search is unavailable, because the daily search limit of OpenAlex has been reached. It resets ${error.resetTime}. Do not call this function again, and do not use askUser. Try another function that could know about this, and if you use respond, tell the user this.`;
  }

  private async searchPapers(topic: string, question: string): Promise<ArxivPaper[]> {
    const cacheKey = topic.trim().toLowerCase();
    const cachedPapers = this._searchCache.get(cacheKey);
    if (cachedPapers !== undefined) {
      return cachedPapers;
    }

    this._agentsService.currentStatus.set(`Search arXiv papers for: ${topic}`);

    const papers = new Map<string, ArxivPaper>();
    const addWorks = (works: OpenAlexWork[]) => {
      works.map((work) => this.toArxivPaper(work)).forEach((paper) => {
        if (paper !== undefined && !papers.has(paper.id)) {
          papers.set(paper.id, paper);
        }
      });
    };

    let relevanceError: unknown;
    try {
      addWorks(await this.fetchWorks(topic));
    } catch (error) {
      // When the limit is reached, a second search would only fail as well.
      if (error instanceof OpenAlexLimitError) {
        throw error;
      }
      relevanceError = error;
    }

    // A relevance search can miss well-known papers behind newer ones with similar titles, so the most cited are added.
    // Searches are limited, so this is skipped if the paper that was asked for has already been found.
    const foundNamedPaper =
      this.findPapersNamedIn(Array.from(papers.values()), `${topic} ${question}`).length > 0;
    let isComplete = relevanceError === undefined;
    if (!foundNamedPaper) {
      try {
        addWorks(await this.fetchWorks(topic, "cited_by_count:desc"));
      } catch (error) {
        if (relevanceError !== undefined) {
          throw relevanceError;
        }
        console.warn("citation search failed, using the relevance results", error);
        isComplete = false;
      }
    }

    const foundPapers = Array.from(papers.values());
    if (isComplete) {
      this._searchCache.set(cacheKey, foundPapers);
    }
    return foundPapers;
  }

  private async fetchWorks(topic: string, sort?: string): Promise<OpenAlexWork[]> {
    await this._assistantService.sharedKeysService.whenReady();
    const params = new URLSearchParams({
      filter: `locations.source.id:${this._openAlexArxivSourceId}`,
      search: topic,
      "per-page": `${ArxivAgent.SEARCH_RESULTS}`,
      select: "id,title,publication_year,cited_by_count,authorships,abstract_inverted_index,locations",
    });
    if (sort !== undefined) {
      params.append("sort", sort);
    }
    if (this.ownKey !== "") {
      params.append("api_key", this.ownKey);
    }

    const response = await this._assistantService.apiService.simpleGet(
      `${this.worksUrl}?${params.toString()}`,
    );
    this._budgetCheck++;
    this.updateBudget(response);

    if (response.status === 429) {
      throw new OpenAlexLimitError(response.headers.get("X-RateLimit-Reset"));
    }
    if (!response.ok) {
      throw new Error(`OpenAlex search returned status ${response.status}`);
    }

    const works: OpenAlexWorksResponse = await response.json();
    return works.results;
  }

  private toArxivPaper(work: OpenAlexWork): ArxivPaper | undefined {
    const arxivId = work.locations
      .flatMap((location) => [location.landing_page_url, location.pdf_url])
      .map((url) => url?.match(/arxiv\.org\/(?:abs|pdf)\/([^\s?#]+)/i)?.[1])
      .find((id) => id !== undefined);
    if (arxivId === undefined) {
      return undefined;
    }

    return {
      id: arxivId,
      title: work.title ?? arxivId,
      year: work.publication_year,
      citations: work.cited_by_count ?? 0,
      authors: work.authorships.map((authorship) => authorship.author.display_name),
      abstract: this.rebuildAbstract(work.abstract_inverted_index),
      url: `${this._arxivAbstractUrl}${arxivId}`,
    };
  }

  /**
   * OpenAlex returns abstracts as a map of each word to the positions it appears at.
   */
  private rebuildAbstract(invertedIndex: Record<string, number[]> | null): string {
    const words: string[] = [];
    Object.entries(invertedIndex ?? {}).forEach(([word, positions]) => {
      positions.forEach((position) => {
        words[position] = word;
      });
    });
    return words.filter((word) => word !== undefined).join(" ");
  }

  private async selectPapers(
    papers: ArxivPaper[],
    topic: string,
    question: string,
  ): Promise<ArxivPaper[]> {
    // A paper that is asked for by its exact title doesn't need a model to pick it.
    const namedPapers = this.findPapersNamedIn(papers, `${topic} ${question}`);
    if (namedPapers.length > 0) {
      return namedPapers.slice(0, ARXIV_MAX_PAPERS);
    }

    this._agentsService.currentStatus.set("Pick relevant arXiv papers");

    const candidates = papers.map((paper) => ({
      id: paper.id,
      title: paper.title,
      citations: paper.citations,
      abstract: paper.abstract.split(" ").slice(0, ArxivAgent.SEARCH_ABSTRACT_WORDS).join(" "),
    }));
    const result: FindArxivPapersResponseMessage = JSON.parse(
      await this._searchPapersAgent.main([JSON.stringify(candidates), topic, question]),
    );

    // The model may return ids that were not in the list, so only known papers are kept.
    return papers
      .filter((paper) => (result.ids ?? []).includes(paper.id))
      .slice(0, ARXIV_MAX_PAPERS);
  }

  private findPapersNamedIn(papers: ArxivPaper[], text: string): ArxivPaper[] {
    const normalize = (value: string) =>
      ` ${value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
    const normalizedText = normalize(text);

    return papers.filter((paper) => {
      const title = normalize(paper.title);
      const isSpecificTitle = title.trim().split(" ").length >= ArxivAgent.MIN_NAMED_TITLE_WORDS;
      return isSpecificTitle && normalizedText.includes(title);
    });
  }

  private async answerFromPaper(paper: ArxivPaper, question: string) {
    const passages = await this.findPassages(paper, question);

    this._agentsService.currentStatus.set(`Answer from paper: ${paper.title}`);
    const text = [`Title: ${paper.title}`, `Abstract: ${paper.abstract}`, ...passages].join("\n\n");
    const result: ArxivPaperAnswerResponseMessage = JSON.parse(
      await this._paperAnswerAgent.main([text, question]),
    );

    const id = this._assistantService.evidenceService.registerSource(
      `arXiv: ${paper.title}`,
      paper.url,
      text,
      result.answer ?? "",
      result.usedPassages ?? [],
    );

    const description = {
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      url: paper.url,
      basedOn: passages.length > 0 ? "full text" : "abstract only",
    };
    if (id === undefined) {
      return { ...description, answer: result.answer, note: "This could not be traced back to the text of the paper, so it may not be cited. Don't present it as coming from the paper." };
    }
    return { id: id, ...description, answer: `${result.answer} [${id}]` };
  }

  /**
   * @returns The passages of the paper most relevant to the question, or nothing if only the abstract can be used.
   */
  private async findPassages(paper: ArxivPaper, question: string): Promise<string[]> {
    const ragService = this._assistantService.ragService;

    try {
      if (!ragService.has(paper.id)) {
        this._agentsService.currentStatus.set(`Read paper: ${paper.title}`);
        const markdown = await this.fetchPaperText(paper);
        if (markdown === undefined) {
          return [];
        }
        this._agentsService.currentStatus.set(`Index paper: ${paper.title}`);
        await ragService.index(paper.id, markdown);
      }

      this._agentsService.currentStatus.set(`Search paper: ${paper.title}`);
      return await ragService.search(paper.id, question, ArxivAgent.PASSAGES_PER_PAPER);
    } catch (error) {
      console.error("arxiv full text could not be searched", error);
      this._assistantService.popupService.throwPopup(
        `Answering from the abstract only, because the full paper could not be searched. Is the embedding model installed? Run: ${EMBEDDING_INSTALL_COMMAND}`,
        POPUP_TYPE.ERROR,
        10000,
      );
      return [];
    }
  }

  /**
   * @returns The text of the paper as markdown, or undefined if arXiv has no usable HTML version.
   */
  private async fetchPaperText(paper: ArxivPaper): Promise<string | undefined> {
    const response = await this.nextArxivRequest(() =>
      this._assistantService.apiService.simpleGet(`${this._arxivHtmlUrl}${paper.id}`),
    );
    if (!response.ok) {
      return undefined;
    }

    const doc = new DOMParser().parseFromString(await response.text(), "text/html");
    const article = doc.querySelector("article");
    if (article === null) {
      return undefined;
    }

    this.prepareArticle(article);
    HtmlUtils.simplifyDocument(doc);
    const markdown = HtmlUtils.toMarkdown(article);

    return markdown.split(/\s+/).length >= ArxivAgent.MIN_FULL_TEXT_WORDS ? markdown : undefined;
  }

  /**
   * Keeps formulas as LaTeX, as code so that their characters aren't escaped, and removes the bibliography.
   */
  private prepareArticle(article: Element): void {
    article.querySelectorAll("math").forEach((math) => {
      const code = article.ownerDocument.createElement("code");
      code.textContent = math.getAttribute("alttext") ?? math.textContent;
      math.replaceWith(code);
    });
    article.querySelectorAll(".ltx_bibliography").forEach((section) => section.remove());
  }

  /**
   * Runs arXiv requests one at a time, with the required time in between.
   */
  private nextArxivRequest<T>(request: () => Promise<T>): Promise<T> {
    const result = this._arxivQueue.then(async () => {
      const waitTime = this._lastArxivRequestAt + ArxivAgent.ARXIV_REQUEST_INTERVAL_MS - Date.now();
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
      this._lastArxivRequestAt = Date.now();
      return request();
    });
    this._arxivQueue = result.catch(() => undefined);
    return result;
  }

  protected _settings = (<ArxivAgentSettings agent={this} />);
}

function describeBudget(budget: OpenAlexBudget, hasApiKey: boolean, sharedKey: boolean): string {
  if (budget.status === "invalidKey") {
    return sharedKey
      ? "The shared OpenAlex key on the computer running this assistant was not accepted by OpenAlex."
      : "This API key was not accepted by OpenAlex.";
  }
  if (budget.status === "unknown") {
    return "Could not check the remaining searches.";
  }

  const resetTime = formatResetTime(Math.max(0, (budget.resetsAt - Date.now()) / 1000));
  const owner = sharedKey
    ? "Using the shared key from the computer running this assistant."
    : hasApiKey ? "Using your API key." : "Shared by everyone on your network.";
  // Rounding errors in the dollar amounts could otherwise cost a search.
  const searches = Math.floor(budget.remainingUsd / SEARCH_COST_USD + 1e-9);
  if (searches === 0) {
    return `No questions left today. Resets ${resetTime}. ${owner}`;
  }

  // A question takes one search if the paper it names is found right away, and two otherwise.
  const fewestQuestions = Math.max(1, Math.floor(searches / 2));
  const questions = fewestQuestions === searches ? `${searches}` : `${fewestQuestions} to ${searches}`;
  return `About ${questions} question${searches === 1 ? "" : "s"} left today (${searches} search${searches === 1 ? "" : "es"}). Resets ${resetTime}. ${owner}`;
}

// eslint-disable-next-line react-refresh/only-export-components
function OpenAlexBudgetText(props: { agent: ArxivAgent }): ReactNode {
  const [budget, setBudget] = useState<OpenAlexBudget>(props.agent.budget.value);
  const [apiKey, setApiKey] = useState<string>(props.agent.apiKey.value);
  const [sharedKeys, setSharedKeys] = useState<SharedKeys>(props.agent.sharedKeys.value);

  useReactive(props.agent.budget, setBudget);
  useReactive(props.agent.apiKey, setApiKey);
  useReactive(props.agent.sharedKeys, setSharedKeys);

  return (
    <Typography
      variant="body2"
      sx={{ textAlign: "left", marginTop: "1em" }}
      data-testid="openalex-budget"
    >
      {describeBudget(budget, apiKey !== "", sharedKeys.openalex)}
    </Typography>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function ArxivAgentSettings(props: { agent: ArxivAgent }): ReactNode {
  const [enabled, setEnabled] = useState<boolean>(props.agent.enabled.value);
  const [apiKey, setApiKey] = useState<string>(props.agent.apiKey.value);
  const [sharedKeys, setSharedKeys] = useState<SharedKeys>(props.agent.sharedKeys.value);

  useReactive(props.agent.enabled, setEnabled);
  useReactive(props.agent.sharedKeys, setSharedKeys);

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <Typography variant="caption" sx={{ textAlign: "left" }}>
        {props.agent.description}
      </Typography>
      <Divider sx={{ margin: "0.5em" }} />
      <Alert severity="info" sx={{ textAlign: "left" }}>
        This agent works without an account. To read full papers it needs an embedding model; without one it answers from abstracts only. Install it with: <code>{EMBEDDING_INSTALL_COMMAND}</code>
      </Alert>
      <Typography variant="caption" sx={{ textAlign: "left", marginTop: "1em" }}>
        Paper searches go through OpenAlex, which has a daily limit. An optional <Link color="inherit" href="https://openalex.org/settings/api" target="_blank" rel="noopener noreferrer">free OpenAlex API key</Link> raises this. It is stored only in this browser and sent only to OpenAlex.
        {sharedKeys.openalex ? " The computer running this assistant shares its own key, which is used instead, so you don't need one." : ""}
      </Typography>
      <OpenAlexBudgetText agent={props.agent} />
      <TextField
        label="OpenAlex API key (optional)"
        type="password"
        size="small"
        autoComplete="new-password"
        sx={{ marginTop: "1em" }}
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
      />
      <Button
        variant="contained"
        sx={{ marginTop: "1em", alignSelf: "flex-start" }}
        onClick={() => props.agent.saveApiKey(apiKey)}
      >
        Save key
      </Button>
      <Divider sx={{ margin: "0.5em" }} />
      <Tooltip title="Enable the agent to be used as a tool." placement="left">
        <FormControlLabel
          control={
            <Checkbox
              checked={enabled}
              onChange={() => props.agent.toggleEnabled()}
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
