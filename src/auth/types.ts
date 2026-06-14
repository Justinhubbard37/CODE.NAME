/**
 * Auth types shared across the auth layer (Phase 8, Slice 8.1 + 8.2).
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Role determines what actions a signed-in user may take (Phase 8.2 RBAC). */
export type Role = 'admin' | 'editor' | 'viewer';

/**
 * A locally-stored user account.  No password is required for the default
 * single-user offline mode — an optional PIN may be set for shared desktops.
 */
export interface LocalUser {
  /** Stable UUID — used as the audit actor `id`. */
  id: string;
  /** Display name shown in the sign-in screen and header. */
  name: string;
  /** RBAC role — controls gates, writes, and tool access. */
  role: Role;
  /** Unix-ms creation timestamp. */
  createdAt: number;
  /**
   * Optional short PIN (stored as plain string — this is a desktop app, the
   * OS provides the real security boundary).  `undefined` = no PIN required.
   */
  pin?: string;
}
