import type { Service } from "../../interfaces/service.interface";
import { Reactive } from "../../services/reactive.service";
import type { UploadedDocument } from "../model/document.model";
import { DocumentReadError, readDocumentFile } from "./documentReader";
import type { RagService } from "./rag.service";

/**
 * The documents the user uploaded for this session. They are only kept in memory, and their text is only sent to the
 * language models.
 */
export class DocumentsService implements Service {
  public static readonly ACCEPTED_TYPES = ".docx,.pdf,.txt,.md";
  /** Up to this size, a document fits in the context of a model as a whole. */
  public static readonly WHOLE_DOCUMENT_WORDS = 6000;

  // The whole file is read into memory, which gets risky around here, so the user is warned. It's still their choice.
  private static readonly WARNING_FILE_BYTES = 500 * 1024 * 1024;
  private static readonly MIN_WORDS = 1;
  private static readonly OPENING_WORDS = 25;

  private _ragService: RagService;

  private _documents: Reactive<UploadedDocument[]> = new Reactive<UploadedDocument[]>([]);
  private _nextId: number = 0;

  constructor(ragService: RagService) {
    this._ragService = ragService;
  }

  init() {}

  exit() {}

  get documents(): Reactive<UploadedDocument[]> {
    return this._documents;
  }

  /**
   * The documents that can be read.
   */
  get readyDocuments(): UploadedDocument[] {
    return this._documents.value.filter((document) => document.status === "ready");
  }

  /**
   * The id a long document can be searched with.
   */
  indexId(document: UploadedDocument): string {
    return `uploaded:${document.id}`;
  }

  /**
   * Reads and prepares files one by one, so that the list shows how far each one is.
   * @param files The files the user chose
   */
  async upload(files: File[]): Promise<void> {
    const uploads = files.map((file) => ({ file: file, id: this.addDocument(file.name) }));
    for (const { file, id } of uploads) {
      await this.prepare(file, id);
    }
  }

  /**
   * Forgets a document, including what is needed to search it.
   * @param id The id of the document
   */
  remove(id: string): void {
    const document = this._documents.value.find((candidate) => candidate.id === id);
    if (document !== undefined) {
      this._ragService.remove(this.indexId(document));
      this._documents.set(this._documents.value.filter((candidate) => candidate.id !== id));
    }
  }

  private addDocument(fileName: string): string {
    const id = `${this._nextId++}`;
    this._documents.set([
      ...this._documents.value,
      {
        id: id,
        name: this.uniqueName(fileName),
        status: "reading",
        parts: [],
        hasPages: false,
        words: 0,
        isSearchable: false,
      },
    ]);
    return id;
  }

  private uniqueName(fileName: string): string {
    const names = new Set(this._documents.value.map((document) => document.name));
    if (!names.has(fileName)) {
      return fileName;
    }
    const dot = fileName.lastIndexOf(".");
    const [stem, extension] = dot === -1 ? [fileName, ""] : [fileName.slice(0, dot), fileName.slice(dot)];
    let number = 2;
    while (names.has(`${stem} (${number})${extension}`)) {
      number++;
    }
    return `${stem} (${number})${extension}`;
  }

  private async prepare(file: File, id: string): Promise<void> {
    try {
      if (file.size > DocumentsService.WARNING_FILE_BYTES) {
        this.update(id, {
          notice: "This file is over 500 MB, which can make the page slow or even crash it. Conversations would be lost then.",
        });
      }

      const { parts, hasPages } = await readDocumentFile(file);
      const words = parts.join(" ").split(/\s+/).filter((word) => word !== "").length;
      if (words < DocumentsService.MIN_WORDS) {
        throw new DocumentReadError(
          hasPages
            ? "This PDF has no readable text. It may be a scan, which would need text recognition."
            : "This file has no text.",
        );
      }
      this.update(id, { parts: parts, hasPages: hasPages, words: words, opening: this.openingOf(parts) });

      // A document that fits as a whole never needs to be searched.
      if (words > DocumentsService.WHOLE_DOCUMENT_WORDS) {
        await this.index(id);
      }
      this.update(id, { status: "ready" });
    } catch (error) {
      console.warn("reading a document failed", error);
      this.update(id, {
        status: "failed",
        parts: [],
        error: error instanceof DocumentReadError ? error.message : this.describeReadFailure(file, error),
      });
    }
  }

  /**
   * The start of a document says what it is about. A PDF often starts with a cover or contents page, so this skips
   * pages with hardly any text.
   */
  private openingOf(parts: string[]): string {
    const wordsOf = (text: string) => text.split(/\s+/).filter((word) => word !== "");
    const part = parts.find((candidate) => wordsOf(candidate).length >= DocumentsService.OPENING_WORDS)
      ?? parts.find((candidate) => wordsOf(candidate).length > 0)
      ?? "";
    const words = wordsOf(part);
    const opening = words.slice(0, DocumentsService.OPENING_WORDS).join(" ").replace(/"/g, "'");
    return words.length > DocumentsService.OPENING_WORDS ? `${opening}...` : opening;
  }

  /**
   * Browsers have their own limits on how much they can read in one go.
   */
  private describeReadFailure(file: File, error: unknown): string {
    const isTooLarge = error instanceof RangeError || file.size > DocumentsService.WARNING_FILE_BYTES;
    return isTooLarge
      ? "This file is too large for the browser to read. Try splitting it, or exporting it without images."
      : "This file could not be read.";
  }

  private async index(id: string): Promise<void> {
    const document = this._documents.value.find((candidate) => candidate.id === id);
    if (document === undefined) {
      return;
    }

    this.update(id, { status: "indexing" });
    try {
      await this._ragService.index(this.indexId(document), document.parts.join("\n\n"));
      // It can have been removed while this was running.
      if (this._documents.value.some((candidate) => candidate.id === id)) {
        this.update(id, { isSearchable: true });
      } else {
        this._ragService.remove(this.indexId(document));
      }
    } catch (error) {
      console.warn("indexing a document failed", error);
      const notice = "It could not be prepared for searching, which needs the embedding model, so only its start can be read.";
      this.update(id, { notice: document.notice === undefined ? notice : `${document.notice} ${notice}` });
    }
  }

  private update(id: string, changes: Partial<UploadedDocument>): void {
    this._documents.set(
      this._documents.value.map((document) => (document.id === id ? { ...document, ...changes } : document)),
    );
  }
}
