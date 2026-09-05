import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DOWNLOAD_DIR = process.env.SIGAA_MCP_DOWNLOAD_DIR
  ? path.resolve(process.env.SIGAA_MCP_DOWNLOAD_DIR)
  : path.resolve(process.cwd(), "downloads");

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, "_").replace(/\.\./g, "_").trim() || randomUUID();
}

/** Salva um buffer em disco na pasta de downloads do MCP, devolvendo o
 * caminho absoluto final (com sufixo numérico se já existir um arquivo com o
 * mesmo nome). */
export async function saveDownload(buffer: Buffer, suggestedFilename: string | undefined): Promise<string> {
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  const base = sanitizeFilename(suggestedFilename ?? randomUUID());
  const filePath = path.join(DOWNLOAD_DIR, `${Date.now()}-${base}`);
  await writeFile(filePath, buffer);
  return filePath;
}
