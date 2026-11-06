import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import htmlToPdfmake from "html-to-pdfmake";
import pdfMake from "pdfmake/build/pdfmake";
import vfs from "pdfmake/build/vfs_fonts";
import { downloadBlob } from "./exportFile";

pdfMake.addVirtualFileSystem(vfs);

/** The width of the text on an A4 page with 2 cm margins, in points. */
const TEXT_WIDTH = 595 - 2 * 57;

/** Replace html-to-pdfmake's own sizes, which are made for web pages and are too large on paper. */
const TAG_STYLES = {
  h1: { fontSize: 20, bold: true, marginBottom: 6 },
  h2: { fontSize: 14, bold: true, marginTop: 14, marginBottom: 4 },
  h3: { fontSize: 12, bold: true, marginTop: 10, marginBottom: 4 },
  h4: { fontSize: 11, bold: true, marginBottom: 4 },
  a: { color: "#0645ad", decoration: "underline" },
  p: { margin: [0, 3, 0, 6] },
};

const PDF_STYLES = {
  "html-h1": { fontSize: 20, bold: true, margin: [0, 0, 0, 6] },
  "html-h2": { fontSize: 14, bold: true, margin: [0, 14, 0, 4], color: "#073642" },
  "html-h3": { fontSize: 12, bold: true, margin: [0, 10, 0, 4] },
  "html-p": { margin: [0, 3, 0, 6] },
  "html-blockquote": { margin: [14, 2, 0, 6], color: "#555555", italics: true },
  "html-a": { color: "#0645ad", decoration: "underline" },
  "html-code": { font: "Roboto", background: "#f0f0f0" },
  "html-img": { margin: [0, 8, 0, 2], alignment: "center" },
  "html-table": { margin: [0, 4, 0, 8] },
};

/** Makes pictures fit the page, at most a third of its height. */
function fitImages(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(fitImages);
  } else if (node !== null && typeof node === "object") {
    const element = node as Record<string, unknown>;
    if (typeof element.image === "string") {
      element.fit = [TEXT_WIDTH, 280];
      delete element.width;
      delete element.height;
    }
    Object.values(element).forEach(fitImages);
  }
}

/**
 * Makes a PDF of the Markdown and saves it in the downloads. Pictures must be data URLs, so the PDF needs no
 * internet to be read.
 */
export async function downloadPdf(markdown: string, fileName: string, title: string): Promise<void> {
  // Markdown drops data URLs by default; here they are the pictures this app put in, so they are kept.
  const urlTransform = (url: string) => (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(url) ? url : defaultUrlTransform(url));
  const html = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], urlTransform: urlTransform }, markdown));
  const { content, images } = htmlToPdfmake(html, { imagesByReference: true, removeExtraBlanks: true, defaultStyles: TAG_STYLES });
  fitImages(content);
  const blob = await pdfMake
    .createPdf({
      info: { title: title },
      pageSize: "A4",
      pageMargins: [57, 57, 57, 57],
      content: content,
      images: images,
      styles: PDF_STYLES,
      defaultStyle: { fontSize: 10.5, lineHeight: 1.25 },
      footer: (page: number, pages: number) => ({ text: `${page} / ${pages}`, alignment: "center", fontSize: 8, color: "#888888", margin: [0, 20, 0, 0] }),
    })
    .getBlob();
  downloadBlob(blob, `${fileName}.pdf`);
}
