import { type Service } from "../../interfaces/service.interface";
import type { ReactiveMap } from "../../services/reactiveMap.service";
import type {
  AnswerCheck,
  EvidenceDocument,
  EvidenceItem,
  EvidenceModel,
  ReferenceModel,
  RegisteredSource,
  SourceWarning,
} from "../model/reference.model";

/** Kinds of sources an answer can name, which are checked against the sources it cites. */
const SOURCE_KINDS: { name: string; mention: RegExp; matches: RegExp }[] = [
  { name: "Wikipedia", mention: /\bwikipedia\b/i, matches: /wikipedia/i },
  { name: "arXiv", mention: /\barxiv\b/i, matches: /arxiv/i },
  { name: "Reddit", mention: /\breddit\b|\br\/\w+/i, matches: /reddit/i },
  { name: "LinkedIn", mention: /\blinkedin\b/i, matches: /linkedin/i },
];

/**
 * Keeps track of what supports the answer to the current question, so that sources are decided by code and not guessed.
 * A source is only cited if a quote from it really is in the text that was read, and if that quote fits the final answer.
 */
export class EvidenceService implements Service {
  private static readonly MIN_WORD_OVERLAP = 0.5;
  private static readonly MIN_DISTINCTIVE_WORD_LENGTH = 4;
  private static readonly MAX_CONTEXT_LENGTH = 300;
  /** How well a sentence of a source has to match an agent's answer to count as what it was based on. */
  private static readonly MIN_SENTENCE_SCORE = 3;
  private static readonly MAX_MATCHED_SENTENCES = 3;
  /** A statement of the answer is in the source it cites if this share of its words is. */
  private static readonly MIN_CITED_OVERLAP = 0.3;
  /** Statements with fewer words than this, like "Here is what I found:", don't need a source. */
  private static readonly MIN_WORDS_OF_A_CLAIM = 3;

  /** Source ids in an answer, like [S1], [S1, S3] or 【S2】. */
  private static readonly MARKER = /[[【]\s*(S\d+(?:\s*[,;]\s*S\d+)*)\s*[\]】]/gi;

