import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { downloadFile } from "../sigaaClient.js";
import { saveDownload } from "../downloads.js";
import { session } from "../session.js";
import { jsonResult, safeTool } from "../mcpHelpers.js";
import { ALLOWED_HOSTS } from "../constants.js";

export function registerDownloadTools(server: McpServer): void {
  server.registerTool(
    "sigaa_download_file",
    {
      title: "Baixar um arquivo arbitrário do SIGAA",
      description:
        `Monta e dispara uma requisição (method + url + campos de formulário) contra ${[...ALLOWED_HOSTS].join(", ")} ` +
        "esperando um arquivo binário como resposta (PDF, anexo de cronograma, etc.) em vez de " +
        "HTML. Detecta e rejeita páginas de erro/sessão expirada disfarçadas de arquivo (redirect " +
        "ou Content-Type text/html). Salva o arquivo em disco e devolve o caminho — generaliza " +
        "os fluxos de download hoje hardcoded na API Go (anexos de cronograma, histórico/vínculo em PDF) " +
        "para qualquer ação de download do SIGAA.",
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
      },
    },
    safeTool(async ({ method, url, formFields, referer }) => {
      let body: string | undefined;
      let contentType: string | undefined;
      if (formFields) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(formFields)) params.set(key, value);
        body = params.toString();
        contentType = "application/x-www-form-urlencoded";
      }

      const res = await downloadFile({
        method,
        url,
        jsessionid: session.jsessionid,
        referer,
        body,
        contentType,
      });
      if (res.jsessionid) session.update({ jsessionid: res.jsessionid });

      const path = await saveDownload(res.buffer, res.filename);

      return jsonResult({
        path,
        filename: res.filename ?? null,
        contentType: res.contentType,
        bytes: res.buffer.length,
      });
    })
  );
}
