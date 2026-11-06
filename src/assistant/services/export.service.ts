import dayjs from "dayjs";
import z from "zod";
import { type Service } from "../../interfaces/service.interface";
import { POPUP_TYPE } from "../../constants/popup.constants";
import { Reactive } from "../../services/reactive.service";
import { MESSAGE_ROLES } from "../constants/llm.constants";
import type { META_LMMMessage } from "../model/llm.model";
import type { AssistantService } from "./assistant.service";
import { findCommonsImages, imageAsDataUrl } from "./commonsImages";
import {
  reportInput,
  reportMarkdown,
  transcriptMarkdown,
  type CommonsImage,
  type PlacedImage,
  type ReportResponse,
} from "./exportDocument";
import { downloadMarkdown } from "./exportFile";
import { MediatorService } from "./mediator.service";

export type ExportKind = "conversation" | "report";
export type ExportFormat = "md" | "pdf";

/** At most this many pictures in a report. */
const MAX_IMAGES = 3;

const REPORT_SCHEMA = z.toJSONSchema(
  z.object({
    title: z.string().describe("A title like that of a scientific paper, naming the subject."),
    abstract: z.string().describe("One paragraph of 3 to 5 sentences: the question, what was found and the main conclusion, citing sources like [1]."),
    introduction: z.string().describe("One or two paragraphs: the subject, why it matters, and the questions this report answers."),
    findings: z
      .array(
        z.object({
          heading: z.string().describe("A short heading for this part of the findings."),
          paragraphs: z.array(z.string()).describe("1 to 3 paragraphs of prose, not lists, with the source number in square brackets after each statement, like 'It entered service in 2002 [1].'"),
        }),
      )
      .describe("2 to 4 subsections that present what was found, most important first."),
    discussion: z.string().describe("One or two paragraphs: how strong the evidence is, where sources disagree, and what is still open or wasn't found."),
    conclusion: z.string().describe("One or two paragraphs that answer the questions, citing sources like [1]."),
  }),
);

const IMAGES_SCHEMA = z.toJSONSchema(
  z.object({
    images: z
      .array(
        z.object({
          query: z.string().describe("A short search for a photo, in English, naming the concrete subject, like 'De Zeven Provinciën class frigate'."),
          section: z.number().describe("The number of the findings section the photo belongs with, counting from 1, or 0 for under the title."),
        }),
      )
      .describe("1 to 3 photos. Empty only if nothing in the report can be photographed."),
  }),
);

const IMAGES_PROMPT = `You choose photos for a research report. Suggest searches for photos of the concrete things the report is about: ships, aircraft, vehicles, weapons, buildings, places, people, organisations' insignia, devices or objects.
- Name the subject itself, as specifically as the report does, like "HNLMS De Ruyter (F804)" or "Patriot missile launcher".
- Put the most important subject under the title (section 0), and others with the findings section they illustrate.
- Return an empty list only if the report is about something that can't be photographed, like a calculation or a definition.`;

const CHOICE_SCHEMA = z.toJSONSchema(
  z.object({
    choice: z.number().describe("The number of the picture that shows the subject, or -1 if none clearly does."),
  }),
);

const REPORT_PROMPT = `You write a short report, in the style of a scientific paper, of a conversation between a user and a research assistant.
- Write in a neutral, scientific style, in full paragraphs. Don't use bullet lists.
- Use only what the assistant's answers say. Don't add facts of your own, and don't invent sources, authors or dates.
- Put the number of the source in square brackets right after each statement taken from it, like "It entered service in 2002 [1]." Use only numbers from the SOURCES list, and only where the answer the statement comes from cites that source.
- A statement from an answer without a source gets no number.
- Write in the language of the conversation.`;

/**
 * Saves the visible conversation: as a transcript with its sources, or as a report in the style of a scientific paper.
 */
export class ExportService implements Service {
  private _assistantService: AssistantService;
  private _saving: Reactive<boolean> = new Reactive<boolean>(false);

  constructor(assistantService: AssistantService) {
    this._assistantService = assistantService;
  }

  init(): void {}

  exit(): void {}

