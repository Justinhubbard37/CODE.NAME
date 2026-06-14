/**
 * WebMCP shim (Phase 4). The WebMCP `document.modelContext` API is a browser
 * proposal that does not exist natively in the Tauri webview, so we implement
 * its shape ourselves and OWN the security boundary: every executeTool() passes
 * through a gate guard + activity logger before running. Swap for a native API
 * or community polyfill later behind this same surface.
 */
export interface WebMcpResult {
  content: { type: 'text'; text: string }[];
}

export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema?: unknown;
  execute: (args: Record<string, unknown>) => Promise<WebMcpResult> | WebMcpResult;
}

export interface ToolMeta {
  name: string;
  description: string;
  inputSchema?: unknown;
}

type Guard = (name: string, args: unknown) => { allowed: boolean; reason?: string };
type Logger = (name: string, allowed: boolean, detail?: string) => void;

let guard: Guard = () => ({ allowed: true });
let logger: Logger = () => {};

export function setToolGuard(g: Guard): void {
  guard = g;
}
export function setToolLogger(l: Logger): void {
  logger = l;
}

const tools = new Map<string, WebMcpTool>();
const listeners = new Set<() => void>();

export function onToolChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function emit() {
  listeners.forEach((l) => l());
}

export function registerTool(t: WebMcpTool, opts?: { signal?: AbortSignal }): void {
  tools.set(t.name, t);
  emit();
  opts?.signal?.addEventListener('abort', () => {
    tools.delete(t.name);
    emit();
  });
}

export function getTools(): ToolMeta[] {
  return Array.from(tools.values()).map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}

export async function executeTool(name: string, args: Record<string, unknown> = {}): Promise<WebMcpResult> {
  const t = tools.get(name);
  if (!t) return { content: [{ type: 'text', text: `[error] unknown tool: ${name}` }] };
  const decision = guard(name, args);
  if (!decision.allowed) {
    logger(name, false, decision.reason);
    return { content: [{ type: 'text', text: `[blocked] ${decision.reason ?? 'gated'}` }] };
  }
  logger(name, true);
  try {
    return await t.execute(args);
  } catch (e) {
    return { content: [{ type: 'text', text: `[error] ${e instanceof Error ? e.message : 'failed'}` }] };
  }
}

/** Install the `document.modelContext` surface if not already present. */
export function installWebMcp(): void {
  if (typeof document === 'undefined') return;
  const anyDoc = document as unknown as { modelContext?: unknown };
  if (anyDoc.modelContext) return;
  anyDoc.modelContext = { registerTool, getTools, executeTool };
}
