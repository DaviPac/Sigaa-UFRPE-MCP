// Estado de sessão SIGAA mantido em memória durante a vida de UMA conexão MCP
// (stdio: a única conexão do processo; remoto/HTTP: uma instância por
// Mcp-Session-Id). Ao contrário da API Go (stateless, cliente re-envia
// jsessionid/viewState a cada chamada), aqui a sessão fica guardada no
// servidor e as tools leem/atualizam este objeto — cada conexão recebe sua
// própria instância (ver src/mcpServer.ts), nunca uma compartilhada entre
// clientes diferentes.

export class SigaaSession {
  jsessionid: string | undefined;
  viewState: string | undefined;
  nome: string | undefined;
  matricula: string | undefined;

  isAuthenticated(): boolean {
    return !!this.jsessionid;
  }

  requireAuth(): { jsessionid: string; viewState?: string } {
    if (!this.jsessionid) {
      throw new Error(
        "Nenhuma sessão SIGAA ativa. Chame a tool 'sigaa_login' primeiro."
      );
    }
    return { jsessionid: this.jsessionid, viewState: this.viewState };
  }

  update(partial: { jsessionid?: string; viewState?: string; nome?: string; matricula?: string }): void {
    if (partial.jsessionid) this.jsessionid = partial.jsessionid;
    if (partial.viewState) this.viewState = partial.viewState;
    if (partial.nome) this.nome = partial.nome;
    if (partial.matricula) this.matricula = partial.matricula;
  }

  reset(): void {
    this.jsessionid = undefined;
    this.viewState = undefined;
    this.nome = undefined;
    this.matricula = undefined;
  }
}
