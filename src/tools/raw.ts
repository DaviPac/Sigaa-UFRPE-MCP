import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { rawSigaaRequest, parseViewState } from "../sigaaClient.js";
import type { SigaaSession } from "../session.js";
import { jsonResult, safeTool } from "../mcpHelpers.js";
import { ALLOWED_HOSTS } from "../constants.js";

const MAX_HTML_CHARS = 80_000;

function truncate(html: string): { html: string; truncated: boolean } {
  if (html.length <= MAX_HTML_CHARS) return { html, truncated: false };
  return { html: html.slice(0, MAX_HTML_CHARS), truncated: true };
}

export function registerRawTools(server: McpServer, session: SigaaSession): void {
  server.registerTool(
    "sigaa_get_html",
    {
      title: "Ver HTML cru de uma página do SIGAA",
      description:
        `Busca uma URL sob ${[...ALLOWED_HOSTS].join(", ")} usando a sessão SIGAA atual (se ` +
        "houver) e devolve o HTML bruto da resposta, sem nenhum parsing — inclusive páginas " +
        "de erro/sessão expirada, para inspeção. Use 'sigaa_login' antes se a página exigir " +
        "autenticação.",
      inputSchema: {
        url: z.string().url().describe("URL completa da página a buscar."),
        method: z.enum(["GET", "POST"]).default("GET").describe("Método HTTP."),
        referer: z.string().url().optional().describe("Header Referer a enviar, se necessário."),
      },
    },
    safeTool(async ({ url, method, referer }) => {
      const res = await rawSigaaRequest({
        method,
        url,
        jsessionid: session.jsessionid,
        referer,
      });
      if (res.jsessionid) session.update({ jsessionid: res.jsessionid });

      const { html, truncated } = truncate(res.html);
      return jsonResult({
        status: res.status,
        finalUrl: res.finalUrl,
        contentType: res.headers["content-type"] ?? null,
        html,
        truncated,
      });
    })
  );

  server.registerTool(
    "sigaa_raw_request",
    {
      title: "Montar e disparar uma requisição customizada ao SIGAA",
      description:
        `Monta e envia uma requisição HTTP arbitrária (method + url + campos de formulário) ` +
        `contra qualquer URL sob ${[...ALLOWED_HOSTS].join(", ")}, anexando automaticamente o ` +
        "cookie JSESSIONID da sessão atual. Use para reproduzir uma ação JSF descoberta ao " +
        "inspecionar o HTML (ex.: um 'jscook_action' ou 'jsfcljs' visto num atributo onclick) " +
        "quando não existe uma tool dedicada para essa ação. Devolve o HTML bruto da resposta " +
        "e, se encontrado, o novo javax.faces.ViewState — atualize seu próximo formFields com " +
        "esse valor quando a página exigir ViewState.",
      inputSchema: {
        method: z.enum(["GET", "POST"]).describe("Método HTTP."),
        url: z.string().url().describe("URL completa de destino."),
        formFields: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            "Campos de formulário a enviar como application/x-www-form-urlencoded (POST). " +
              "Inclua 'javax.faces.ViewState' quando a página SIGAA exigir."
          ),
        referer: z.string().url().optional().describe("Header Referer a enviar."),
        contentType: z
          .string()
          .optional()
          .describe("Content-Type customizado. Padrão: application/x-www-form-urlencoded quando formFields é enviado."),
      },
    },
    safeTool(async ({ method, url, formFields, referer, contentType }) => {
      let body: string | undefined;
      let resolvedContentType = contentType;
      if (formFields) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(formFields)) params.set(key, value);
        body = params.toString();
        resolvedContentType ??= "application/x-www-form-urlencoded";
      }

      const res = await rawSigaaRequest({
        method,
        url,
        jsessionid: session.jsessionid,
        referer,
        body,
        contentType: resolvedContentType,
      });
      if (res.jsessionid) session.update({ jsessionid: res.jsessionid });

      let viewState: string | null = null;
      try {
        viewState = parseViewState(res.$);
        session.update({ viewState });
      } catch {
        // Nem toda página JSF tem ViewState (ex.: páginas de erro) — sem problema.
      }

      const { html, truncated } = truncate(res.html);
      return jsonResult({
        status: res.status,
        finalUrl: res.finalUrl,
        contentType: res.headers["content-type"] ?? null,
        jsessionid: res.jsessionid || null,
        viewState,
        html,
        truncated,
      });
    })
  );
}