  /** An answer of an agent saying that what it read doesn't answer the question. */
  private static readonly NOT_FOUND = /\b(?:do(?:es)?n['’]?t|do(?:es)? not|no|not|none of|cannot|can['’]?t|could not|couldn['’]?t)\b[^.]{0,60}\b(?:mention|contain|say|state|provide|include|answer|information|found|specify|discuss)/i;

  private static readonly NUMBER = /(?<![\p{L}\p{N}.,_])(?<!\p{L}[-–])\d+(?:[.,]\d+)*(?![\p{L}\p{N}])/gu;

  // Words that say nothing about whether an answer came from a source.
  private static readonly IGNORED_WORDS = new Set([
    "about", "according", "also", "answer", "article", "based", "been", "being", "could", "does", "from",
    "have", "into", "mentioned", "more", "other", "page", "paper", "said", "says", "some", "source",
    "stated", "states", "such", "text", "than", "that", "their", "them", "then", "there", "these", "they",
    "this", "used", "uses", "using", "very", "was", "were", "what", "when", "where", "which", "while",
    "wikipedia", "will", "with", "would",
  ]);

  private _evidence: Map<string, EvidenceItem> = new Map<string, EvidenceItem>();

  private _retrievedTexts: Map<string, string> = new Map<string, string>();

  /** The sources of the current question that the answer can cite, by their id. */
  private _sources: Map<string, RegisteredSource> = new Map<string, RegisteredSource>();

  private _question: string = "";

  private _questionNumber: number = 0;

  private _references: ReactiveMap<ReferenceModel>;

  /**
   * @param references Where the sources of the whole session are kept, unlike the evidence of the current question
   */
  constructor(references: ReactiveMap<ReferenceModel>) {
    this._references = references;
  }

  init() {}

  exit() {}

  /**
   * Forgets the evidence of the previous question.
   * @param question The new question
   */
  clear(question: string): void {
    this._evidence.clear();
    this._retrievedTexts.clear();
    this._sources.clear();
    this._question = question;
    this._questionNumber++;
  }

  /**
   * Records a source as evidence, keeping only the quotes that really are in the text that was read.
   * @param source The name of the source
   * @param url The link to the source
   * @param quotes The quotes the model says the answer is based on
   * @param retrievedText The text the model was given
   * @param document The document this is a part of, if the source and url are of one part of it, like a page
   */
  add(source: string, url: string, quotes: string[], retrievedText: string, document?: EvidenceDocument): void {
    const verifiedQuotes = this.verifiedQuotes(quotes, retrievedText);
    if (verifiedQuotes.length > 0) {
      this.record(source, url, verifiedQuotes, retrievedText, false, document);
    }
  }

  /**
   * Records a source an agent read, and gives it an id that the final answer can cite it by.
   * Models often don't copy the passages they used exactly, so then the sentences that best match the agent's
   * answer are used instead, which still lets the reader check where it came from.
   * @param source The name of the source
   * @param url The link to the source
   * @param retrievedText The text the agent was given
   * @param answer What the agent answered from it
   * @param quotes The quotes the agent says its answer is based on
   * @param document The document this is a part of, if the source and url are of one part of it, like a page
   * @returns The id to cite it by, like S1, or undefined if the answer doesn't draw on it
   */
  registerSource(
    source: string,
    url: string,
    retrievedText: string,
    answer: string,
    quotes: string[],
    document?: EvidenceDocument,
  ): string | undefined {
    const verifiedQuotes = this.verifiedQuotes(quotes, retrievedText);
    const automatic = verifiedQuotes.length === 0;
    if (automatic && EvidenceService.NOT_FOUND.test(answer)) {
      return undefined;
    }
    const supporting = automatic
      ? this.matchingSentences(retrievedText, answer, EvidenceService.MAX_MATCHED_SENTENCES)
      : verifiedQuotes;
    if (supporting.length === 0) {
      return undefined;
    }
    this.record(source, url, supporting, retrievedText, automatic, document);

    const existing = [...this._sources.values()].find((known) => known.url === url);
    const id = existing?.id ?? `S${this._sources.size + 1}`;
    this._sources.set(id, {
      id: id,
      source: source,
      url: url,
      referenceId: document?.id ?? url,
      text: existing === undefined ? retrievedText : `${existing.text}\n${retrievedText}`,
      quotes: [...new Set([...(existing?.quotes ?? []), ...supporting])],
      automatic: (existing?.automatic ?? true) && automatic,
    });
    return id;
  }

  /**
   * If any source can be cited by id for the current question.
   */
  get hasSources(): boolean {
    return this._sources.size > 0;
  }

  /**
   * @returns If the text cites any source by id
   */
  citesSources(text: string): boolean {
    return new RegExp(EvidenceService.MARKER.source, "i").test(text);
  }

  /**
   * Checks the sources the final answer cites, and turns their ids into numbers the reader can follow.
   * Answers that cite nothing by id are checked the older way, by what they have in common with the sources.
   * @param answer The final answer to the user
   */
  checkAnswer(answer: string): AnswerCheck {
    if (!this.citesSources(answer)) {
      const citations = this.citationsFor(answer);
      const warnings = citations.length === 0 ? [this.noSourceWarning()] : [];
      return { text: answer, citations: citations, warnings: [...warnings, ...this.namedButNotUsed(answer, citations)] };
    }

    // Numbers follow the order in which sources are first cited.
    const numbers = new Map<string, number>();
    let unknown = 0;
    const text = answer
      .replace(new RegExp(EvidenceService.MARKER.source, "gi"), (_marker, list: string) => {
        const ids = this.idsIn(list);
        const known = ids.filter((id) => this._sources.has(id));
        unknown += ids.length - known.length;
        return known
          .map((id) => {
            if (!numbers.has(id)) {
              numbers.set(id, numbers.size + 1);
            }
            return `[[${numbers.get(id)}]](#source-${numbers.get(id)})`;
          })
          .join("");
      })
      .replace(/[ \t]+(?=[.,;:!?](?:\s|$))/g, "");

    const quotesFor = new Map<string, string[]>();
    let notFound = 0;
    let unsourced = 0;
    this.sentencesOfAnswer(answer).forEach((sentence) => {
      const markers = [...sentence.matchAll(new RegExp(EvidenceService.MARKER.source, "gi"))];
      const ids = markers.flatMap((marker) => this.idsIn(marker[1])).filter((id) => this._sources.has(id));
      const claim = sentence.replace(new RegExp(EvidenceService.MARKER.source, "gi"), " ");
      if (ids.length === 0) {
        if (markers.length > 0 || this.distinctiveWords(claim).length < EvidenceService.MIN_WORDS_OF_A_CLAIM) {
          return;
        }
        // Models often put the id only after the first of several statements from one source.
        const citedElsewhere = [...numbers.keys()].filter((id) => this.fits(claim, this._sources.get(id)!));
        if (citedElsewhere.length === 0) {
          unsourced++;
        }
        citedElsewhere.forEach((id) => {
          const match = this.matchingSentences(this._sources.get(id)!.text, claim, 1);
          quotesFor.set(id, [...(quotesFor.get(id) ?? []), ...match]);
        });
        return;
      }

      const fitting = ids.filter((id) => this.fits(claim, this._sources.get(id)!));
      if (fitting.length === 0) {
        notFound++;
      }
      fitting.forEach((id) => {
        const match = this.matchingSentences(this._sources.get(id)!.text, claim, 1);
        quotesFor.set(id, [...(quotesFor.get(id) ?? []), ...match]);
      });
    });

    const citations: EvidenceModel[] = [...numbers.entries()].map(([id, number]) => {
      const source = this._sources.get(id)!;
      return {
        source: source.source,
        number: number,
        items: [{
          url: source.url,
          quotes: [...new Set([...(quotesFor.get(id) ?? []), ...source.quotes])],
          referenceId: source.referenceId,
          automatic: source.automatic,
        }],
      };
    });

    const warnings: SourceWarning[] = [];
    if (citations.length === 0) {
      warnings.push(this.noSourceWarning());
    }
    if (unknown > 0) {
      warnings.push({ kind: "unknownId", message: `The model cited ${this.count(unknown, "source")} that wasn't read for this question, so ${unknown === 1 ? "it was" : "they were"} removed.` });
    }
    if (notFound > 0) {
      warnings.push({ kind: "notFound", message: `${this.count(notFound, "statement")} could not be found in the source ${notFound === 1 ? "it cites" : "they cite"}. Check ${notFound === 1 ? "it" : "them"} before relying on ${notFound === 1 ? "it" : "them"}.` });
    }
    if (unsourced > 0 && citations.length > 0) {
      warnings.push({ kind: "unsourced", message: `${this.count(unsourced, "statement")} ${unsourced === 1 ? "has" : "have"} no source. ${unsourced === 1 ? "It" : "They"} may be the model's own reasoning or knowledge.` });
    }
    return { text: text, citations: citations, warnings: [...warnings, ...this.namedButNotUsed(answer, citations)] };
  }

  private noSourceWarning(): SourceWarning {
    return {
      kind: "noSource",
      message: "This answer could not be traced back to a source that was read. It may come from the model's own knowledge, so check it before relying on it.",
    };
  }

  private count(amount: number, word: string): string {
    return `${amount} ${word}${amount === 1 ? "" : "s"}`;
  }

  private idsIn(list: string): string[] {
    return list.split(/[,;]/).map((id) => id.trim().toUpperCase()).filter((id) => id !== "");
  }

  /**
   * @returns The kinds of sources the answer names without citing one of them, like "according to Wikipedia"
   */
  private namedButNotUsed(answer: string, citations: EvidenceModel[]): SourceWarning[] {
    const prose = answer.replace(/https?:\/\/\S+/g, " ");
    const cited = citations.flatMap((citation) => [citation.source, ...citation.items.map((item) => item.url)]).join(" ");
    return SOURCE_KINDS
      .filter((kind) => kind.mention.test(prose) && !kind.matches.test(cited))
      .map((kind) => ({
        kind: "namedNotUsed",
        message: `The answer mentions ${kind.name}, but no ${kind.name} source was used for it, so that part may not come from ${kind.name}.`,
      }));
  }

  /**
   * @returns If a statement can be found in the source it cites: its numbers have to be there, and enough of its words
   */
  private fits(claim: string, source: RegisteredSource): boolean {
    const questionNumbers = this.numbersIn(this._question);
    const sourceNumbers = this.numbersIn(source.text);
    const numbers = this.numbersIn(claim).filter((number) => !questionNumbers.includes(number));
    // "1.99" in an answer is still in a source that says "1.99.1".
    const hasNumber = (number: string) => sourceNumbers.some((known) => known === number || known.startsWith(`${number}.`));
    if (!numbers.every(hasNumber)) {
      return false;
    }

    const words = this.distinctiveWords(claim);
    if (words.length === 0) {
      return true;
    }
    const sourceWords = new Set(this.normalize(source.text).split(" "));
    // Other forms of a word, like "shipped" and "ships", start the same.
    const stems = new Set([...sourceWords].filter((word) => word.length >= 6).map((word) => word.slice(0, 5)));
    const found = words.filter((word) => sourceWords.has(word) || (word.length >= 6 && stems.has(word.slice(0, 5))));
    return found.length / words.length >= EvidenceService.MIN_CITED_OVERLAP;
  }

  /**
   * @returns The sentences of a text that best match an answer, best first
   */
  private matchingSentences(text: string, answer: string, max: number): string[] {
    const answerWords = [...new Set(this.distinctiveWords(answer))];
    const questionNumbers = this.numbersIn(this._question);
    const answerNumbers = this.numbersIn(answer).filter((number) => !questionNumbers.includes(number));
    if (answerWords.length === 0 && answerNumbers.length === 0) {
      return [];
    }

    return text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 20)
      .map((sentence) => {
        const words = new Set(this.normalize(sentence).split(" "));
        const numbers = this.numbersIn(sentence);
        const score = answerWords.filter((word) => words.has(word)).length
          + 2 * answerNumbers.filter((number) => numbers.includes(number)).length;
        return { sentence: sentence, score: score };
      })
      .filter((candidate) => candidate.score >= EvidenceService.MIN_SENTENCE_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map((candidate) => candidate.sentence.slice(0, EvidenceService.MAX_CONTEXT_LENGTH).trim());
  }

  /**
   * Splits an answer into statements, keeping the ids that follow a sentence with it, like "It shipped. [S1]".
   */
  private sentencesOfAnswer(answer: string): string[] {
    return answer
      .split(/(?<=[.!?](?:\s*[[【]\s*S\d+[^\]】]*[\]】])*)\s+|\n+/i)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence !== "");
  }

