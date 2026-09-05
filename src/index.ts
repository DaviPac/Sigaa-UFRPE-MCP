#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerAuthTools } from "./tools/auth.js";
import { registerRawTools } from "./tools/raw.js";
import { registerDownloadTools } from "./tools/download.js";
import { registerPortalTools } from "./tools/portal.js";
import { registerTurmaTools } from "./tools/turmas.js";
import { registerNotasTools } from "./tools/notas.js";
import { registerCurriculoTools } from "./tools/curriculo.js";
import { registerDocumentosTools } from "./tools/documentos.js";

const server = new McpServer({
  name: "sigaa-ufrpe-mcp",
  version: "0.1.0",
});

registerAuthTools(server);
registerRawTools(server);
registerDownloadTools(server);
registerPortalTools(server);
registerTurmaTools(server);
registerNotasTools(server);
registerCurriculoTools(server);
registerDocumentosTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("sigaa-ufrpe-mcp: servidor MCP conectado via stdio.");
