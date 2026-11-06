/** Saves a file in the downloads. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers start the download only after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves Markdown as a file in the downloads. */
export function downloadMarkdown(markdown: string, fileName: string): void {
  downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `${fileName}.md`);
}
