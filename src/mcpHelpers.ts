import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function jsonResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

export function errorResult(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: `Erro: ${message}` }],
    isError: true,
  };
}

const MAX_EMBED_BYTES = 8 * 1024 * 1024; // 8 MiB

/** Resultado de uma tool que baixa um arquivo. Diferente de jsonResult, embute
 * o conteúdo binário na própria resposta (como um content item "resource",
 * base64) — não basta devolver um caminho de arquivo em disco, porque no modo
 * remoto (HTTP) esse caminho só existe no filesystem efêmero do servidor,
 * inacessível a quem chamou a tool. `extraText`, quando informado (ex.: texto
 * extraído de um PDF), entra como um content item de texto adicional, para
 * garantir que o conteúdo seja legível mesmo que o cliente MCP não saiba
 * renderizar/anexar o resource binário. */
export function fileResult(
  meta: Record<string, unknown>,
  buffer: Buffer,
  file: { filename: string; mimeType: string },
  extraText?: string
): CallToolResult {
  const content: CallToolResult["content"] = [
    { type: "text", text: JSON.stringify(meta, null, 2) },
  ];

  if (buffer.length <= MAX_EMBED_BYTES) {
    content.push({
      type: "resource",
      resource: {
        uri: `file:///${encodeURIComponent(file.filename)}`,
        mimeType: file.mimeType,
        blob: buffer.toString("base64"),
      },
    });
  } else {
    content.push({
      type: "text",
      text:
        `Arquivo de ${buffer.length} bytes excede o limite de ${MAX_EMBED_BYTES} bytes para ` +
        `embutir na resposta desta tool. Use o modo stdio local para acessar o arquivo completo ` +
        `pelo caminho salvo em disco (campo "path" acima).`,
    });
  }

  if (extraText) {
    content.push({ type: "text", text: extraText });
  }

  return { content };
}

/** Envolve o handler de uma tool para converter exceções em CallToolResult
 * com isError:true, em vez de derrubar a conexão MCP. */
export function safeTool<Args extends unknown[]>(
  fn: (...args: Args) => Promise<CallToolResult>
): (...args: Args) => Promise<CallToolResult> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResult(err);
    }
  };
}
