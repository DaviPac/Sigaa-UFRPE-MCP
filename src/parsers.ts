// Port dos parsers goquery de sigaa-ufrpe-api/sigaa.go para cheerio.
// Cada função aqui é pura: recebe um documento (ou seleção) já carregado e
// devolve dados estruturados, sem fazer nenhuma requisição de rede.

import type * as cheerio from "cheerio";
import {
  ArquivoCronograma,
  Avaliacao,
  CargasHorarias,
  ComponenteCurricular,
  CronogramaItem,
  DetalhesComponente,
  EstruturaCurricular,
  FALTAS_INDEFINIDAS,
  IndicesAcademicos,
  Noticia,
  AtestadoMatricula,
  TurmaData,
} from "./types.js";

function clearText(s: string): string {
  return s.split(/\s+/).filter(Boolean).join(" ");
}

function cleanText(s: string): string {
  return clearText(s.replace(/\u00a0/g, " "));
}

// --- Portal / turmas -------------------------------------------------------

export function parseTurmas($: cheerio.CheerioAPI): { turmas: TurmaData[]; avaliacoes: Avaliacao[] } {
  const turmas: TurmaData[] = [];
  const reFrontEnd = /'frontEndIdTurma':'([^']+)'/;
  const reComponent = /'(form_acessarTurmaVirtual[^']*)':'([^']*)'/g;

  $("form[id^='form_acessarTurmaVirtual']").each((_, el) => {
    const form = $(el);
    const linkElement = form.find("a[onclick]");
    const nomeTurma = linkElement.text().trim();
    const formName = form.attr("name");
    const onclickAttr = linkElement.attr("onclick");
    if (!nomeTurma || !formName || !onclickAttr) return;

    const frontEndMatch = reFrontEnd.exec(onclickAttr);
    if (!frontEndMatch) {
      throw new Error(`Erro ao parsear frontEndId da turma: ${nomeTurma}`);
    }
    const frontEndId = frontEndMatch[1];

    let componentId = "";
    reComponent.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = reComponent.exec(onclickAttr)) !== null) {
      if (m[1] === m[2]) {
        componentId = m[1];
        break;
      }
    }
    if (!componentId) {
      throw new Error(`Erro ao parsear componentId da turma (par chave/valor não encontrado): ${nomeTurma}`);
    }

    const tr = form.closest("tr");
    const local = tr.find("td.info").first().text().trim();

    const horarios: string[] = [];
    tr.find("td[class*='info'] center").each((_i, center) => {
      for (const parte of $(center).text().split(/\s+/)) {
        if (parte && parte !== "*") horarios.push(parte);
      }
    });

    turmas.push({
      nome: nomeTurma,
      local,
      horarios,
      faltas: FALTAS_INDEFINIDAS,
      info: { nome: nomeTurma, frontEndId, formName, componentId },
    });
  });

  const avaliacoes: Avaliacao[] = [];
  $("#avaliacao-portal table tbody tr").each((i, el) => {
    if (i === 0) return;
    const cells = $(el).find("td");
    const textoData = cells.eq(1).text().trim();
    const data = textoData.split(/\s+/).filter(Boolean).join(" ");
    const activityText = cells.eq(2).find("small").text().trim();

    const colonIdx = activityText.indexOf(":");
    const turmaTipoPart = colonIdx === -1 ? activityText : activityText.slice(0, colonIdx);
    const nome = colonIdx === -1 ? "" : activityText.slice(colonIdx + 1).trim();

    const campos = turmaTipoPart.split(/\s+/).filter(Boolean);
    const tipo = campos.length > 0 ? campos[campos.length - 1] : "";
    const turmaNome = turmaTipoPart.replace(tipo, "").trim();

    avaliacoes.push({ nome, turmaNome, data, tipo });
  });

  return { turmas, avaliacoes };
}

