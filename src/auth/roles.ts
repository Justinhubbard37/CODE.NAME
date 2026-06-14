/**
 * Role capability helpers (Phase 8, Slice 8.2 — RBAC).
 *
 * Three roles:
 *   admin  — full control: can write KG, use tools, toggle gates, manage policy.
 *   editor — can write KG and use tools; cannot change gates or admin policy.
 *   viewer — read-only: cannot write KG, use tools, or change any settings.
 *
 * All guards default to admin-level when role is undefined so that single-user
 * offline mode (no role configured) is never accidentally locked out.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Role } from './types';

export const ROLES: Role[] = ['admin', 'editor', 'viewer'];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

/** Can this role write nodes/edges to the Knowledge Graph? */
export function canWrite(role: Role | undefined): boolean {
  return (role ?? 'admin') !== 'viewer';
}

/** Can this role toggle or lock security gates? */
export function canToggleGates(role: Role | undefined): boolean {
  return (role ?? 'admin') === 'admin';
}

/** Can this role execute tools (WebMCP, sidecar tools, graph.* tools)? */
export function canUseTool(role: Role | undefined): boolean {
  return (role ?? 'admin') !== 'viewer';
}

/** Can this role create / switch / delete workspaces? */
export function canManageWorkspaces(role: Role | undefined): boolean {
  return (role ?? 'admin') !== 'viewer';
}

/** Can this role set the admin policy (gate locks)? */
export function canSetPolicy(role: Role | undefined): boolean {
  return (role ?? 'admin') === 'admin';
}

/** Can this role configure the SIEM endpoint? */
export function canConfigureSiem(role: Role | undefined): boolean {
  return (role ?? 'admin') === 'admin';
}
