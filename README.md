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
