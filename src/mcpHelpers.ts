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