export function parseIndices($: cheerio.CheerioAPI): IndicesAcademicos {
  const indices: IndicesAcademicos = {
    mc: "", ira: "", mcn: "", iech: "", iepl: "", iea: "", iean: "", iechp: "",
  };
  $("#agenda-docente > table > tbody > tr > td > table tr").each((_, el) => {
    const tds = $(el).find("td");
    if (tds.length === 4) {
      const key1 = $(tds[0]).text().trim();
      const val1 = $(tds[1]).text().trim();
      const key2 = $(tds[2]).text().trim();
      const val2 = $(tds[3]).text().trim();
      switch (key1) {
        case "MC:": indices.mc = val1; break;
        case "MCN:": indices.mcn = val1; break;
        case "IEPL:": indices.iepl = val1; break;
        case "IEAN:": indices.iean = val1; break;
      }
      switch (key2) {
        case "IRA:": indices.ira = val2; break;
        case "IECH:": indices.iech = val2; break;
        case "IEA:": indices.iea = val2; break;
        case "IECHP:": indices.iechp = val2; break;
      }
    }
  });
  return indices;
}

export function parseCH($: cheerio.CheerioAPI): CargasHorarias {
  const ch: CargasHorarias = {
    obrigatoriaPendente: "", optativaPendente: "", totalCurriculo: "", complementarPendente: "",
  };
  $("#agenda-docente > table > tbody > tr > td > table tr").each((_, el) => {
    const tds = $(el).find("td");
    if (tds.length === 2) {
      const key = $(tds[0]).text().trim();
      const val = $(tds[1]).text().trim();
      switch (key) {
        case "CH. Obrigatória Pendente": ch.obrigatoriaPendente = val; break;
        case "CH. Optativa Pendente": ch.optativaPendente = val; break;
        case "CH. Total Currículo": ch.totalCurriculo = val; break;
        case "CH. Complementar Pendente": ch.complementarPendente = val; break;
      }
    }
  });
  return ch;
}

export function parseNoticia($: cheerio.CheerioAPI): Noticia {
  const noticiaDiv = $("#ultimaNoticia");
  if (noticiaDiv.length === 0) return { titulo: "", conteudo: [] };

  const h4 = noticiaDiv.find("h4");
  const titulo = h4.length > 0 ? h4.contents().last().text().trim() : "";

  const conteudo: string[] = [];
  noticiaDiv.find(".conteudoNoticia p").each((_, p) => {
    conteudo.push($(p).text().trim());
  });

  return { titulo, conteudo };
}

const RE_JSF_CHAVE = /'(formAva:[^']+)'\s*:/;
const RE_JSF_ID = /'id'\s*:\s*'([^']+)'/;

export function parseCronograma($: cheerio.CheerioAPI): CronogramaItem[] {
  const cronograma: CronogramaItem[] = [];
  const panel = $("#formAva\\:panelTopicosNaoSelecionados");
  if (panel.length === 0) return cronograma;

  panel.find("span").each((_, spanEl) => {
    const eventoSpan = $(spanEl);
    const eventoDiv = eventoSpan.children().first();
    if (eventoDiv.length === 0) return;

    const titulo = eventoDiv.find(".titulo").text().trim();
    const conteudoDiv = eventoDiv.find(".conteudotopico");

    if (conteudoDiv.length === 0) {
      if (titulo) cronograma.push({ titulo, conteudo: "" });
      return;
    }

    const cleanDiv = conteudoDiv.clone();
    cleanDiv.find("script, .drgind_fly, span[id*='listaMateriais']").remove();
    const conteudo = cleanDiv.text().split(/\s+/).filter(Boolean).join(" ");

    const arquivos: ArquivoCronograma[] = [];
    eventoDiv.find("a[onclick*='jsfcljs']").each((_k, a) => {
      const $a = $(a);
      const nomeArquivo = $a.text().trim();
      const onclickJS = $a.attr("onclick");
      if (onclickJS) {
        const chave = RE_JSF_CHAVE.exec(onclickJS)?.[1] ?? "";
        const id = RE_JSF_ID.exec(onclickJS)?.[1] ?? "";
        if (chave && id) arquivos.push({ nome: nomeArquivo, chave, id });
      }
    });

    if (titulo) cronograma.push({ titulo, conteudo, arquivos });
  });

  return cronograma;
}

// --- Currículo ---------------------------------------------------------

