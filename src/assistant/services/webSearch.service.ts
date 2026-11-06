import { environment } from "../../constants/environment.constants";
import type { Service } from "../../interfaces/service.interface";
import type { ApiService } from "../../services/api.service";
import { Reactive } from "../../services/reactive.service";
import type { StorageService } from "../../services/storage.service";

export class ResearchServerUnavailable extends Error {
  constructor() {
    super("The research server can't be reached. Start the application with: npm start");
  }
}

/** Which search engines answered a search, and which didn't. */
export type SearchEnginesStatus = {
  used: string[];
  failed: string[];
};

/**
 * The searches of the agents that use the search engines of the research server.
 */
export class WebSearchService implements Service {
  private static readonly OLD_KEY_STORAGE_KEYS = ["braveSearchApiKey", "redditAgentBraveKey"];

  private _apiService: ApiService;

  private _knownPages: Set<string> = new Set<string>();

  private _lastStatus: Reactive<SearchEnginesStatus | undefined> = new Reactive<SearchEnginesStatus | undefined>(undefined);

  constructor(apiService: ApiService, storageService: StorageService) {
    this._apiService = apiService;
    // Paid search has been removed, so a key from then shouldn't stay in the browser.
    WebSearchService.OLD_KEY_STORAGE_KEYS.forEach((key) => storageService.removeLocally(key));
  }

  init() {}

  exit() {}

  /**
   * Which search engines answered the last search.
   */
  get lastStatus(): Reactive<SearchEnginesStatus | undefined> {
    return this._lastStatus;
  }

  /**
   * Remembers links from search results, because only those can be opened.
   */
  rememberPages(urls: string[]): void {
    urls.forEach((url) => this._knownPages.add(url));
  }

  isKnownPage(url: string): boolean {
    return this._knownPages.has(url);
  }

  /**
   * @param url The address of a page, which the research server opens
   * @returns The text of the page
   */
  readPage<T>(url: string): Promise<T> {
    return this.getFromServer<T>(`/page/read?${new URLSearchParams({ url: url }).toString()}`);
  }

  /**
   * @param path The path on the research server
   * @param query What to search for
   * @returns The response of the research server
   */
  async search<T extends SearchEnginesStatus>(path: string, query: string): Promise<T> {
    const body = await this.getFromServer<T>(`${path}?${new URLSearchParams({ q: query }).toString()}`);
    this._lastStatus.set({ used: body.used, failed: body.failed });
    return body;
  }

  private async getFromServer<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await this._apiService.simpleGet(`${environment.researchApiUrl}${path}`, { silent: true });
    } catch {
      throw new ResearchServerUnavailable();
    }

    // A development proxy without a running server answers with an error page instead of a failed connection.
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new ResearchServerUnavailable();
    }

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error ?? `The research server returned status ${response.status}`);
    }
    return body;
  }
}
