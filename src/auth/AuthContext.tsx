/**
 * AuthContext — React context providing the signed-in user and auth actions.
 * (Phase 8, Slice 8.1)
 *
 * Behaviour:
 *  • On first mount, calls ensureDefaultAccount() so single-user offline mode
 *    is transparent (no sign-in screen appears for a fresh install).
 *  • If the account list has more than one entry AND no active user is set,
 *    currentUser is null — the sign-in screen is shown.
 *  • PIN check in signIn() is a simple equality test (desktop-app security
 *    boundary is the OS, not an in-app hash).
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { LocalUser, Role } from './types';
import {
  loadAccounts,
  loadActiveUserId,
  saveActiveUserId,
  createAccount,
  updateAccount,
  ensureDefaultAccount,
} from './accountStore';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface AuthContextValue {
  currentUser: LocalUser | null;
  users: LocalUser[];
  /**
   * Attempt to sign in as `userId`.  If the account has a PIN, `pin` must
   * match.  Returns true on success, false on PIN mismatch.
   */
  signIn: (userId: string, pin?: string) => boolean;
  signOut: () => void;
  createUser: (name: string, role: Role, pin?: string) => LocalUser;
  updateUser: (id: string, patch: Partial<LocalUser>) => void;
}

// ---------------------------------------------------------------------------
// Context + hook
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<LocalUser[]>(() => loadAccounts());
  const [currentUser, setCurrentUser] = useState<LocalUser | null>(() => {
    // On first mount, ensure a default account exists, then return the active user.
    const { user } = ensureDefaultAccount();
    // Reload accounts in case ensureDefaultAccount created one.
    setUsers(loadAccounts());
    return user;
  });

  // Keep users list fresh after any mutation (createUser / updateUser).
  const refresh = useCallback(() => {
    const all = loadAccounts();
    setUsers(all);
    const activeId = loadActiveUserId();
    const active = all.find((u) => u.id === activeId) ?? null;
    setCurrentUser(active);
  }, []);

  // Sync active user if localStorage changes in another tab.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'codename:accounts:v1' || e.key === 'codename:active-user') refresh();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [refresh]);

  const signIn = useCallback((userId: string, pin?: string): boolean => {
    const all = loadAccounts();
    const user = all.find((u) => u.id === userId);
    if (!user) return false;
    if (user.pin !== undefined && user.pin !== (pin ?? '')) return false;
    saveActiveUserId(userId);
    setCurrentUser(user);
    return true;
  }, []);

  const signOut = useCallback(() => {
    saveActiveUserId(null);
    setCurrentUser(null);
  }, []);

  const createUser = useCallback((name: string, role: Role, pin?: string): LocalUser => {
    const user = createAccount(name, role, pin);
    refresh();
    return user;
  }, [refresh]);

  const updateUser = useCallback((id: string, patch: Partial<LocalUser>): void => {
    updateAccount(id, patch);
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ currentUser, users, signIn, signOut, createUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
