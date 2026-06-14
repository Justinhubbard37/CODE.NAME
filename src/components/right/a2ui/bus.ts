import type { A2UIPayload } from './types';

/**
 * Per-task A2UI bus (Phase 5, Slice 5.3).
 *
 * Replaces the Phase 4 global singleton with a Map keyed by taskId so that
 * switching tabs shows that tab's own agent-rendered UI rather than the last
 * UI rendered by any agent in any tab.
 */
type Sub = (p: A2UIPayload | null) => void;

const store = new Map<string, A2UIPayload | null>();
const subs = new Map<string, Set<Sub>>();

export function setAgentUI(taskId: string, p: A2UIPayload | null): void {
  store.set(taskId, p);
  subs.get(taskId)?.forEach((s) => s(p));
}

export function getAgentUI(taskId: string): A2UIPayload | null {
  return store.get(taskId) ?? null;
}

export function subscribeAgentUI(taskId: string, fn: Sub): () => void {
  if (!subs.has(taskId)) subs.set(taskId, new Set());
  subs.get(taskId)!.add(fn);
  return () => {
    subs.get(taskId)?.delete(fn);
  };
}

/** Remove a task's agent UI and its subscriber set (call when a tab is closed). */
export function clearAgentUI(taskId: string): void {
  store.delete(taskId);
  subs.delete(taskId);
}
