import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPaginaPortal, login } from "../sigaaClient.js";
import type { SigaaSession } from "../session.js";
import { jsonResult, safeTool } from "../mcpHelpers.js";

export function registerAuthTools(server: McpServer, session: SigaaSession): void {
  server.registerTool(
    "sigaa_login",
    {
      title: "Login no SIGAA",
      description:
        "Autentica no SIGAA UFRPE com usuário e senha, lidando com o eventual interstitial " +
        "'Aviso de Logon'. A sessão (JSESSIONID/ViewState) fica guardada em memória neste " +
        "servidor MCP e é reaproveitada automaticamente pelas demais tools — não é preciso " +
        "repassar tokens manualmente.",
      inputSchema: {
        username: z.string().describe("Usuário SIGAA (matrícula ou login)."),
        password: z.string().describe("Senha SIGAA."),
      },
    },
    safeTool(async ({ username, password }) => {
      const jsessionid = await login(username, password);
      session.reset();
      session.update({ jsessionid });

      let nome: string | undefined;
      try {
        const portal = await getPaginaPortal(jsessionid);
        session.update({ jsessionid: portal.jsessionid, viewState: portal.viewState });
        nome =
          portal.$("p.usuario span").first().text().trim() ||
          portal.$(".usuario > span").first().text().trim() ||
          undefined;
        if (nome) session.update({ nome });
      } catch {
        // Login foi bem-sucedido mesmo que não consigamos ler o portal agora;
        // deixe o erro para a próxima tool que precisar do portal.
      }

      return jsonResult({
        status: "autenticado",
        nome: nome ?? null,
        message: nome
          ? `Login efetuado com sucesso. Bem-vindo(a), ${nome}.`
          : "Login efetuado com sucesso.",
      });
    })
  );
}
