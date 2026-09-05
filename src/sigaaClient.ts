// Port do motor de requisições de sigaa-ufrpe-api/sigaa.go (doSigaaRequest,
// extractJSESSIONID, parseViewState, Login, proceedFromAviso) para TypeScript,
// usando fetch nativo + cheerio no lugar de net/http + goquery.
//
// Diferença chave em relação ao original Go: aqui o corpo da resposta é lido
// uma única vez e devolvido tanto como HTML bruto quanto como documento
// cheerio já parseado, o que permite às tools genéricas (raw_request/get_html)
// devolver o HTML sem descartá-lo — a limitação identificada no backend Go,
// onde doSigaaRequest sempre converte para goquery.Document e joga fora os
// bytes originais.

import * as cheerio from "cheerio";
import {
  ALLOWED_HOSTS,
  SIGAA_ORIGIN,
  URL_VIEW_LOGIN,
  USER_AGENT,
} from "./constants.js";
import { InvalidCredentialsError, SessaoExpiradaError } from "./types.js";

export interface RawSigaaResponse {
  status: number;
  headers: Record<string, string>;
  finalUrl: string;
  jsessionid: string;
  html: string;
  buffer: Buffer;
  $: cheerio.CheerioAPI;
}

export interface DownloadResponse {
  status: number;
  contentType: string;
  filename: string | undefined;
  buffer: Buffer;
  jsessionid: string;
}

export function assertAllowedUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`URL inválida: ${rawUrl}`);
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(
      `Host não permitido: ${url.hostname}. Este servidor só faz requisições para: ${[...ALLOWED_HOSTS].join(", ")}.`
    );
  }
  return url;
}

/** Extrai o cookie JSESSIONID dos headers Set-Cookie da resposta. Se o SIGAA
 * não renovar o cookie nesta resposta, mantém o valor anterior. */
function extractJSESSIONID(response: Response, current: string | undefined): string {
  const setCookies =
    typeof (response.headers as any).getSetCookie === "function"
      ? ((response.headers as any).getSetCookie() as string[])
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie") as string]
        : [];
  for (const ck of setCookies) {
    const match = /^JSESSIONID=([^;]+)/.exec(ck);
    if (match && match[1]) {
      return `JSESSIONID=${match[1]}`;
    }
  }
  return current ?? "";
}

/** Requisição de baixo nível, sem detecção de erro por texto — usada pelas
 * tools genéricas (sigaa_get_html/sigaa_raw_request) que precisam ver o HTML
 * cru mesmo quando é uma página de erro/sessão expirada. */
export async function rawSigaaRequest(opts: {
  method: string;
  url: string;
  jsessionid?: string;
  referer?: string;
  body?: string;
  contentType?: string;
  redirect?: "follow" | "manual";
}): Promise<RawSigaaResponse> {
  const url = assertAllowedUrl(opts.url);

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Origin: SIGAA_ORIGIN,
  };
  if (opts.referer) headers["Referer"] = opts.referer;
  if (opts.contentType) headers["Content-Type"] = opts.contentType;
  if (opts.jsessionid) headers["Cookie"] = opts.jsessionid;

  const response = await fetch(url, {
    method: opts.method,
    headers,
    body: opts.body,
    redirect: opts.redirect ?? "follow",
  });

  const newJsessionid = extractJSESSIONID(response, opts.jsessionid);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const html = buffer.toString("utf-8");
  const $ = cheerio.load(html);

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: response.status,
    headers: responseHeaders,
    finalUrl: response.url || opts.url,
    jsessionid: newJsessionid,
    html,
    buffer,
    $,
  };
}

/** Port de doSigaaRequest (sigaa.go:43): faz a requisição, segue redirects, e
 * lança os mesmos erros que o backend Go detecta por substring no texto da
 * página. Usada pelas tools estruturadas (main-data, notas, turma, etc). */
