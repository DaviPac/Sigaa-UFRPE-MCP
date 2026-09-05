import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { doSigaaRequest, getPaginaPortal, parseViewState } from "../sigaaClient.js";
import { extractDynamicParams, parseCurriculoData, parseDetalhesComponente } from "../parsers.js";
import {
  URL_BUSCA_COMPONENTE,
  URL_COMPONENTE,
  URL_CURRICULO,
  URL_PORTAL_DISCENTE,
} from "../constants.js";
import { session } from "../session.js";
import { jsonResult, safeTool } from "../mcpHelpers.js";

/** Port de getPaginaCurriculo (sigaa.go:808): descobre o curso do aluno a
 * partir do portal e carrega a estrutura curricular ativa. */
async function getPaginaCurriculo(jsessionid: string) {
  const portal = await getPaginaPortal(jsessionid);

  const match = /portal\.jsf\?id=(\d+)/.exec(portal.$.text());
  if (!match) {
    throw new Error("Id do curso não encontrado no HTML do portal.");
  }
  const cursoId = match[1];
  const cursoUrl = `https://sigs.ufrpe.br/sigaa/public/curso/curriculo.jsf?lc=pt_BR&id=${cursoId}`;

  let res = await doSigaaRequest({
    method: "GET",
    url: cursoUrl,
    jsessionid: portal.jsessionid,
    referer: URL_PORTAL_DISCENTE,
  });
  const viewState = parseViewState(res.$, "curriculo");

  const payload = new URLSearchParams();
  payload.set("formCurriculosCurso", "formCurriculosCurso");
  payload.set("nivel", "G");
  payload.set("javax.faces.ViewState", viewState);
  extractDynamicParams(res.$, payload);

  res = await doSigaaRequest({
    method: "POST",
    url: URL_CURRICULO,
    jsessionid: res.jsessionid,
    referer: URL_PORTAL_DISCENTE,
    body: payload.toString(),
    contentType: "application/x-www-form-urlencoded",
  });

  return { $: res.$, jsessionid: res.jsessionid, viewState };
}

/** Port de getCurriculo (sigaa.go:1062): retorna ao portal ao final para
 * manter jsessionid/viewState consistentes para a próxima chamada. */
async function getCurriculo(jsessionid: string) {
  const pagina = await getPaginaCurriculo(jsessionid);
  const curriculo = parseCurriculoData(pagina.$);
  const portal = await getPaginaPortal(pagina.jsessionid);
  return { curriculo, jsessionid: portal.jsessionid, viewState: portal.viewState };
}

/** Port de getPaginaBusca (sigaa.go:857): abre o formulário de busca de
 * componentes curriculares a partir do menu do portal. */
async function getPaginaBusca(jsessionid: string, viewState: string) {
  const payload = new URLSearchParams();
  payload.set("menu:form_menu_discente", "menu:form_menu_discente");
  payload.set("id", "107543");
  payload.set("jscook_action", "menu_form_menu_discente_discente_menu:A]#{ componenteCurricular.popularBuscaDiscente }");
  payload.set("javax.faces.ViewState", viewState);

  const res = await doSigaaRequest({
    method: "POST",
    url: URL_PORTAL_DISCENTE,
    jsessionid,
    referer: URL_PORTAL_DISCENTE,
    body: payload.toString(),
    contentType: "application/x-www-form-urlencoded",
  });
  const newViewState = parseViewState(res.$, "busca");
  return { $: res.$, jsessionid: res.jsessionid, viewState: newViewState };
}

/** Port de getPaginaBuscaComponente (sigaa.go:883): dispara uma busca "vazia"
 * (todos os componentes de graduação) para chegar à lista de resultados de
 * onde um componente específico pode ser aberto por id. */
