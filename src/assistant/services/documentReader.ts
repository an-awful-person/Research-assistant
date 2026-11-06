export type ReadDocument = {
  parts: string[];
  hasPages: boolean;
};

export class DocumentReadError extends Error {}

const LEGACY_WORD_MESSAGE = "Old .doc files can't be read. Save it as .docx first.";

/**
 * Reads the text of a file in this browser, so that it isn't sent anywhere for this. Nothing in a file gets to run.
 * @param file The file
 * @returns The text of the file
 */
export async function readDocumentFile(file: File): Promise<ReadDocument> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  switch (extension) {
    case "txt":
    case "md":
      return { parts: [await file.text()], hasPages: false };
    case "pdf":
      return readPdf(file);
    case "docx":
      return readWord(file);
    case "doc":
      throw new DocumentReadError(LEGACY_WORD_MESSAGE);
    default:
      throw new DocumentReadError("Only .docx, .pdf, .txt and .md files can be read.");
  }
}

async function readPdf(file: File): Promise<ReadDocument> {
  // These are large, and only needed once a PDF is uploaded.
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  // Failing to get the file into memory says nothing about the file, unlike failing to read it as a PDF.
  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: data });
  try {
    const document = await loadingTask.promise;
    const parts: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      parts.push(
        content.items
          .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
          .join("")
          .replace(/[ \t]+/g, " ")
          .trim(),
      );
      page.cleanup();
    }
    return { parts: parts, hasPages: true };
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") {
      throw new DocumentReadError("This PDF is protected with a password.");
    }
    if (error instanceof RangeError) {
      throw error;
    }
    throw new DocumentReadError("This PDF could not be read. It may be damaged.");
  } finally {
    await loadingTask.destroy();
  }
}

async function readWord(file: File): Promise<ReadDocument> {
  const mammoth = await import("mammoth");
  const data = await file.arrayBuffer();
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: data });
    return { parts: [result.value], hasPages: false };
  } catch (error) {
    if (error instanceof RangeError) {
      throw error;
    }
    throw new DocumentReadError("This Word file could not be read. It may be damaged.");
  }
}
