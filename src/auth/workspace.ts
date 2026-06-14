/**
 * Workspace management (Phase 8, Slice 8.3).
 *
 * A workspace is an isolated data silo: its own IndexedDB database and a
 * separate localStorage config key.  Multiple workspaces can exist on one
 * machine; only one is active at a time.  Switching workspaces reloads the
 * page so the KnowledgeStore is fully re-initialised.
 *
 * Storage keys:
 *   codename:workspaces:v1      — JSON array of Workspace
 *   codename:active-workspace   — active workspace id
 *
 * DB naming convention:
 *   • The legacy "Default" workspace uses DB name `codename-kg` to preserve
 *     any data created before Phase 8 (no migration required).
 *   • Every new workspace uses `codename-kg:${id}`.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  /**
   * The IndexedDB database name for this workspace.
   * Legacy default workspace keeps `'codename-kg'`; new workspaces use
   * `'codename-kg:${id}'`.
   */
  dbName: string;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const WORKSPACES_KEY = 'codename:workspaces:v1';
const ACTIVE_WS_KEY = 'codename:active-workspace';

/** The default workspace preserves the pre-Phase-8 DB name. */
const DEFAULT_WS: Workspace = {
  id: 'default',
  name: 'Default',
  createdAt: 0,
  dbName: 'codename-kg',
};

export function loadWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Workspace[];
  } catch {
    return [];
  }
}

export function saveWorkspaces(ws: Workspace[]): void {
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify(ws));
}

export function loadActiveWorkspaceId(): string {
  return localStorage.getItem(ACTIVE_WS_KEY) ?? 'default';
}

export function saveActiveWorkspaceId(id: string): void {
  localStorage.setItem(ACTIVE_WS_KEY, id);
}

// ---------------------------------------------------------------------------
// Higher-level helpers
// ---------------------------------------------------------------------------

/**
 * Ensures the workspace list is bootstrapped.
 * If no workspaces exist, creates the default and sets it as active.
 * Returns the full list.
 */
export function ensureDefaultWorkspace(): Workspace[] {
  let all = loadWorkspaces();
  if (all.length === 0) {
    all = [DEFAULT_WS];
    saveWorkspaces(all);
    saveActiveWorkspaceId('default');
  }
  return all;
}

/** Returns the currently active Workspace object (falls back to default). */
export function getActiveWorkspace(): Workspace {
  const all = ensureDefaultWorkspace();
  const id = loadActiveWorkspaceId();
  return all.find((w) => w.id === id) ?? all[0] ?? DEFAULT_WS;
}

/** Create a new workspace and persist it.  Does NOT switch to it. */
export function createWorkspace(name: string): Workspace {
  const id = uuidv4();
  const ws: Workspace = { id, name, createdAt: Date.now(), dbName: `codename-kg:${id}` };
  const all = loadWorkspaces();
  all.push(ws);
  saveWorkspaces(all);
  return ws;
}

/** Switch to a workspace by id.  Caller must reload the page. */
export function switchWorkspace(id: string): void {
  saveActiveWorkspaceId(id);
}

/** Delete a workspace by id.  Cannot delete the active workspace. */
export function deleteWorkspace(id: string): void {
  if (id === loadActiveWorkspaceId()) return; // safety guard
  const all = loadWorkspaces().filter((w) => w.id !== id);
  saveWorkspaces(all);
}
