export const URL_VIEW_LOGIN = "https://sigs.ufrpe.br/sigaa/verTelaLogin.do";
export const URL_PORTAL_DISCENTE = "https://sigs.ufrpe.br/sigaa/portais/discente/discente.jsf";
export const URL_FREQUENCIA = "https://sigs.ufrpe.br/sigaa/ava/index.jsf";
export const URL_CURRICULO = "https://sigs.ufrpe.br/sigaa/public/curso/curriculo.jsf";
export const URL_COMPONENTE = "https://sigs.ufrpe.br/sigaa/graduacao/componente/lista.jsf";
export const URL_BUSCA_COMPONENTE = "https://sigs.ufrpe.br/sigaa/geral/componente_curricular/busca_geral.jsf";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

export const SIGAA_ORIGIN = "https://sigs.ufrpe.br";

// O motor de sessão (sigaaClient.ts) só permite requisições contra este host,
// evitando que as tools genéricas (raw_request/download_file) virem um proxy
// SSRF para hosts arbitrários.
export const ALLOWED_HOSTS = new Set(["sigs.ufrpe.br"]);
