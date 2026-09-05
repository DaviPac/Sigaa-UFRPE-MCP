# sigaa-ufrpe-mcp

Servidor MCP (Model Context Protocol) para o SIGAA da UFRPE, com acesso mais
profundo do que uma API estruturada tradicional: além de dados já parseados
(notas, turmas, currículo...), ele permite **ver o HTML cru** de qualquer
página da sessão, **montar e disparar requisições customizadas** (reproduzindo
ações JSF descobertas no próprio HTML) e **baixar arquivos arbitrários**
(PDFs, anexos de cronograma, etc.), não só os casos pré-definidos.

Implementação standalone em TypeScript: o próprio servidor faz login e
mantém a sessão SIGAA (JSESSIONID + `javax.faces.ViewState`), sem depender de
nenhum serviço externo em runtime.

## Instalação

```bash
npm install
npm run build
```

## Uso (Claude Desktop / Claude Code)

Adicione ao seu `claude_desktop_config.json` (ou equivalente):

```json
{
  "mcpServers": {
    "sigaa-ufrpe": {
      "command": "node",
      "args": ["/caminho/absoluto/para/Sigaa-UFRPE-MCP/dist/index.js"],
      "env": {
        "SIGAA_MCP_DOWNLOAD_DIR": "/caminho/absoluto/para/downloads"
      }
    }
  }
}
```

`SIGAA_MCP_DOWNLOAD_DIR` é opcional — por padrão os arquivos baixados vão para
`./downloads` (relativo ao diretório de onde o processo é iniciado).

## Testar com o MCP Inspector

```bash
npm run build
npm run inspector
```

Abra a URL impressa no terminal e chame as tools na ordem sugerida abaixo.

## Remoto (HTTP) — Claude.ai (web) e apps mobile

Claude Desktop e Claude Code sabem spawnar um processo local (`command`/`args`
acima), mas Claude.ai (web) e os apps mobile só conseguem falar com MCP
servers **remotos**, acessíveis via HTTPS. Para isso existe um segundo
entrypoint, `dist/remote.js`, que expõe o mesmo servidor via **Streamable
HTTP** em vez de stdio.

Diferente do modo stdio (uma sessão SIGAA por processo), o modo remoto cria
**uma `SigaaSession` isolada por conexão MCP** — duas pessoas (ou duas abas da
mesma pessoa) nunca compartilham `jsessionid`/`viewState`.

### Rodar localmente

```bash
npm run build
SIGAA_MCP_REMOTE_TOKEN=$(openssl rand -hex 32) PORT=3000 npm run start:remote
```

Variáveis de ambiente:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SIGAA_MCP_REMOTE_TOKEN` | **Sim** | Token de acesso (`Authorization: Bearer <token>`). O processo recusa iniciar sem ela. |
| `PORT` | Não (padrão `3000`) | Porta HTTP. |
| `SIGAA_MCP_DOWNLOAD_DIR` | Não | Mesma variável do modo stdio — pasta onde arquivos baixados são salvos (compartilhada entre todas as conexões). |

### Testar com `curl`

```bash
curl http://localhost:3000/health
# {"status":"ok"}

curl -i -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $SIGAA_MCP_REMOTE_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
# devolve o header Mcp-Session-Id — use-o nas próximas chamadas dessa sessão
```

### Deploy

Um `Dockerfile` já vem pronto (build multi-stage, `CMD node dist/remote.js`,
respeita `$PORT`) — funciona em qualquer plataforma que rode containers
(Railway, Fly.io, Render, um VPS com Docker, etc.). Esse processo fala **HTTP
puro**; em produção ele precisa ficar atrás de algo que termine TLS (a própria
plataforma de deploy, ou um proxy como Caddy/nginx/Cloudflare na frente) —
nunca exponha a porta HTTP direto na internet.

### Conectar

**Claude Desktop / Claude Code**, apontando para o servidor remoto em vez de
um processo local:

```json
{
  "mcpServers": {
    "sigaa-ufrpe-remote": {
      "url": "https://seu-host.example.com/mcp",
      "headers": { "Authorization": "Bearer SEU_TOKEN_AQUI" }
    }
  }
}
```

**Claude.ai (web)**: em Settings → Connectors, adicione um connector
customizado apontando para `https://seu-host.example.com/mcp`, informando o
mesmo token no header `Authorization`. A UI exata pode mudar — confira a
documentação atual da Anthropic sobre "remote MCP connectors" se os passos
acima não baterem com o que você vê na tela.

### Limitações / avisos de segurança

- Pensado para **uso pessoal de um único usuário**, não multi-tenant: quem
  tiver o token tem acesso completo (login, download de arquivos, etc.).
  Trate-o como uma senha — gere com `openssl rand -hex 32`, nunca comite, e
  rotacione (troque a env var e reinicie o processo) se vazar.
- Downloads de **todas** as conexões caem na mesma pasta
  (`SIGAA_MCP_DOWNLOAD_DIR`), sem isolamento por sessão.
- Sessões sem atividade por 30 minutos são encerradas e removidas da memória
  automaticamente.

## Sessão

Diferente de uma API REST stateless, este servidor guarda a sessão SIGAA
(JSESSIONID + ViewState) **em memória, no processo**, e a reutiliza
automaticamente entre chamadas de tool — não é preciso repassar tokens
manualmente. Chame `sigaa_login` uma vez no início da conversa; as demais
tools usam a sessão ativa.

## Tools disponíveis

### Núcleo genérico (acesso avançado)

| Tool | Descrição |
|---|---|
| `sigaa_login` | Autentica (usuário/senha), trata o interstitial "Aviso de Logon". |
| `sigaa_get_html` | Devolve o HTML bruto de qualquer URL sob `sigs.ufrpe.br`, sem parsing. |
| `sigaa_raw_request` | Monta e dispara uma requisição customizada (método, URL, campos de formulário) — para reproduzir ações JSF sem precisar de uma tool dedicada. |
| `sigaa_download_file` | Baixa um arquivo arbitrário (PDF, anexo, etc.) e salva em disco, validando que a resposta não é uma página de erro disfarçada. |

### Paridade com a API REST original

| Tool | Descrição |
|---|---|
| `sigaa_main_data` | Nome, matrícula, turmas resumidas, índices acadêmicos, carga horária. |
| `sigaa_get_turma` | Cronograma, notícia e faltas de uma turma. |
| `sigaa_get_notas` | Notas do semestre atual e anteriores. |
| `sigaa_get_curriculo` | Estrutura curricular do curso. |
| `sigaa_get_componente` | Detalhes de um componente curricular (ementa, pré-requisitos, equivalências). |
| `sigaa_get_matricula` | Atestado de matrícula estruturado. |
| `sigaa_get_historico_pdf` | Baixa o histórico escolar em PDF. |
| `sigaa_get_vinculo_pdf` | Baixa a declaração de vínculo em PDF. |

Todas as tools que dependem de um `ViewState` avisam explicitamente quando é
preciso chamar `sigaa_main_data` antes.

## Segurança

`sigaa_get_html`, `sigaa_raw_request` e `sigaa_download_file` só fazem
requisições para hosts na allowlist (`src/constants.ts`, hoje só
`sigs.ufrpe.br`) — isso evita que o servidor vire um proxy aberto para
qualquer host arbitrário (SSRF).

## Escopo

Não inclui o subsistema de integração com Google Classroom presente na API
Go original (`/classroom/*`) — é um subsistema independente do SIGAA, que
exigiria OAuth e banco de dados próprios, fora do escopo de "acesso mais
profundo ao SIGAA".
