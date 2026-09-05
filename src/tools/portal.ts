import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPaginaPortal } from "../sigaaClient.js";
import { parseCH, parseIndices, parseTurmas } from "../parsers.js";
import type { SigaaSession } from "../session.js";
import { jsonResult, safeTool } from "../mcpHelpers.js";

/** Port de GetMainData (sigaa.go:1084): nome, matrícula, turmas resumidas,
 * índices acadêmicos, carga horária e avaliações do portal do discente. */
export async function getMainData(jsessionid: string) {
  const portal = await getPaginaPortal(jsessionid);
  const $ = portal.$;

  let nome = $("p.usuario span").first().text().trim();
  if (!nome) nome = $(".usuario > span").first().text().trim();
  if (!nome) throw new Error("Não foi possível encontrar o nome do aluno.");

  let matricula = "";
  $("#perfil-docente > #agenda-docente td").each((_, td) => {
    const texto = $(td).text().trim();
    if (texto.includes("Matrícula:")) {
      matricula = $(td).next().text().trim();
    }
  });
  if (!matricula) throw new Error("Não foi possível encontrar a matrícula do aluno.");

  const { turmas, avaliacoes } = parseTurmas($);
  const indices = parseIndices($);
  const cargaHoraria = parseCH($);

  return {
    nome,
    matricula,
    indices,
    cargaHoraria,
    avaliacoes,
    turmas,
    jsessionid: portal.jsessionid,
    viewState: portal.viewState,
  };
}

export function registerPortalTools(server: McpServer, session: SigaaSession): void {
  server.registerTool(
    "sigaa_main_data",
    {
      title: "Dados do portal do discente",
      description:
        "Ponto de entrada depois do login: nome, matrícula, turmas do semestre (resumidas, sem " +
        "cronograma/notícia/faltas — use sigaa_get_turma para detalhar cada uma), índices " +
        "acadêmicos e carga horária pendente.",
      inputSchema: {},
    },
    safeTool(async () => {
      const { jsessionid } = session.requireAuth();
      const data = await getMainData(jsessionid);
      session.update({
        jsessionid: data.jsessionid,
        viewState: data.viewState,
        nome: data.nome,
        matricula: data.matricula,
      });
      return jsonResult({
        nome: data.nome,
        matricula: data.matricula,
        indices: data.indices,
        cargaHoraria: data.cargaHoraria,
        avaliacoes: data.avaliacoes,
        turmas: data.turmas,
      });
    })
  );
}