export function extractDynamicParams($: cheerio.CheerioAPI, payload: URLSearchParams): void {
  let onclickContent: string | undefined;

  $("table#table_lt tbody tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.text().includes("Ativa")) {
      const val = $tr.find("a[title='Visualizar Estrutura Curricular']").attr("onclick");
      if (val) {
        onclickContent = val;
        return false;
      }
    }
    return undefined;
  });

  if (!onclickContent) {
    throw new Error("Currículo ativo ou botão de visualização não encontrados.");
  }

  const dictMatch = /jsfcljs\(.*?,\s*\{([^}]+)\}/.exec(onclickContent);
  if (!dictMatch) {
    throw new Error("Não foi possível encontrar os parâmetros jsfcljs no onclick.");
  }

  const kvRegex = /'([^']+)'\s*:\s*'([^']*)'/g;
  let found = false;
  let match: RegExpExecArray | null;
  while ((match = kvRegex.exec(dictMatch[1])) !== null) {
    payload.set(match[1], match[2]);
    found = true;
  }
  if (!found) {
    throw new Error("Nenhum par chave-valor encontrado dentro do jsfcljs.");
  }
}

export function parseCurriculoData($: cheerio.CheerioAPI): EstruturaCurricular {
  const curriculo: EstruturaCurricular = {
    codigo: "", matrizCurricular: "", periodoVigor: "", cargaHorariaTotalMin: "",
    cargaHorariaOptativaMin: "", cargaHorariaObrigatoria: "", prazoMinimoSemestres: "",
    prazoMedioSemestres: "", prazoMaximoSemestres: "", componentes: [],
  };

  $("table.formulario > tbody > tr").each((_, row) => {
    const $row = $(row);
    const th = cleanText($row.find("th").first().text());
    const td = cleanText($row.find("td").first().text());
    switch (th) {
      case "Código:": curriculo.codigo = td; break;
      case "Matriz Curricular:": curriculo.matrizCurricular = td; break;
      case "Período Letivo de Entrada em Vigor:": curriculo.periodoVigor = td; break;
      case "Total Mínima:": curriculo.cargaHorariaTotalMin = td; break;
      case "Carga Horária Optativa Mínima:": curriculo.cargaHorariaOptativaMin = td; break;
      case "Carga Horária Obrigatória Atividade Acadêmica Específica:": curriculo.cargaHorariaObrigatoria = td; break;
    }
  });

  $("table.formulario > tbody > tr table tbody tr").each((_, row) => {
    $(row).find("th").each((_j, thEl) => {
      const $th = $(thEl);
      const thText = cleanText($th.text());
      const tdText = cleanText($th.next("td").text());
      if (thText === "Mínimo:") curriculo.prazoMinimoSemestres = tdText;
      else if (thText === "Médio:") curriculo.prazoMedioSemestres = tdText;
      else if (thText === "Máximo:") curriculo.prazoMaximoSemestres = tdText;
    });
  });

  const reIDInterno = /'(?:id|idComponente)':'(\d+)'/;

  $("div.yui-content > div").each((_, tabDiv) => {
    const $tabDiv = $(tabDiv);
    const tabID = $tabDiv.attr("id");
    if (!tabID) return;
    const nivel = tabID.replace("semestre", "");

    $tabDiv.find("tr.linhaPar, tr.linhaImpar").each((_j, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 2) return;

      const rawInfo = cleanText($(tds[0]).text());
      const tipo = cleanText($(tds[1]).text());
      const parts = rawInfo.split(" - ");
      const comp: ComponenteCurricular = { tipo, nivel, codigo: "", id: "", nome: "", cargaHoraria: "" };

      if (parts.length >= 3) {
        comp.codigo = parts[0].trim();
        comp.cargaHoraria = parts[parts.length - 1].trim();
        comp.nome = parts.slice(1, parts.length - 1).join(" - ").trim();
      } else {
        comp.nome = rawInfo;
      }

      if (tds.length >= 3) {
        for (const aTag of $(tds[2]).find("a").toArray()) {
          const onclickAttr = $(aTag).attr("onclick");
          if (onclickAttr) {
            const m = reIDInterno.exec(onclickAttr);
            if (m) {
              comp.id = m[1];
              break;
            }
          }
        }
      }

      curriculo.componentes.push(comp);
    });
  });

  return curriculo;
}

