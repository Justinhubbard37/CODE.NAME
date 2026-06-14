/**
 * Admin policy engine (Phase 8, Slice 8.5).
 *
 * An admin may force individual security gates closed for ALL users in the
 * workspace.  When a gate is policy-locked, users cannot re-open it via the
 * SecurityGates UI (the toggle is disabled and shows a lock icon).
 *
 * Three-layer resolution:
 *   policy ceiling  →  user-set global gate  →  per-tab cap  →  effective gate
 *
 * The policy only locks gates OFF.  Setting a gate to `true` in the policy
 * means "admin allows users to control this gate themselves".  `undefined`
 * or absent key = same as `true` (no lock).
 *
 * Storage key: codename:admin-policy:v1
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SecurityGates } from '../types';

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export interface AdminPolicy {
  /**
   * If `false`, the gate is forced closed regardless of the user's setting.
   * If `true` or `undefined`, the user controls the gate.
   */
  filesystem?: boolean;
  network?: boolean;
  tools?: boolean;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const POLICY_KEY = 'codename:admin-policy:v1';

export function loadPolicy(): AdminPolicy {
  try {
    const raw = localStorage.getItem(POLICY_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AdminPolicy;
  } catch {
    return {};
  }
}

export function savePolicy(p: AdminPolicy): void {
  localStorage.setItem(POLICY_KEY, JSON.stringify(p));
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Apply the admin policy as a ceiling on the user-set gates.
 *
 * `policy.gate = false`     → effective gate is ALWAYS false (admin lock)
 * `policy.gate = true|undefined` → user gate passes through unchanged
 */
export function applyPolicy(policy: AdminPolicy, userGates: SecurityGates): SecurityGates {
  return {
    filesystem: (policy.filesystem ?? true) && userGates.filesystem,
    network:    (policy.network    ?? true) && userGates.network,
    tools:      (policy.tools      ?? true) && userGates.tools,
  };
}

/**
 * Returns true if the given gate key is locked closed by policy.
 * Useful for UI: locked gates render with a lock icon and disabled toggle.
 */
export function isGateLocked(policy: AdminPolicy, key: keyof SecurityGates): boolean {
  return policy[key] === false;
}
