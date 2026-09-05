import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { doSigaaRequest, getPaginaPortal, parseViewState } from "../sigaaClient.js";
import { parseCronograma, parseNoticia, verifyTurmaPage } from "../parsers.js";
import { URL_FREQUENCIA, URL_PORTAL_DISCENTE } from "../constants.js";
import { PRESENCA_NAO_LANCADA, TurmaInfo } from "../types.js";
import type { SigaaSession } from "../session.js";
import { jsonResult, safeTool } from "../mcpHelpers.js";

/** Port de getPaginaTurma (sigaa.go:1292): entra na turma virtual e extrai
 * notícia + cronograma, validando a identidade da turma carregada. */
async function getPaginaTurma(turmaNome: string, info: TurmaInfo, jsessionid: string, viewState: string) {
  const payload = new URLSearchParams();
  payload.set(info.formName, info.formName);
  payload.set(info.componentId, info.componentId);
  payload.set("javax.faces.ViewState", viewState);
  payload.set("frontEndIdTurma", info.frontEndId);

  const res = await doSigaaRequest({
    method: "POST",
    url: URL_PORTAL_DISCENTE,
    jsessionid,
    referer: URL_PORTAL_DISCENTE,
    body: payload.toString(),
    contentType: "application/x-www-form-urlencoded",
  });

  verifyTurmaPage(res.$, turmaNome);

  const newViewState = parseViewState(res.$, `turma_${turmaNome}`);
  const noticia = parseNoticia(res.$);
  const cronograma = parseCronograma(res.$);

  return { noticia, cronograma, jsessionid: res.jsessionid, viewState: newViewState };
}

/** Port de getPaginaFrequencia (sigaa.go:1326): total de faltas lançadas na turma. */
async function getPaginaFrequencia(turmaNome: string, jsessionid: string, viewState: string) {
  const payload = new URLSearchParams();
  payload.set("formMenu", "formMenu");
  payload.set("formMenu:j_id_jsp_1879301362_71", "formMenu:j_id_jsp_1879301362_94");
  payload.set("javax.faces.ViewState", viewState);
  payload.set("formMenu:j_id_jsp_1879301362_97", "formMenu:j_id_jsp_1879301362_97");

  const res = await doSigaaRequest({
    method: "POST",
    url: URL_FREQUENCIA,
    jsessionid,
    referer: URL_PORTAL_DISCENTE,
    body: payload.toString(),
    contentType: "application/x-www-form-urlencoded",
  });

  verifyTurmaPage(res.$, turmaNome);

  const html = res.$.html() ?? "";
  if (html.includes("A frequência ainda não foi lançada.")) {
    const newViewState = parseViewState(res.$, `frequencia_${turmaNome}`);
    return { faltas: PRESENCA_NAO_LANCADA, jsessionid: res.jsessionid, viewState: newViewState };
  }

  const reFaltas = /(\d+)\s+Falta\(s\)/g;
  let totalFaltas = 0;
  for (const m of html.matchAll(reFaltas)) {
    totalFaltas += parseInt(m[1], 10);
  }

  const newViewState = parseViewState(res.$, `frequencia_${turmaNome}`);
  return { faltas: totalFaltas, jsessionid: res.jsessionid, viewState: newViewState };
}

/** Port de GetTurmaData (sigaa.go:1451): cronograma + notícia + faltas de uma
 * turma, retornando ao portal principal ao final para manter o ViewState
 * consistente para a próxima chamada. */
async function getTurmaData(turmaNome: string, info: TurmaInfo, jsessionid: string, viewState: string) {
  const step1 = await getPaginaTurma(turmaNome, info, jsessionid, viewState);
  const step2 = await getPaginaFrequencia(turmaNome, step1.jsessionid, step1.viewState);
  const portal = await getPaginaPortal(step2.jsessionid);
  return {
    noticia: step1.noticia,
    cronograma: step1.cronograma,
    faltas: step2.faltas,
    jsessionid: portal.jsessionid,
    viewState: portal.viewState,
  };
}

const turmaInfoSchema = z.object({
  nome: z.string(),
  frontEndId: z.string(),
  formName: z.string(),
  componentId: z.string(),
});

const turmaInputSchema = z
  .object({
    nome: z.string().describe("Nome da turma, como veio de sigaa_main_data."),
    info: turmaInfoSchema.describe("Identificadores internos de navegação, vindos de sigaa_main_data."),
  })
  .passthrough();

export function registerTurmaTools(server: McpServer, session: SigaaSession): void {
  server.registerTool(
    "sigaa_get_turma",
    {
      title: "Detalhar uma turma (cronograma, notícia, faltas)",
      description:
        "Enriquece uma turma (obtida via sigaa_main_data) com cronograma, notícia e total de " +
        "faltas. Envie o objeto 'turma' de volta sem alterar os campos 'nome'/'info' — eles são " +
        "usados para navegar até a turma virtual correta, e a resposta é validada para nunca " +
        "devolver dados de uma turma diferente da pedida.",
      inputSchema: {
        turma: turmaInputSchema,
      },
    },
    safeTool(async ({ turma }) => {
      const { jsessionid, viewState } = session.requireAuth();
      if (!viewState) {
        throw new Error("ViewState ausente. Chame 'sigaa_main_data' primeiro para obter um ViewState válido.");
      }
      const result = await getTurmaData(turma.nome, turma.info, jsessionid, viewState);
      session.update({ jsessionid: result.jsessionid, viewState: result.viewState });
      return jsonResult({
        ...turma,
        noticia: result.noticia,
        cronograma: result.cronograma,
        faltas: result.faltas,
      });
    })
  );
}