  /** If a document is being made: a report written, pictures found, or a PDF built. */
  get saving(): Reactive<boolean> {
    return this._saving;
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

  /**
   * Makes the document and saves it in the downloads.
   * @param options.images For a report: add freely licensed pictures from Wikimedia Commons
   */
  async save(kind: ExportKind, format: ExportFormat, options: { images?: boolean } = {}): Promise<void> {
    const messages = this.messages;
    if (!this.canExport(messages) || this._saving.value) {
      return;
    }
    const now = dayjs();
    const date = now.format("D MMMM YYYY, HH:mm");
    const model = this._assistantService.modelService.general.value;
    const name = `research-${kind}-${now.format("YYYY-MM-DD-HHmm")}`;

    this._saving.set(true);
    try {
      let markdown: string;
      let title = "Research conversation";
      if (kind === "conversation") {
        markdown = transcriptMarkdown(messages, date, model);
      } else {
        let response: ReportResponse;
        try {
          response = await this._assistantService.llmApiService.jsonCall<ReportResponse>(
            [
              { role: MESSAGE_ROLES.SYSTEM, content: REPORT_PROMPT },
              { role: MESSAGE_ROLES.USER, content: reportInput(messages) },
            ],
            REPORT_SCHEMA,
            { temperature: this._assistantService.temperatureService.general.value },
            model,
          );
        } catch (error) {
          console.error(error);
          this._assistantService.popupService.throwPopup(
            `The report could not be written by ${model}. Check that Ollama is running, then try again.`,
            POPUP_TYPE.ERROR,
            6000,
          );
          return;
        }
        title = response.title || "Research report";
        const images = options.images ? await this.findImages(response, format, model) : [];
        markdown = reportMarkdown(messages, response, date, model, images);
      }

      if (format === "md") {
        downloadMarkdown(markdown, name);
      } else {
        // The PDF library is large, so it only loads when a PDF is made.
        const { downloadPdf } = await import("./exportPdf");
        await downloadPdf(markdown, name, title);
      }
    } catch (error) {
      console.error(error);
      this._assistantService.popupService.throwPopup("The file could not be saved.", POPUP_TYPE.ERROR);
    } finally {
      this._saving.set(false);
    }
  }

  /**
   * Looks for a picture of each subject the model suggested. A picture is only used when the model, looking at the
   * titles and descriptions, says it shows the subject. Anything that fails just leaves the picture out.
   */
  private async findImages(response: ReportResponse, format: ExportFormat, model: string): Promise<PlacedImage[]> {
    const apiService = this._assistantService.apiService;
    const placed: PlacedImage[] = [];
    const queries = (await this.suggestImages(response, model))
      .filter((suggestion) => typeof suggestion?.query === "string" && suggestion.query.trim() !== "")
      .filter((suggestion, index, all) => all.findIndex((other) => other.query.trim().toLowerCase() === suggestion.query.trim().toLowerCase()) === index)
      .slice(0, MAX_IMAGES);

    for (const suggestion of queries) {
      const candidates = (await findCommonsImages(apiService, suggestion.query.trim())).filter(
        (candidate) => !placed.some((known) => known.image.pageUrl === candidate.pageUrl),
      );
      if (candidates.length === 0) continue;
      const image = await this.chooseImage(suggestion.query, candidates, model);
      if (image === undefined) continue;
      const src = format === "pdf" ? await imageAsDataUrl(apiService, image.thumbUrl) : image.thumbUrl;
      if (src === undefined) continue;
      placed.push({ image: image, section: Number.isInteger(suggestion.section) ? suggestion.section : 0, src: src });
    }
    return placed;
  }

  /** Asks the model, in a call of its own, what the report's photos should show. */
  private async suggestImages(response: ReportResponse, model: string): Promise<{ query: string; section: number }[]> {
    const report = [
      `TITLE: ${response.title ?? ""}`,
      `ABSTRACT: ${response.abstract ?? ""}`,
      "FINDINGS SECTIONS:",
      ...(response.findings ?? []).map((finding, index) => `${index + 1}. ${finding?.heading ?? ""}: ${(finding?.paragraphs?.[0] ?? "").slice(0, 300)}`),
    ].join("\n");
    try {
      const result = await this._assistantService.llmApiService.jsonCall<{ images?: { query: string; section: number }[] }>(
        [
          { role: MESSAGE_ROLES.SYSTEM, content: IMAGES_PROMPT },
          { role: MESSAGE_ROLES.USER, content: report },
        ],
        IMAGES_SCHEMA,
        { temperature: 0.2 },
        model,
      );
      return result.images ?? [];
    } catch (error) {
      console.error("No photos could be suggested", error);
      return [];
    }
  }

  private async chooseImage(query: string, candidates: CommonsImage[], model: string): Promise<CommonsImage | undefined> {
    const list = candidates
      .map((candidate, index) => `${index + 1}. ${candidate.title}${candidate.description !== "" ? ` — ${candidate.description}` : ""}`)
      .join("\n");
    try {
      const { choice } = await this._assistantService.llmApiService.jsonCall<{ choice: number }>(
        [
          {
            role: MESSAGE_ROLES.SYSTEM,
            content: "You pick a photo for a report. Answer with the number of the picture that clearly shows the subject, judged by its title and description, or -1 if none does.",
          },
          { role: MESSAGE_ROLES.USER, content: `SUBJECT: ${query}\n\nPICTURES:\n${list}` },
        ],
        CHOICE_SCHEMA,
        { temperature: 0 },
        model,
      );
      return Number.isInteger(choice) && choice >= 1 && choice <= candidates.length ? candidates[choice - 1] : undefined;
    } catch (error) {
      console.error("No picture could be chosen", error);
      return undefined;
    }
  }
}
