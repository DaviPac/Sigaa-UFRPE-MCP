#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSigaaMcpServer } from "./mcpServer.js";

const { server } = createSigaaMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("sigaa-ufrpe-mcp: servidor MCP conectado via stdio.");
