import TurndownService from "turndown";

/**
 * Tools to turn HTML pages into text that a model can read.
 */
export class HtmlUtils {

  /**
   * Removes the things a model can't see, like class / style / images, etc.
   * @param doc HTML Document page
   * @returns adjusted HTML Document page
   */
  static simplifyDocument(doc: Document): Document {
    const elements = doc.querySelectorAll("*");
    elements.forEach((element) => {
      if (
        element.tagName === "STYLE" ||
        element.tagName === "IMG" ||
        element.tagName === "SCRIPT"
      ) {
        element.remove();
      } else {
        const classAttribute = element.getAttribute("class");
        if (classAttribute) {
          element.removeAttribute("class");
        }
        const styleAttribute = element.getAttribute("style");
        if (styleAttribute) {
          element.removeAttribute("style");
        }
        const urlAttribute = element.getAttribute("href");
        if (urlAttribute) {
          element.setAttribute("href", "");
        }
      }
    });
    return doc;
  }

  static toMarkdown(node: Document | HTMLElement): string {
    // RagService splits documents on '#' headings, which the default style doesn't use for all levels.
    return new TurndownService({ headingStyle: "atx" }).turndown(node);
  }
}