export function parseDetalhesComponente($: cheerio.CheerioAPI, curriculo: string): DetalhesComponente {
  const comp: DetalhesComponente = {
    codigo: "", nome: "", tipo: "", modalidade: "", unidade: "", ementa: "",
    cargaHorariaTotal: "", preRequisitos: [], equivalencias: [],
  };

  $("tr").each((_, el) => {
    const $el = $(el);
    const th = clearText($el.find("th").first().text());
    const td = clearText($el.find("td").first().text());

    if (th.includes("Tipo do Componente Curricular:")) comp.tipo = td;
    else if (th.includes("Modalidade de Educação:")) comp.modalidade = td;
    else if (th.includes("Unidade Responsável:")) comp.unidade = td;
    else if (th.includes("Código:")) comp.codigo = td;
    else if (th.includes("Nome:")) comp.nome = td;
    else if (th.includes("Ementa/Descrição:")) comp.ementa = td;

    const td0 = clearText($el.find("td").eq(0).text());
    if (td0.includes("Total de Carga Horária do Componente")) {
      comp.cargaHorariaTotal = clearText($el.find("td").eq(1).text());
    }
  });

  $("table").each((_, table) => {
    const $table = $(table);
    const caption = clearText($table.find("caption").text());

    if (caption.includes("Equivalência(s) Específica(s)")) {
      $table.find("tbody tr").each((_i, tr) => {
        const $tr = $(tr);
        const curr = clearText($tr.find("td.colCurriculo").text());
        if (curr.includes(curriculo)) {
          $tr.find("td").eq(0).find("acronym").each((_k, ac) => {
            const codigoLimpo = $(ac).text().trim();
            if (codigoLimpo && !comp.equivalencias.includes(codigoLimpo)) {
              comp.equivalencias.push(codigoLimpo);
            }
          });
        }
      });
    }

    if (caption.includes("Expressões específicas de currículo")) {
      $table.find("tbody tr").each((_i, tr) => {
        const $tr = $(tr);
        const currInfo = clearText($tr.find("td").eq(0).text());
        const tipo = clearText($tr.find("td").eq(2).text());
        if (currInfo.includes(curriculo) && tipo === "Pré-Requisito") {
          $tr.find("td").eq(1).find("acronym").each((_k, ac) => {
            const codigoLimpo = $(ac).text().trim();
            if (codigoLimpo && !comp.preRequisitos.includes(codigoLimpo)) {
              comp.preRequisitos.push(codigoLimpo);
            }
          });
        }
      });
    }
  });

  return comp;
}

// --- Proteção "turma certa" ------------------------------------------------
// O SIGAA é stateful: um POST "entrar na turma virtual" pode ser ignorado
// silenciosamente se o ViewState estiver dessincronizado, devolvendo a página
// da turma anterior. verifyTurmaPage confere a identidade antes de raspar.

const ACCENT_MAP: Record<string, string> = {
  "Á": "A", "À": "A", "Â": "A", "Ã": "A", "Ä": "A",
  "É": "E", "È": "E", "Ê": "E", "Ë": "E",
  "Í": "I", "Ì": "I", "Î": "I", "Ï": "I",
  "Ó": "O", "Ò": "O", "Ô": "O", "Õ": "O", "Ö": "O",
  "Ú": "U", "Ù": "U", "Û": "U", "Ü": "U",
  "Ç": "C", "Ñ": "N",
};

function stripAccents(s: string): string {
  return s.replace(/[ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]/g, (c) => ACCENT_MAP[c] ?? c);
}

export function normalizeName(s: string): string {
  const upper = stripAccents(s.toUpperCase());
  let result = "";
  let lastSpace = true;
  for (const ch of upper) {
    if ((ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9")) {
      result += ch;
      lastSpace = false;
    } else if (!lastSpace) {
      result += " ";
      lastSpace = true;
    }
  }
  return result.trim();
}

export function tokenOverlap(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/).filter(Boolean));
  if (setA.size === 0) return 0;
  let hits = 0;
  for (const t of b.split(/\s+/).filter(Boolean)) {
    if (setA.has(t)) {
      hits++;
      setA.delete(t);
    }
  }
  const total = a.split(/\s+/).filter(Boolean).length;
  return total === 0 ? 0 : hits / total;
}

