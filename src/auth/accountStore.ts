/**
 * localStorage CRUD for LocalUser accounts (Phase 8, Slice 8.1).
 *
 * Storage keys:
 *   codename:accounts:v1   — JSON array of LocalUser
 *   codename:active-user   — active user id string
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';
import type { LocalUser, Role } from './types';

const ACCOUNTS_KEY = 'codename:accounts:v1';
const ACTIVE_USER_KEY = 'codename:active-user';

// ---------------------------------------------------------------------------
// Raw persistence
// ---------------------------------------------------------------------------

export function loadAccounts(): LocalUser[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalUser[];
  } catch {
    return [];
  }
}

export function saveAccounts(users: LocalUser[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(users));
}

export function loadActiveUserId(): string | null {
  return localStorage.getItem(ACTIVE_USER_KEY);
}

export function saveActiveUserId(id: string | null): void {
  if (id === null) {
    localStorage.removeItem(ACTIVE_USER_KEY);
  } else {
    localStorage.setItem(ACTIVE_USER_KEY, id);
  }
}

// ---------------------------------------------------------------------------
// Higher-level helpers
// ---------------------------------------------------------------------------

/**
 * Returns the currently active user, or null if nobody is signed in.
 * Does NOT auto-create or auto-sign-in — that is the AuthProvider's job.
 */
export function getActiveUser(): LocalUser | null {
  const id = loadActiveUserId();
  if (!id) return null;
  return loadAccounts().find((u) => u.id === id) ?? null;
}

export function createAccount(name: string, role: Role, pin?: string): LocalUser {
  const user: LocalUser = { id: uuidv4(), name, role, createdAt: Date.now(), pin };
  const users = loadAccounts();
  users.push(user);
  saveAccounts(users);
  return user;
}

export function updateAccount(id: string, patch: Partial<LocalUser>): void {
  const users = loadAccounts().map((u) => (u.id === id ? { ...u, ...patch } : u));
  saveAccounts(users);
}

/**
 * Ensures at least one account exists.
 * If accounts list is empty, creates a default admin account and signs into it.
 * Returns the default user and a flag indicating whether it was just created.
 */
export function ensureDefaultAccount(): { user: LocalUser; isNew: boolean } {
  const existing = loadAccounts();
  if (existing.length > 0) {
    const active = existing.find((u) => u.id === loadActiveUserId()) ?? existing[0];
    return { user: active, isNew: false };
  }
  const user = createAccount('Local User', 'admin');
  saveActiveUserId(user.id);
  return { user, isNew: true };
}