  private verifiedQuotes(quotes: string[], retrievedText: string): string[] {
    const text = this.normalize(retrievedText);
    return quotes.filter((quote) => {
      const normalizedQuote = this.normalize(quote);
      const isMeaningful = normalizedQuote.includes(" ") || /\d/.test(normalizedQuote);
      return isMeaningful && text.includes(normalizedQuote);
    });
  }

  private record(
    source: string,
    url: string,
    quotes: string[],
    retrievedText: string,
    automatic: boolean,
    document?: EvidenceDocument,
  ): void {
    this._retrievedTexts.set(url, `${this._retrievedTexts.get(url) ?? ""}\n${retrievedText}`);

    const existing = this._evidence.get(url);
    const referenceId = document?.id ?? url;
    this._evidence.set(url, {
      source: source,
      url: url,
      quotes: [...new Set([...(existing?.quotes ?? []), ...quotes])],
      referenceId: referenceId,
      automatic: (existing?.automatic ?? true) && automatic,
    });

    this.updateReference(referenceId, document?.source ?? source, document?.url ?? url, quotes, url);
  }

  /**
   * The question that is being answered.
   */
  get question(): string {
    return this._question;
  }

  /**
   * Changes with every question, also if it is asked twice.
   */
  get questionNumber(): number {
    return this._questionNumber;
  }

