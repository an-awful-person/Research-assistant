import { environment } from "../../constants/environment.constants";
import type { Service } from "../../interfaces/service.interface";
import type { ApiService } from "../../services/api.service";
import { Reactive } from "../../services/reactive.service";

/** Which keys the computer running the assistant shares with everyone, from its .env file. */
export type SharedKeys = {
  wikipedia: boolean;
  openalex: boolean;
};

/**
 * Finds out which keys are shared by the research server. A shared key is used instead of a key in this browser,
 * and stays on the server: only what it gives access to reaches the browser.
 */
export class SharedKeysService implements Service {
  private _apiService: ApiService;

  private _keys: Reactive<SharedKeys> = new Reactive<SharedKeys>({ wikipedia: false, openalex: false });

  /** Becomes true once the server has answered, or couldn't, so a user's own key isn't used before then. */
  private _ready: Reactive<boolean> = new Reactive<boolean>(false);

  constructor(apiService: ApiService) {
    this._apiService = apiService;
  }

  init() {
    this.refresh();
  }

  exit() {}

  get keys(): Reactive<SharedKeys> {
    return this._keys;
  }

  get ready(): Reactive<boolean> {
    return this._ready;
  }

  /**
   * @returns Once it's known which keys are shared, so a search just after the page opened uses the right key
   */
  whenReady(): Promise<void> {
    if (this._ready.value) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const subscription = this._ready.listener().subscribe(() => {
        subscription.unsubscribe();
        resolve();
      });
    });
  }

  /** Where Wikipedia tokens from the shared key are handed out. */
  get wikipediaTokenUrl(): string {
    return `${environment.researchApiUrl}/wikipedia/token`;
  }

  /** Where OpenAlex is reached with the shared key. */
  get openAlexUrl(): string {
    return `${environment.researchApiUrl}/openalex`;
  }

  private async refresh(): Promise<void> {
    try {
      const response = await this._apiService.simpleGet(`${environment.researchApiUrl}/keys`, { silent: true });
      if (!response.ok) {
        return;
      }
      const body: Partial<SharedKeys> = await response.json();
      const keys = { wikipedia: body.wikipedia === true, openalex: body.openalex === true };
      if (keys.wikipedia !== this._keys.value.wikipedia || keys.openalex !== this._keys.value.openalex) {
        this._keys.set(keys);
      }
    } catch {
      // An older or missing research server has no shared keys.
    } finally {
      if (!this._ready.value) {
        this._ready.set(true);
      }
    }
  }
}
