declare module "pdf-parse" {
  type PdfParseResult = {
    numpages?: number;
    numrender?: number;
    info?: any;
    metadata?: any;
    text: string;
    version?: string;
  };

  function pdfParse(data: Buffer | Uint8Array | ArrayBuffer): Promise<PdfParseResult>;
  export default pdfParse;
}
