import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { doSigaaRequest } from "../sigaaClient.js";
import { URL_PORTAL_DISCENTE } from "../constants.js";
import type { DisciplinaNotas } from "../types.js";
import type { SigaaSession } from "../session.js";
import { jsonResult, safeTool } from "../mcpHelpers.js";

/** Port de getPaginaNotas + GetNotas (sigaa.go:1376/1397): relatório de notas
 * do semestre atual e de semestres anteriores. */
async function getNotas(jsessionid: string, viewState: string) {
  const payload = new URLSearchParams();
  payload.set("menu:form_menu_discente", "menu:form_menu_discente");
  payload.set("id", "107543");
  payload.set("jscook_action", "menu_form_menu_discente_discente_menu:A]#{ relatorioNotasAluno.gerarRelatorio }");
  payload.set("javax.faces.ViewState", viewState);

  const res = await doSigaaRequest({
    method: "POST",
    url: URL_PORTAL_DISCENTE,
    jsessionid,
    referer: URL_PORTAL_DISCENTE,
    body: payload.toString(),
    contentType: "application/x-www-form-urlencoded",
  });

  const $ = res.$;
  const disciplinas: DisciplinaNotas[] = [];
  const anteriores: DisciplinaNotas[] = [];

  $("table.tabelaRelatorio").each((i, tableEl) => {
    const $table = $(tableEl);
    const headerNames: string[] = [];
    $table.find("thead tr th").each((_j, th) => {
      headerNames.push($(th).text().trim());
    });

    $table.find("tbody tr.linha").each((_j, row) => {
      const $row = $(row);
      const disciplina: DisciplinaNotas = { codigo: "", nome: "", notas: {}, resultado: "", faltas: "", situacao: "" };

      $row.find("td").each((k, cell) => {
        if (k >= headerNames.length) return;
        const headerName = headerNames[k];
        const cellValue = $(cell).text().trim();
        switch (headerName) {
          case "Código": disciplina.codigo = cellValue; break;
          case "Disciplina": disciplina.nome = cellValue; break;
          case "Resultado": disciplina.resultado = cellValue; break;
          case "Faltas": disciplina.faltas = cellValue; break;
          case "Situação": disciplina.situacao = cellValue; break;
          default:
            if (cellValue && cellValue !== "--") disciplina.notas[headerName] = cellValue;
        }
      });

      if (disciplina.nome) {
        if (i === 0) disciplinas.push(disciplina);
        else anteriores.push(disciplina);
      }
    });
  });

  // A página de notas não devolve um ViewState novo utilizável para as
  // próximas chamadas (mesmo comportamento do backend Go) — refaça
  // sigaa_main_data depois se for navegar para outra página.
  return { disciplinas, anteriores, jsessionid: res.jsessionid };
}

export function registerNotasTools(server: McpServer, session: SigaaSession): void {
  server.registerTool(
    "sigaa_get_notas",
    {
      title: "Relatório de notas",
      description:
        "Notas do semestre atual e de semestres anteriores. Requer um ViewState válido — chame " +
        "'sigaa_main_data' antes se ainda não tiver um.",
      inputSchema: {},
    },
    safeTool(async () => {
      const { jsessionid, viewState } = session.requireAuth();
      if (!viewState) {
        throw new Error("ViewState ausente. Chame 'sigaa_main_data' primeiro para obter um ViewState válido.");
      }
      const result = await getNotas(jsessionid, viewState);
      session.update({ jsessionid: result.jsessionid });
      return jsonResult({ notas: result.disciplinas, anteriores: result.anteriores });
    })
  );
}