  /**
   * If anything verified has been found for the current question.
   */
  get hasEvidence(): boolean {
    return this._evidence.size > 0;
  }

  /**
   * Keeps track of where the sources were used, for the overview of sources.
   * @param answer The final answer to the user
   * @param citations The sources that support the answer
   */
  recordUse(answer: string, citations: EvidenceModel[]): void {
    const usedReferences = new Set<string>();

    citations.flatMap((citation) => citation.items).forEach((item) => {
      // The check on numbers can add quotes, which then are also what was used.
      const reference = this._references.get(item.referenceId);
      if (reference !== undefined) {
        this.updateReference(item.referenceId, reference.source, reference.url, item.quotes, item.url);
      }
      usedReferences.add(item.referenceId);
    });

    usedReferences.forEach((id) => {
      const reference = this._references.get(id);
      if (reference !== undefined) {
        this._references.add(id, {
          ...reference,
          usedIn: [...reference.usedIn, { question: this._question, answer: answer, date: this.today() }],
        });
      }
    });
  }

  private updateReference(id: string, source: string, url: string, quotes: string[], quoteUrl: string): void {
    const reference: ReferenceModel = this._references.get(id) ?? {
      id: id,
      source: source,
      url: url,
      firstRetrieved: this.today(),
      retrieved: [],
      usedIn: [],
    };

    const known = new Set(reference.retrieved.map((item) => this.normalize(item.quote)));
    const newQuotes = quotes.filter((quote) => !known.has(this.normalize(quote)));
    this._references.add(id, {
      ...reference,
      retrieved: [...reference.retrieved, ...newQuotes.map((quote) => ({ quote: quote, url: quoteUrl }))],
    });
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * @param finalText The final answer to the user
   * @returns The sources that support the answer. Empty if its content can't be traced back to them.
   */
  citationsFor(finalText: string): EvidenceModel[] {
    const citations = new Map<string, EvidenceModel>();
    this.supportingEvidence(finalText).forEach(({ source, url, quotes, referenceId }) => {
      const citation = citations.get(source) ?? { source: source, items: [] };
      citation.items.push({ url: url, quotes: quotes, referenceId: referenceId });
      citations.set(source, citation);
    });
    return Array.from(citations.values());
  }

  private supportingEvidence(finalText: string): EvidenceItem[] {
    const evidence = Array.from(this._evidence.values());
    const numbers = this.numbersIn(finalText).filter(
      (number) => !this.numbersIn(this._question).includes(number),
    );

    if (numbers.length > 0) {
      // Every number has to come from somewhere: one that doesn't may have been made up.
      const citations = evidence.map((item) => this.withQuotesForNumbers(item, numbers));
      const isCovered = (number: string) =>
        citations.some((item) => this.numbersIn(item.quotes.join(" ")).includes(number));
      if (!numbers.every(isCovered)) {
        return [];
      }
      return citations.filter((item) => {
        const quoteNumbers = this.numbersIn(item.quotes.join(" "));
        return numbers.some((number) => quoteNumbers.includes(number));
      });
    }

    const words = this.distinctiveWords(finalText);
    if (words.length === 0) {
      return [];
    }
    // An answer can draw on several pages of one document, so the overlap is that of the whole source.
    const wordsIn = (items: EvidenceItem[]) => new Set(this.normalize(items.flatMap((item) => item.quotes).join(" ")).split(" "));
    return evidence.filter((item) => {
      const quoted = wordsIn(evidence.filter((other) => other.referenceId === item.referenceId));
      const overlap = words.filter((word) => quoted.has(word)).length / words.length;
      const ownWords = wordsIn([item]);
      return overlap >= EvidenceService.MIN_WORD_OVERLAP && words.some((word) => ownWords.has(word));
    });
  }

  /**
   * The model doesn't always quote everything it used. A number from the text it read is still traceable, so the
   * sentence holding it is added as a quote, which lets the reader check it.
   */
  private withQuotesForNumbers(item: EvidenceItem, numbers: string[]): EvidenceItem {
    const sentences = (this._retrievedTexts.get(item.url) ?? "").split(/(?<=[.!?])\s+|\n+/);
    const quotes = [...item.quotes];

    numbers.forEach((number) => {
      if (!this.numbersIn(quotes.join(" ")).includes(number)) {
        const sentence = sentences.find((candidate) => this.numbersIn(candidate).includes(number));
        if (sentence !== undefined) {
          quotes.push(this.contextOf(sentence, number));
        }
      }
    });
    return { ...item, quotes: quotes };
  }

  private contextOf(sentence: string, number: string): string {
    if (sentence.length <= EvidenceService.MAX_CONTEXT_LENGTH) {
      return sentence.trim();
    }
    const position = Math.max(0, sentence.search(new RegExp(number.split(".").join("[.]"))));
    const start = Math.max(0, position - EvidenceService.MAX_CONTEXT_LENGTH / 2);
    return sentence.slice(start, start + EvidenceService.MAX_CONTEXT_LENGTH).trim();
  }

  private numbersIn(text: string): string[] {
    // The numbers of a list and the digits in a link say nothing about the facts in a text.
    const relevantText = text.replace(/https?:\/\/\S+/g, " ").replace(/(^|[\s:;])\d{1,2}[.)](?=\s)/g, "$1");
    return (relevantText.match(EvidenceService.NUMBER) ?? [])
      .map((number) => number.replace(/,/g, ""))
      // A date can be written as 2025-04-01 or as April 1.
      .map((number) => number.replace(/^0+(?=\d)/, ""));
  }

  /**
   * @returns The words of a text that add something to the question, which is where the actual answer is.
   */
  private distinctiveWords(text: string): string[] {
    const questionWords = new Set(this.normalize(this._question).split(" "));
    return this.normalize(text.replace(/https?:\/\/\S+/g, " "))
      .split(" ")
      .filter(
        (word) =>
          word.length >= EvidenceService.MIN_DISTINCTIVE_WORD_LENGTH &&
          !EvidenceService.IGNORED_WORDS.has(word) &&
          !questionWords.has(word),
      );
  }

  /**
   * @returns The text in the form that quotes are compared in
   */
  normalize(text: string): string {
    return text.toLowerCase().replace(/['’]/g, "").replace(/[^\p{L}\p{N}.,]+/gu, " ").replace(/[.,](?!\p{N})/gu, " ").replace(/\s+/g, " ").trim();
  }
}
