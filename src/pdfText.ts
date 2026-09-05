import { PDFParse } from "pdf-parse";

/** Extrai o texto de um PDF para embutir na resposta de uma tool de download,
 * garantindo que o conteúdo seja legível mesmo que o cliente MCP não saiba
 * interpretar o content item "resource" binário. Nunca lança — PDFs
 * escaneados/protegidos/corrompidos apenas resultam em `undefined`. */
export async function tryExtractPdfText(buffer: Buffer): Promise<string | undefined> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    return text || undefined;
  } catch {
    return undefined;
  } finally {
    await parser.destroy();
  }
}
