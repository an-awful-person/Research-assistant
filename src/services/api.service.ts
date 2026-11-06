/* eslint-disable @typescript-eslint/no-explicit-any */
import { API_METHOD } from "../constants/api.constants";
import { POPUP_TYPE } from "../constants/popup.constants";
import { type Service } from "../interfaces/service.interface";
import { PopupService } from "./popup.service";
import { ProgressService } from "./progress.service";
import { Reactive } from "./reactive.service";
import { ReactiveMap } from "./reactiveMap.service";

export class ApiService implements Service {
  private _progressService: ProgressService = new ProgressService();
  private _popupService: PopupService = new PopupService();

  private _endpoints$: ReactiveMap<string> = new ReactiveMap();
  private _authorizationToken$: Reactive<string | undefined> = new Reactive<
    string | undefined
  >(undefined);

  constructor(progressService: ProgressService, popupService: PopupService) {
    this._popupService = popupService;
    this._progressService = progressService;
  }

  init() {}

  exit() {}

  public rawApiCall(
    endpoint: string,
    options?: {
      formData?: any;
      method?: API_METHOD;
      contentType?: string;
      formDataRaw?: boolean;
    },
    additionalHeaders?: any
  ): Promise<Response> {
    this._progressService.increaseCounter();

    const formDataString = options?.formData
      ? options?.formDataRaw
        ? options.formData
        : JSON.stringify(options.formData)
      : "";

    const requestOptions = {
      headers: {
        ...{
          "Content-Type": options?.contentType ?? "application/json",
          Authorization: this._authorizationToken$.value ?? "",
        },
        ...additionalHeaders,
      },
      method: options?.method ?? API_METHOD.GET,
      body:
        options?.method !== undefined && options?.method !== API_METHOD.GET
          ? formDataString
          : undefined,
    };

    // eslint-disable-next-line no-async-promise-executor
    return new Promise<Response>(async (resolve, reject) => {
      try {
        const response = await fetch(endpoint, requestOptions);
        if (!response.ok) {
          this._popupService.throwPopup(
            `HTTP error! status: ${response.status} reaching ${endpoint}`,
            POPUP_TYPE.ERROR,
            5000
          );
          console.error(`HTTP error! status: ${response.status}`);
          // reject(`HTTP error! status: ${response.status}`)
          // throw new Error(`HTTP error! status: ${response.status}`);
        }
        this._progressService.decreaseCounter();
        resolve(response);
      } catch (error) {
        this._progressService.decreaseCounter();
        this._popupService.throwPopup(`${error}`, POPUP_TYPE.ERROR);
        reject(error);
      }
    });
  }

  /**
   * A GET request without custom headers. Unlike rawApiCall this causes no CORS preflight request, which some public sites don't allow.
   * @param endpoint The url to get
   * @param options silent: don't show popups on errors, for requests the user did not ask for
   * @returns The response
   */
  public simpleGet(endpoint: string, options?: { silent?: boolean }): Promise<Response> {
    this._progressService.increaseCounter();

    return fetch(endpoint)
      .then((response) => {
        if (!response.ok && !options?.silent) {
          this._popupService.throwPopup(
            `HTTP error! status: ${response.status} reaching ${endpoint}`,
            POPUP_TYPE.ERROR,
            5000
          );
        }
        return response;
      })
      .catch((error) => {
        if (!options?.silent) {
          this._popupService.throwPopup(`${error}`, POPUP_TYPE.ERROR);
        }
        throw error;
      })
      .finally(() => {
        this._progressService.decreaseCounter();
      });
  }

  public apiCall<T>(
    endpoint: string,
    options?: {
      formData?: any;
      method?: API_METHOD;
    },
    additionalHeaders?: any
  ): Promise<T> {
    return this.rawApiCall(endpoint, options, additionalHeaders).then(
      (response) => {
        return response.json();
      }
    );
  }

  public post<T>(endpoint: string, body: any, additionalHeaders?: any): Promise<any> {
    return this.apiCall<T>(endpoint, {
      formData: body,
      method: API_METHOD.POST,
    }, additionalHeaders);
  }

  public WebsocketConnection<T>(
    ws: { url: string; protocols?: string | string[] | undefined, cookie?:string }
  ): Promise<{ messages: Reactive<T | undefined>; socket: WebSocket }> {
    document.cookie = ws.cookie ?? '';
    return new Promise<{
      messages: Reactive<T | undefined>;
      socket: WebSocket;
    }>((resolve) => {
          const socket = new WebSocket(ws.url, ws.protocols);
          const response: {
            messages: Reactive<T | undefined>;
            socket: WebSocket;
          } = {
            socket: socket,
            messages: new Reactive<T | undefined>(undefined),
          };

          socket.onmessage = (event: MessageEvent) => {
            response.messages.set(event.data as T);
          };

          resolve(response);
        });
  }

  keyedApiCall<T>(
    key: string,
    add: string,
    options?: {
      formData?: any;
      method?: API_METHOD;
      contentType?: string;
    }
  ): Promise<T | undefined> {
    const endpoint = this._endpoints$.value.get(key);
    if (endpoint) {
      return this.apiCall(`${this._endpoints$.value.get(key)}${add}`, options);
    } else {
      this._popupService.throwPopup(
        `No endpoint found for: ${key}`,
        POPUP_TYPE.ERROR
      );
      return new Promise<T | undefined>((resolve) => {
        resolve(undefined);
      });
    }
  }

  /** Counts the outside requests that are still running. */
  get progressService(): ProgressService {
    return this._progressService;
  }

  get endpoints(): ReactiveMap<string> {
    return this._endpoints$;
  }
}