async function getPaginaBuscaComponente(jsessionid: string, viewState: string) {
  const busca = await getPaginaBusca(jsessionid, viewState);

  // Payload replicado byte-a-byte do original (sigaa.go:908): os nomes de
  // campo contêm ':' já url-encoded e o SIGAA é sensível à ordem/forma exata.
  const payloadString =
    "formBusca=formBusca&formBusca%3AcheckNivel=on&formBusca%3Aj_id_jsp_1111842163_1012=G&" +
    "formBusca%3Aj_id_jsp_1111842163_1015=&formBusca%3Aj_id_jsp_1111842163_1017=&" +
    "formBusca%3Aform%3AidPreRequisito=&formBusca%3Aform%3AnomeDisciplinaPreRequisito=&" +
    "formBusca%3Aform2%3AidCoRequisito=&formBusca%3Aform2%3AnomeDisciplinaCoRequisito=&" +
    "formBusca%3Aform3%3AidEquivalencia=&formBusca%3Aform3%3AnomeDisciplinaEquivalencia=&" +
    "formBusca%3AData_Inicial=&formBusca%3AdataFim=&formBusca%3Aunidades=0&formBusca%3Atipos=0&" +
    "formBusca%3Amodalidades=0&formBusca%3AbtnBuscar=Buscar&javax.faces.ViewState=";
  const encodedPayload = payloadString + encodeURIComponent(busca.viewState);

  const res = await doSigaaRequest({
    method: "POST",
    url: URL_BUSCA_COMPONENTE,
    jsessionid: busca.jsessionid,
    referer: URL_PORTAL_DISCENTE,
    body: encodedPayload,
    contentType: "application/x-www-form-urlencoded",
  });
  const newViewState = parseViewState(res.$, "busca_componente");
  return { $: res.$, jsessionid: res.jsessionid, viewState: newViewState };
}

/** Port de getPaginaComponente (sigaa.go:929): abre os detalhes de um
 * componente curricular específico a partir da lista de busca. */
async function getPaginaComponente(jsessionid: string, viewState: string, idComponente: string) {
  const busca = await getPaginaBuscaComponente(jsessionid, viewState);

  const payload = new URLSearchParams();
  payload.set("detalharComponenteCurricular:Detalhes", "detalharComponenteCurricular:Detalhes");
  payload.set("id", idComponente);
  payload.set("detalharComponenteCurricular", "detalharComponenteCurricular");
  payload.set("javax.faces.ViewState", busca.viewState);

  const res = await doSigaaRequest({
    method: "POST",
    url: URL_COMPONENTE,
    jsessionid: busca.jsessionid,
    referer: URL_BUSCA_COMPONENTE,
    body: payload.toString(),
    contentType: "application/x-www-form-urlencoded",
  });

  return { $: res.$, jsessionid: res.jsessionid, viewState: busca.viewState };
}

/** Port de getDetalhesComponente (sigaa.go:1046): detalhes de um componente
 * curricular (ementa, pré-requisitos, equivalências), retornando ao portal
 * ao final. */
async function getDetalhesComponente(jsessionid: string, viewState: string, idComponente: string, curriculo: string) {
  const pagina = await getPaginaComponente(jsessionid, viewState, idComponente);
  const componente = parseDetalhesComponente(pagina.$, curriculo);
  const portal = await getPaginaPortal(pagina.jsessionid);
  return { componente, jsessionid: portal.jsessionid, viewState: portal.viewState };
}

export function registerCurriculoTools(server: McpServer): void {
  server.registerTool(
    "sigaa_get_curriculo",
    {
      title: "Estrutura curricular do curso",
      description:
        "Lista os componentes curriculares (obrigatórios, optativos, complementares) do curso do " +
        "aluno, organizados por semestre. Use 'componentes[].id' + 'estruturaCurricular.codigo' " +
        "para chamar 'sigaa_get_componente' em seguida.",
      inputSchema: {},
    },
    safeTool(async () => {
      const { jsessionid } = session.requireAuth();
      const result = await getCurriculo(jsessionid);
      session.update({ jsessionid: result.jsessionid, viewState: result.viewState });
      return jsonResult({ estruturaCurricular: result.curriculo });
    })
  );

  server.registerTool(
    "sigaa_get_componente",
    {
      title: "Detalhes de um componente curricular",
      description:
        "Ementa, tipo, modalidade, carga horária, pré-requisitos e equivalências de um componente " +
        "curricular específico. 'idComponente' e 'curriculo' vêm de 'sigaa_get_curriculo' " +
        "(componentes[].id e estruturaCurricular.codigo, respectivamente).",
      inputSchema: {
        idComponente: z.string().describe("Id interno do componente (componentes[].id de sigaa_get_curriculo)."),
        curriculo: z.string().describe("Código do currículo (estruturaCurricular.codigo de sigaa_get_curriculo)."),
      },
    },
    safeTool(async ({ idComponente, curriculo }) => {
      const { jsessionid, viewState } = session.requireAuth();
      if (!viewState) {
        throw new Error("ViewState ausente. Chame 'sigaa_main_data' primeiro para obter um ViewState válido.");
      }
      const result = await getDetalhesComponente(jsessionid, viewState, idComponente, curriculo);
      session.update({ jsessionid: result.jsessionid, viewState: result.viewState });
      return jsonResult({ componente: result.componente });
    })
  );
}
