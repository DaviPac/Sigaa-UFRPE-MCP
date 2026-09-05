import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { doSigaaRequest, fetchPortalPDF } from "../sigaaClient.js";
import { parseAtestadoMatricula } from "../parsers.js";
import { URL_PORTAL_DISCENTE } from "../constants.js";
import { saveDownload } from "../downloads.js";
import { session } from "../session.js";
import { jsonResult, safeTool } from "../mcpHelpers.js";

const JSCOOK_HISTORICO = "menu_form_menu_discente_discente_menu:A]#{ portalDiscente.historico }";
const JSCOOK_VINCULO = "menu_form_menu_discente_discente_menu:A]#{ declaracaoVinculo.emitirDeclaracao }";
const JSCOOK_ATESTADO_MATRICULA = "menu_form_menu_discente_discente_menu:A]#{ portalDiscente.atestadoMatricula }";

/** Port de GetAtestadoMatricula (sigaa.go:150): busca a página (texto puro)
 * do atestado de matrícula, que depois é parseada por regex. */
async function getAtestadoMatriculaTexto(viewState: string, jsessionid: string) {
  const payload = new URLSearchParams();
  payload.set("menu:form_menu_discente", "menu:form_menu_discente");
  payload.set("id", "107543");
  payload.set("jscook_action", JSCOOK_ATESTADO_MATRICULA);
  payload.set("javax.faces.ViewState", viewState);

  const res = await doSigaaRequest({
    method: "POST",
    url: URL_PORTAL_DISCENTE,
    jsessionid,
    referer: URL_PORTAL_DISCENTE,
    body: payload.toString(),
    contentType: "application/x-www-form-urlencoded",
  });

  return { texto: res.$.text(), jsessionid: res.jsessionid };
}

export function registerDocumentosTools(server: McpServer): void {
  server.registerTool(
    "sigaa_get_matricula",
    {
      title: "Atestado de matrícula (estruturado)",
      description:
        "Período letivo, vínculo, curso e turmas matriculadas no semestre, extraídos do atestado " +
        "de matrícula do SIGAA. Requer um ViewState válido — chame 'sigaa_main_data' antes se " +
        "ainda não tiver um.",
      inputSchema: {},
    },
    safeTool(async () => {
      const { jsessionid, viewState } = session.requireAuth();
      if (!viewState) {
        throw new Error("ViewState ausente. Chame 'sigaa_main_data' primeiro para obter um ViewState válido.");
      }
      const result = await getAtestadoMatriculaTexto(viewState, jsessionid);
      session.update({ jsessionid: result.jsessionid });
      const atestado = parseAtestadoMatricula(result.texto);
      return jsonResult(atestado);
    })
  );

  server.registerTool(
    "sigaa_get_historico_pdf",
    {
      title: "Baixar histórico escolar (PDF)",
      description:
        "Baixa o histórico escolar do aluno em PDF e salva em disco. Requer um ViewState válido " +
        "— chame 'sigaa_main_data' antes se ainda não tiver um.",
      inputSchema: {},
    },
    safeTool(async () => {
      const { jsessionid, viewState } = session.requireAuth();
      if (!viewState) {
        throw new Error("ViewState ausente. Chame 'sigaa_main_data' primeiro para obter um ViewState válido.");
      }
      const pdf = await fetchPortalPDF(JSCOOK_HISTORICO, viewState, jsessionid);
      session.update({ jsessionid: pdf.jsessionid });
      const path = await saveDownload(pdf.buffer, pdf.filename ?? "historico.pdf");
      return jsonResult({ path, bytes: pdf.buffer.length, contentType: pdf.contentType });
    })
  );

  server.registerTool(
    "sigaa_get_vinculo_pdf",
    {
      title: "Baixar declaração de vínculo (PDF)",
      description:
        "Baixa a declaração de vínculo do aluno em PDF e salva em disco. Requer um ViewState " +
        "válido — chame 'sigaa_main_data' antes se ainda não tiver um.",
      inputSchema: {},
    },
    safeTool(async () => {
      const { jsessionid, viewState } = session.requireAuth();
      if (!viewState) {
        throw new Error("ViewState ausente. Chame 'sigaa_main_data' primeiro para obter um ViewState válido.");
      }
      const pdf = await fetchPortalPDF(JSCOOK_VINCULO, viewState, jsessionid);
      session.update({ jsessionid: pdf.jsessionid });
      const path = await saveDownload(pdf.buffer, pdf.filename ?? "vinculo.pdf");
      return jsonResult({ path, bytes: pdf.buffer.length, contentType: pdf.contentType });
    })
  );
}