export async function doSigaaRequest(opts: {
  method: string;
  url: string;
  jsessionid?: string;
  referer?: string;
  body?: string;
  contentType?: string;
}): Promise<RawSigaaResponse> {
  const res = await rawSigaaRequest(opts);

  if (res.status !== 200) {
    throw new Error(`Status code inesperado ${res.status} para ${opts.url}`);
  }

  const text = res.$.text();
  if (text.includes("rio e/ou senha inv")) {
    throw new InvalidCredentialsError();
  }
  if (text.includes("foi expirada") || text.includes("sessão expirou")) {
    throw new SessaoExpiradaError(opts.url);
  }

  return res;
}

/** Extrai o javax.faces.ViewState (token JSF de estado) de um documento. */
export function parseViewState($: cheerio.CheerioAPI, errorContext?: string): string {
  const value = $("input[name='javax.faces.ViewState']").attr("value");
  if (!value) {
    throw new Error(
      `Não foi possível encontrar o javax.faces.ViewState na página${errorContext ? `: ${errorContext}` : ""}.`
    );
  }
  return value;
}

function stripJsessionidFromUrl(url: string): string {
  return url.replace(/;jsessionid=[^?]+/i, "");
}

/** Simula o clique no botão "Continuar >>" do interstitial "Aviso de Logon"
 * (port de proceedFromAviso, sigaa.go:319). */
async function proceedFromAviso(
  $aviso: cheerio.CheerioAPI,
  jsessionid: string,
  refererAviso: string
): Promise<{ $: cheerio.CheerioAPI; jsessionid: string }> {
  const form = $aviso("form").first();
  const actionPath = form.attr("action");
  if (!actionPath) {
    throw new Error("Não foi possível encontrar a action do formulário de aviso.");
  }
  const fullActionUrl = SIGAA_ORIGIN + actionPath;

  const botaoContinuar = form.find("input[type='submit'][value*='Continuar']").first();
  const nameBotao = botaoContinuar.attr("name");
  if (!nameBotao) {
    throw new Error("Não foi possível encontrar o atributo 'name' do botão 'Continuar >>'.");
  }

  const payload = new URLSearchParams();
  const formName = form.attr("name") ?? "";
  const hiddenValue = form.find(`input[type='hidden'][name='${formName}']`).attr("value") ?? "";
  payload.set(formName, hiddenValue);
  payload.set(nameBotao, "Continuar >>");

  const viewStateValue = $aviso("input[name='javax.faces.ViewState']").attr("value");
  if (!viewStateValue) {
    throw new Error("Não foi possível encontrar o campo ViewState no aviso de logon.");
  }
  payload.set("javax.faces.ViewState", viewStateValue);

  const cleanedActionUrl = stripJsessionidFromUrl(fullActionUrl);

  const res = await doSigaaRequest({
    method: "POST",
    url: cleanedActionUrl,
    jsessionid,
    referer: refererAviso,
    body: payload.toString(),
    contentType: "application/x-www-form-urlencoded",
  });

  return { $: res.$, jsessionid: res.jsessionid };
}

/** Port de Login (sigaa.go:245): faz login no SIGAA e resolve o interstitial
 * "Aviso de Logon" quando presente (até 5 tentativas, igual ao original). */
export async function login(username: string, password: string): Promise<string> {
  const initial = await doSigaaRequest({ method: "GET", url: URL_VIEW_LOGIN });

  const actionUrlPath = initial.$("form[name='loginForm']").attr("action");
  if (!actionUrlPath) {
    throw new Error("Não foi possível encontrar o formulário de login no HTML.");
  }
  const fullActionUrl = SIGAA_ORIGIN + actionUrlPath;
  const cleanedActionUrl = stripJsessionidFromUrl(fullActionUrl);

  const payload = new URLSearchParams();
  payload.set("user.login", username);
  payload.set("user.senha", password);
  payload.set("width", "1920");
  payload.set("height", "1080");
  payload.set("urlRedirect", "");
  payload.set("subsistemaRedirect", "");
  payload.set("acao", "");
  payload.set("acessibilidade", "");

  let res = await doSigaaRequest({
    method: "POST",
    url: cleanedActionUrl,
    jsessionid: initial.jsessionid,
    referer: URL_VIEW_LOGIN,
    body: payload.toString(),
    contentType: "application/x-www-form-urlencoded",
  });

  const selectorAviso = "input[type='submit'][value*='Continuar']";
  let counter = 0;
  let currentJsessionid = res.jsessionid;
  let $current = res.$;
  let finalUrl = res.finalUrl;

  while ($current(selectorAviso).length > 0 && counter < 5) {
    counter++;
    const refererAviso = finalUrl || URL_VIEW_LOGIN;
    const proceeded = await proceedFromAviso($current, currentJsessionid, refererAviso);
    $current = proceeded.$;
    currentJsessionid = proceeded.jsessionid;
  }

  return currentJsessionid;
}

