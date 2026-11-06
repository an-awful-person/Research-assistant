import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const PRINT_STYLE = `
  @page { margin: 2cm; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.5; color: #111; max-width: 48em; margin: 0 auto; }
  h1 { font-size: 20pt; margin: 0 0 0.25em 0; }
  h2 { font-size: 14pt; margin: 1.4em 0 0.4em 0; border-bottom: 1px solid #ccc; padding-bottom: 0.15em; break-after: avoid; }
  h3 { font-size: 12pt; break-after: avoid; }
  p, li { overflow-wrap: anywhere; }
  blockquote { margin: 0.3em 0 0.3em 1em; padding-left: 0.75em; border-left: 3px solid #bbb; color: #444; }
  table { border-collapse: collapse; margin: 0.5em 0; }
  th, td { border: 1px solid #999; padding: 0.25em 0.5em; text-align: left; vertical-align: top; }
  pre, code { font-family: "DejaVu Sans Mono", Menlo, monospace; font-size: 9.5pt; }
  pre { white-space: pre-wrap; background: #f4f4f4; padding: 0.5em; }
  a { color: #0645ad; }
`;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Saves Markdown as a file in the downloads. */
export function downloadMarkdown(markdown: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.md`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers start the download only after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The page that is printed, as a complete HTML document. */
export function printableHtml(markdown: string, title: string): string {
  const body = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_STYLE}</style></head><body>${body}</body></html>`;
}

/**
 * Opens the print dialog for the Markdown, where the user can choose to save it as a PDF.
 * @param title The name the browser suggests for the PDF
 */
export function printMarkdown(markdown: string, title: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);

  const page = frame.contentWindow;
  if (page === null) {
    frame.remove();
    throw new Error("The page to print could not be made.");
  }
  page.document.open();
  page.document.write(printableHtml(markdown, title));
  page.document.close();

  // Browsers suggest the title of the top page as the file name, so it changes while printing.
  const previousTitle = document.title;
  document.title = title;
  const cleanUp = () => {
    document.title = previousTitle;
    // Removing it at once would cancel printing in some browsers.
    setTimeout(() => frame.remove(), 1000);
  };
  page.addEventListener("afterprint", cleanUp, { once: true });
  page.focus();
  page.print();
  // Browsers that block while the dialog is open have printed by now; afterprint may not come in all of them.
  setTimeout(() => {
    if (document.title === title) cleanUp();
  }, 60000);
}
