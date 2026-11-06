import dayjs from "dayjs";
import z from "zod";
import { type Service } from "../../interfaces/service.interface";
import { POPUP_TYPE } from "../../constants/popup.constants";
import { Reactive } from "../../services/reactive.service";
import { MESSAGE_ROLES } from "../constants/llm.constants";
import type { META_LMMMessage } from "../model/llm.model";
import type { AssistantService } from "./assistant.service";
import { reportInput, reportMarkdown, transcriptMarkdown, type ReportResponse } from "./exportDocument";
import { MediatorService } from "./mediator.service";

export type ExportKind = "conversation" | "report";
export type ExportFormat = "md" | "pdf";

const REPORT_SCHEMA = z.toJSONSchema(
  z.object({
    title: z.string().describe("A short title for the report, naming its subject."),
    summary: z.string().describe("Two to four sentences on what the conversation found."),
    conclusions: z
      .array(
        z.object({
          statement: z.string().describe("One conclusion, as a complete sentence."),
          sources: z.array(z.number()).describe("The numbers of the sources that support it, like [2] → 2. Empty if none does."),
        }),
      )
      .describe("The conclusions, the most important first."),
    openQuestions: z.array(z.string()).describe("What the conversation didn't settle, or what wasn't found. Empty if nothing."),
  }),
);

const REPORT_PROMPT = `You write a short research report of a conversation between a user and a research assistant.
- Use only what the assistant's answers say. Don't add facts of your own.
- Each conclusion cites the numbers of the sources that support it, from the SOURCES list. Cite a source only if the answer the conclusion comes from cites it.
- If an answer had no source, its conclusion has an empty list of sources.
- Write in the language of the conversation.`;

/**
 * Saves the visible conversation: as a transcript with its sources, or as a report of its conclusions.
 */
export class ExportService implements Service {
  private _assistantService: AssistantService;
  private _writingReport: Reactive<boolean> = new Reactive<boolean>(false);

  constructor(assistantService: AssistantService) {
    this._assistantService = assistantService;
  }

  init(): void {}

  exit(): void {}

  /** If a report is being written by the model. */
  get writingReport(): Reactive<boolean> {
    return this._writingReport;
  }

  get messages(): META_LMMMessage[] {
    return (this._assistantService.mediatorService.activeChats.get(MediatorService.VISIBLE_CHAT_ID) ?? []).filter(
      (message) => message.role === MESSAGE_ROLES.USER || message.role === MESSAGE_ROLES.ASSISTANT,
    );
  }

  /** If there is anything to save. */
  canExport(messages: META_LMMMessage[] = this.messages): boolean {
    return messages.some((message) => message.role === MESSAGE_ROLES.ASSISTANT);
  }

  async save(kind: ExportKind, format: ExportFormat): Promise<void> {
    const messages = this.messages;
    if (!this.canExport(messages) || this._writingReport.value) {
      return;
    }
    const now = dayjs();
    const date = now.format("D MMMM YYYY, HH:mm");
    const model = this._assistantService.modelService.general.value;
    const name = `research-${kind}-${now.format("YYYY-MM-DD-HHmm")}`;

    let markdown: string;
    if (kind === "conversation") {
      markdown = transcriptMarkdown(messages, date, model);
    } else {
      this._writingReport.set(true);
      try {
        const response = await this._assistantService.llmApiService.jsonCall<ReportResponse>(
          [
            { role: MESSAGE_ROLES.SYSTEM, content: REPORT_PROMPT },
            { role: MESSAGE_ROLES.USER, content: reportInput(messages) },
          ],
          REPORT_SCHEMA,
          { temperature: this._assistantService.temperatureService.general.value },
          model,
        );
        markdown = reportMarkdown(messages, response, date, model);
      } catch (error) {
        console.error(error);
        this._assistantService.popupService.throwPopup(
          `The report could not be written by ${model}. Check that Ollama is running, then try again.`,
          POPUP_TYPE.ERROR,
          6000,
        );
        return;
      } finally {
        this._writingReport.set(false);
      }
    }

    try {
      // Rendering a PDF needs React's server renderer, which only loads when something is saved.
      const { downloadMarkdown, printMarkdown } = await import("./exportFile");
      if (format === "md") {
        downloadMarkdown(markdown, name);
      } else {
        printMarkdown(markdown, name);
      }
    } catch (error) {
      console.error(error);
      this._assistantService.popupService.throwPopup("The file could not be saved.", POPUP_TYPE.ERROR);
    }
  }
}
