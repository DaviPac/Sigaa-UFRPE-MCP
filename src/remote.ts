#!/usr/bin/env node
// Entry point remoto (HTTP): expõe o mesmo MCP server via Streamable HTTP em
// vez de stdio, para clientes que só falam com servidores remotos (Claude.ai
// web, apps mobile). Cada conexão MCP ganha seu próprio par
// McpServer+StreamableHTTPServerTransport (e portanto sua própria
// SigaaSession isolada) — ver src/mcpServer.ts.
import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createSigaaMcpServer } from "./mcpServer.js";

const PORT = Number(process.env.PORT ?? 3000);
const REMOTE_TOKEN = process.env.SIGAA_MCP_REMOTE_TOKEN;

if (!REMOTE_TOKEN) {
  console.error(
    "SIGAA_MCP_REMOTE_TOKEN não definido. Recusando iniciar o servidor remoto sem um token de " +
      "acesso — nunca exponha o endpoint /mcp sem autenticação."
  );
  process.exit(1);
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

interface ConnectionEntry {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}
const connections = new Map<string, ConnectionEntry>();

const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [sessionId, entry] of connections) {
    if (now - entry.lastActivity > IDLE_TIMEOUT_MS) {
      connections.delete(sessionId);
      void entry.transport.close();
    }
  }
}, IDLE_SWEEP_INTERVAL_MS);
sweepInterval.unref();

function isAuthorized(req: http.IncomingMessage): boolean {
  const header = req.headers["authorization"];
  if (typeof header !== "string") return false;
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) return false;

  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(REMOTE_TOKEN as string);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : undefined;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const httpServer = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Mcp-Session-Id, Authorization, Accept, Last-Event-ID"
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (url.pathname !== "/mcp") {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  try {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }

    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;
    const existing = sessionId ? connections.get(sessionId) : undefined;

    if (existing) {
      existing.lastActivity = Date.now();
      const parsedBody = req.method === "POST" ? await readJsonBody(req) : undefined;
      await existing.transport.handleRequest(req, res, parsedBody);
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 400, { error: "Sessão desconhecida. Envie um POST de inicialização primeiro." });
      return;
    }

    const parsedBody = await readJsonBody(req);
    if (!isInitializeRequest(parsedBody)) {
      sendJson(res, 400, {
        error: "Requisição inválida: esperado um 'initialize' quando não há Mcp-Session-Id.",
      });
      return;
    }

    const { server } = createSigaaMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        connections.set(sid, { transport, lastActivity: Date.now() });
      },
      onsessionclosed: (sid) => {
        connections.delete(sid);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) connections.delete(transport.sessionId);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  } catch (err) {
    console.error("sigaa-ufrpe-mcp: erro tratando requisição /mcp:", err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Erro interno." });
    }
  }
});

httpServer.listen(PORT, () => {
  console.error(`sigaa-ufrpe-mcp: servidor remoto ouvindo na porta ${PORT} (endpoint POST/GET/DELETE /mcp).`);
});

async function shutdown(): Promise<void> {
  console.error("sigaa-ufrpe-mcp: encerrando, fechando conexões ativas...");
  clearInterval(sweepInterval);
  for (const [sessionId, entry] of connections) {
    connections.delete(sessionId);
    await entry.transport.close();
  }
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
