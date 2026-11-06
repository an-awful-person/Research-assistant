import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_PAGES = 1500;

/**
 * @param bytes A PDF file
 * @returns The text per page
 */
export async function pdfToPages(bytes: Uint8Array): Promise<string[]> {
  const loadingTask = getDocument({
    data: bytes,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const document = await loadingTask.promise;

  const pages: string[] = [];
  try {
    for (let number = 1; number <= Math.min(document.numPages, MAX_PAGES); number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
          .join("")
          .replace(/[ \t]+/g, " ")
          .trim(),
      );
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages;
}
