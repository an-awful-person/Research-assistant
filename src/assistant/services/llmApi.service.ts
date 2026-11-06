import { Ollama, type ChatResponse, type Options } from 'ollama';
import modelsConfig from "../../constants/models.config.json";
import { type Service } from "../../interfaces/service.interface";
import { Reactive } from "../../services/reactive.service";
import {
  type LLMMessage
} from "../model/llm.model";

export const DEFAULT_MAX_LLM_CALL_ATTEMPTS = 3;

export class LLMApiService implements Service {

  // Through the research server, so that the model on the computer running it also works for other devices.
  private _ollama = new Ollama({ host: `${window.location.origin}/ollama` });

  private _progress = new Reactive<number>(0);

  public static readonly DEFAULT_TEMPERATURE:number = 0.7;

  public static readonly DEFAULT_MODEL = modelsConfig.chat;

  public static readonly DEFAULT_EMBEDDING_MODEL = modelsConfig.embedding;

  // Prompts with search results can fill a smaller context, which cuts off the answer. This is the same for
  // every call, because a model has to be reloaded when it changes.
  public static readonly CONTEXT_TOKENS = 16384;

  init() {}
  exit() {}

  get progress():Reactive<number>{
    return this._progress;
  }

  rawCall(messages: LLMMessage[], format?: string | object | any, options?:Partial<Options>, model?:string) : Promise<ChatResponse> {
    return this._ollama.chat({
      model: model ?? LLMApiService.DEFAULT_MODEL,
      messages:messages,
      format:format,
      options:{ num_ctx: LLMApiService.CONTEXT_TOKENS, ...options },
      // Thinking shares the context with the answer, and can use it up before any JSON is written.
      think:false
    })
  }

  jsonCall<T>(
    messages: LLMMessage[], format: any, options?: Partial<Options>, model?: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.rawCall(messages, format, options, model).then(response => {
        resolve(JSON.parse(response.message.content) as T);
      }).catch(reject)
    })
  }

  /**
   * @returns The models installed in Ollama on the computer running the assistant
   */
  listModels(): Promise<{ name: string; size: number; family: string; parameterSize: string }[]> {
    return this._ollama.list().then((response) =>
      response.models.map((model) => ({
        name: model.name,
        size: model.size,
        family: model.details?.family ?? "",
        parameterSize: model.details?.parameter_size ?? "",
      })),
    );
  }

  /**
   * Turns texts into vectors, where texts with a similar meaning get similar vectors.
   * @param texts The texts to embed
   * @param model The embedding model to use
   * @returns One vector for each text
   */
  embed(texts: string[], model?: string): Promise<number[][]> {
    return this._ollama.embed({
      model: model ?? LLMApiService.DEFAULT_EMBEDDING_MODEL,
      input: texts,
    }).then(response => response.embeddings);
  }
}