const TURMA_TITLE_SELECTORS = [
  "#linkNomeTurma", ".nomeTurma", "#conteudo h2", "#conteudo h3",
  "#paginaInicial .titulo", "div.turma-virtual-titulo", "td.titulo",
];

export function turmaTitleFromPage($: cheerio.CheerioAPI): { title: string; trusted: boolean } {
  for (const sel of TURMA_TITLE_SELECTORS) {
    const txt = $(sel).first().text().trim();
    if (txt) return { title: txt, trusted: true };
  }
  return { title: $("title").first().text().trim(), trusted: false };
}

const RE_CODIGO_DISCIPLINA = /\b([A-Z]{2,}\d{3,}|\d{5,})\b/;

/** Lança erro se a página carregada não corresponder à turma esperada.
 * Quando não há como verificar (título vazio ou só o <title> genérico da
 * página, sem seletor confiável), segue em frente sem erro — mesmo
 * comportamento conservador do original em Go. */
export function verifyTurmaPage($: cheerio.CheerioAPI, turmaNome: string): void {
  const { title: pageTitle, trusted } = turmaTitleFromPage($);
  const want = normalizeName(turmaNome);
  const got = normalizeName(pageTitle);

  if (!want || !got) return;
  if (got.includes(want) || want.includes(got)) return;

  const wc = RE_CODIGO_DISCIPLINA.exec(want)?.[1];
  const gc = RE_CODIGO_DISCIPLINA.exec(got)?.[1];
  if (wc && wc === gc) return;

  if (tokenOverlap(want, got) >= 0.6) return;
  if (!trusted) return;

  throw new Error(
    `Página carregada não corresponde à turma esperada (esperado "${turmaNome}", veio "${pageTitle}").`
  );
}

// --- Atestado de matrícula ---------------------------------------------

export function parseAtestadoMatricula(htmlContent: string): AtestadoMatricula {
  const extract = (pattern: RegExp): string => {
    const m = pattern.exec(htmlContent);
    return m && m[1] ? m[1].trim() : "";
  };

  const turmaRe =
    /^\s*(\d{5})\s*\n\s*([A-ZÇÃÕÁÉÍÓÚÂÊÎÔÛÀÈÌÒÙÄËÏÖÜ /]+)\s*\n\s*([A-ZÇÃÕÁÉÍÓÚÂÊÎÔÛÀÈÌÒÙÄËÏÖÜ ]+)\s*\n[\s\S]*?Tipo:\s*\n\s*([^\n(]+)[\s\S]*?Local:\s*([^\n]+)[\s\S]*?\n\s*(\d+)\s*\n\s*(MATRICULADO|INDEFERIDO|CANCELADO|TRANCADO|DISPENSADO)\s*\n\s*((?:[2-7][MmTtNn]\d+\s*)+)/gm;

  const atestado: AtestadoMatricula = {
    periodoLetivo: extract(/Letivo:\s*\n+\s*(\d{4}\.\d)/),
    nivel: extract(/N[íi]vel:\s*\n?\s*([A-ZÇÃÕÁÉÍÓÚÂÊÎÔÛ ]+)/),
    matricula: extract(/Matr[íi]cula:\s*\n?\s*(\d+)/),
    vinculo: extract(/V[íi]nculo:\s*\n?\s*([A-ZÇÃÕÁÉÍÓÚÂÊÎÔÛ]+)/),
    nome: extract(/Nome:\s*\n?\s*([A-ZÇÃÕÁÉÍÓÚÂÊÎÔÛ ]+)/),
    curso: extract(/Curso:\s*\n?\s*([^\n]+)/),
    codigoVerificacao: extract(/c[oó]digo de verifica[cç][aã]o\s+(\w+)/),
    turmas: [],
  };

  for (const m of htmlContent.matchAll(turmaRe)) {
    atestado.turmas.push({
      codigo: m[1].trim(),
      nome: m[2].trim(),
      professor: m[3].trim(),
      tipo: m[4].trim(),
      local: m[5].trim(),
      status: m[7].trim(),
      horario: m[8].trim(),
    });
  }

  return atestado;
}
