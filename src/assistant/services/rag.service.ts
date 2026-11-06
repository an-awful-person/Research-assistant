import { type Service } from "../../interfaces/service.interface";
import type { LLMApiService } from "./llmApi.service";

type RagChunk = {
  text: string;
  embedding: number[];
};

/**
 * Finds the parts of long documents that are relevant to a question (retrieval for RAG).
 * Documents are kept in memory for this session, so each one is embedded only once.
 */
export class RagService implements Service {
  private static readonly CHUNK_WORDS = 300;
  private static readonly CHUNK_OVERLAP_WORDS = 50;
  private static readonly EMBED_BATCH_SIZE = 32;

  // nomic-embed-text expects these prefixes to tell documents and questions apart.
  private static readonly DOCUMENT_PREFIX = "search_document: ";
  private static readonly QUERY_PREFIX = "search_query: ";

  private _llmApiService: LLMApiService;

  private _documents: Map<string, RagChunk[]> = new Map<string, RagChunk[]>();

  constructor(llmApiService: LLMApiService) {
    this._llmApiService = llmApiService;
  }

  init() {}

  exit() {}

  remove(documentId: string): void {
    this._documents.delete(documentId);
  }

  has(documentId: string): boolean {
    return this._documents.has(documentId);
  }

  /**
   * Splits a markdown document into chunks and embeds them.
   * @param documentId The id to search the document by later
   * @param markdown The text of the document
   */
  async index(documentId: string, markdown: string): Promise<void> {
    const texts = this.splitIntoChunks(markdown);
    const chunks: RagChunk[] = [];

    for (let i = 0; i < texts.length; i += RagService.EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + RagService.EMBED_BATCH_SIZE);
      const embeddings = await this._llmApiService.embed(
        batch.map((text) => RagService.DOCUMENT_PREFIX + text),
      );
      batch.forEach((text, index) => {
        chunks.push({ text: text, embedding: embeddings[index] });
      });
    }

    this._documents.set(documentId, chunks);
  }

  /**
   * @param documentId The id the document was indexed with
   * @param query The question to find text for
   * @param count The maximum amount of chunks to return
   * @returns The most relevant chunks, best match first
   */
  async search(documentId: string, query: string, count: number): Promise<string[]> {
    const chunks = this._documents.get(documentId) ?? [];
    if (chunks.length === 0) {
      return [];
    }

    const [queryEmbedding] = await this._llmApiService.embed([
      RagService.QUERY_PREFIX + query,
    ]);

    return chunks
      .map((chunk) => ({
        text: chunk.text,
        score: this.cosineSimilarity(queryEmbedding, chunk.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map((chunk) => chunk.text);
  }

  /**
   * Keeps sections together where possible, and repeats a section's heading in each of its chunks so they keep their context.
   */
  private splitIntoChunks(markdown: string): string[] {
    const chunks: string[] = [];
    const step = RagService.CHUNK_WORDS - RagService.CHUNK_OVERLAP_WORDS;

    markdown.split(/\n(?=#{1,6} )/).forEach((section) => {
      const lines = section.trim().split("\n");
      const heading = /^#{1,6} /.test(lines[0]) ? `${lines.shift()}\n` : "";
      const words = lines.join("\n").split(/\s+/).filter((word) => word !== "");

      for (let start = 0; start < words.length; start += step) {
        chunks.push(heading + words.slice(start, start + RagService.CHUNK_WORDS).join(" "));
        if (start + RagService.CHUNK_WORDS >= words.length) {
          break;
        }
      }
    });

    return chunks;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let lengthA = 0;
    let lengthB = 0;
    a.forEach((value, index) => {
      dot += value * b[index];
      lengthA += value * value;
      lengthB += b[index] * b[index];
    });
    const length = Math.sqrt(lengthA) * Math.sqrt(lengthB);
    return length === 0 ? 0 : dot / length;
  }
}