/** Acessa a página do portal do discente e devolve o ViewState atual — porta
 * de getPaginaPortal (sigaa.go:379), usada para renovar o ViewState entre
 * chamadas. */
export async function getPaginaPortal(
  jsessionid: string
): Promise<{ $: cheerio.CheerioAPI; jsessionid: string; viewState: string }> {
  const res = await doSigaaRequest({
    method: "GET",
    url: "https://sigs.ufrpe.br/sigaa/portais/discente/discente.jsf",
    jsessionid,
  });
  const viewState = parseViewState(res.$, "discente");
  return { $: res.$, jsessionid: res.jsessionid, viewState };
}

/** Dispara uma ação do menu do portal que responde com PDF (histórico,
 * declaração de vínculo). Port de fetchPortalPDF (sigaa.go:103). */
export async function fetchPortalPDF(
  jscookAction: string,
  viewState: string,
  jsessionid: string
): Promise<DownloadResponse> {
  const payload = new URLSearchParams();
  payload.set("menu:form_menu_discente", "menu:form_menu_discente");
  payload.set("id", "107543");
  payload.set("jscook_action", jscookAction);
  payload.set("javax.faces.ViewState", viewState);

  const url = "https://sigs.ufrpe.br/sigaa/portais/discente/discente.jsf";
  const res = await rawSigaaRequest({
    method: "POST",
    url,
    jsessionid,
    referer: url,
    body: payload.toString(),
    contentType: "application/x-www-form-urlencoded",
  });

  if (res.status !== 200) {
    throw new Error(`Status code inesperado: ${res.status}`);
  }
  const contentType = res.headers["content-type"] ?? "";
  if (!contentType.includes("application/pdf")) {
    throw new SessaoExpiradaError("o SIGAA não retornou um PDF (ViewState inválido?)");
  }

  return {
    status: res.status,
    contentType,
    filename: extractFilename(res.headers["content-disposition"]),
    buffer: res.buffer,
    jsessionid: res.jsessionid,
  };
}

function extractFilename(contentDisposition: string | undefined): string | undefined {
  if (!contentDisposition) return undefined;
  const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return match?.[1];
}

/** Download genérico de um arquivo/ação SIGAA arbitrária. Generaliza o padrão
 * hoje hardcoded em BaixarArquivoSigaa (sigaa.go:1147, só para anexos de
 * cronograma) e fetchPortalPDF (só para histórico/vínculo): monta e dispara
 * a requisição com redirect manual (para detectar o 302 de sessão expirada,
 * igual a sigaaNoRedirectClient) e valida que a resposta não é uma página
 * HTML de erro disfarçada de arquivo. */
export async function downloadFile(opts: {
  method: string;
  url: string;
  jsessionid?: string;
  referer?: string;
  body?: string;
  contentType?: string;
}): Promise<DownloadResponse> {
  const res = await rawSigaaRequest({ ...opts, redirect: "manual" });

  if (res.status >= 300 && res.status < 400) {
    throw new Error(
      `O SIGAA tentou redirecionar (status ${res.status}) para ${res.headers["location"] ?? "desconhecido"} — provável sessão expirada.`
    );
  }
  if (res.status !== 200) {
    throw new Error(`Falha no download, status code inesperado: ${res.status}`);
  }

  const contentType = res.headers["content-type"] ?? "";
  if (contentType.includes("text/html")) {
    throw new SessaoExpiradaError("o SIGAA retornou uma página HTML em vez do arquivo esperado");
  }

  return {
    status: res.status,
    contentType,
    filename: extractFilename(res.headers["content-disposition"]),
    buffer: res.buffer,
    jsessionid: res.jsessionid,
  };
}
