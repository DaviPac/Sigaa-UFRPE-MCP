import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SigaaSession } from "./session.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerRawTools } from "./tools/raw.js";
import { registerDownloadTools } from "./tools/download.js";
import { registerPortalTools } from "./tools/portal.js";
import { registerTurmaTools } from "./tools/turmas.js";
import { registerNotasTools } from "./tools/notas.js";
import { registerCurriculoTools } from "./tools/curriculo.js";
import { registerDocumentosTools } from "./tools/documentos.js";

/** Monta um McpServer completo com uma SigaaSession nova e isolada. Chame uma
 * vez por conexão (stdio: uma vez no processo todo; remoto/HTTP: uma vez por
 * conexão MCP) — nunca reaproveite o mesmo par entre clientes diferentes. */
export function createSigaaMcpServer(): { server: McpServer; session: SigaaSession } {
  const server = new McpServer({
    name: "sigaa-ufrpe-mcp",
    version: "0.1.0",
  });
  const session = new SigaaSession();

  registerAuthTools(server, session);
  registerRawTools(server, session);
  registerDownloadTools(server, session);
  registerPortalTools(server, session);
  registerTurmaTools(server, session);
  registerNotasTools(server, session);
  registerCurriculoTools(server, session);
  registerDocumentosTools(server, session);

  return { server, session };
}
