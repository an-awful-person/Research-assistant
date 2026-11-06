/* The parts of pdfmake 0.3 and html-to-pdfmake that are used here. Neither package has types of its own. */
declare module "pdfmake/build/pdfmake" {
  type PdfDocument = { getBlob(): Promise<Blob> };
  const pdfMake: {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    createPdf(definition: object): PdfDocument;
  };
  export default pdfMake;
}

declare module "pdfmake/build/vfs_fonts" {
  const vfs: Record<string, string>;
  export default vfs;
}

declare module "html-to-pdfmake" {
  function htmlToPdfmake(
    html: string,
    options?: { imagesByReference?: boolean; removeExtraBlanks?: boolean; defaultStyles?: object },
  ): { content: unknown[]; images: Record<string, string> };
  export default htmlToPdfmake;
}
