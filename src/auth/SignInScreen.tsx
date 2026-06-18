/**
 * SignInScreen — shown when no user is signed in and multiple accounts exist.
 * (Phase 8, Slice 8.1)
 *
 * Single-user mode: AuthProvider auto-signs into the default account so this
 * screen is never shown for a fresh single-user install.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { useAuth } from './AuthContext';
import type { Role } from './types';

const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

export function SignInScreen() {
  const { users, signIn, createUser } = useAuth();
  const [selected, setSelected] = useState<string | null>(users[0]?.id ?? null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<Role>('editor');
  const [newPin, setNewPin] = useState('');

  function handleSignIn() {
    if (!selected) return;
    const ok = signIn(selected, pin || undefined);
    if (!ok) {
      setError('Incorrect PIN');
      setPin('');
    } else {
      setError('');
    }
  }

  function handleCreate() {
    if (!newName.trim()) return;
    const user = createUser(newName.trim(), newRole, newPin || undefined);
    signIn(user.id);
    setCreating(false);
  }

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-neutral-950 text-neutral-300">
      <div className="w-80 flex flex-col gap-4">
        {/* Header */}
        <div className="text-center mb-2">
          <div className="type-heading tracking-[0.3em] uppercase text-neutral-500 mb-1">CODE NAME</div>
          <div className="text-neutral-400 type-body">Sign in to continue</div>
        </div>

        {!creating ? (
          <>
            {/* Account list */}
            <div className="flex flex-col gap-1">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setSelected(u.id); setError(''); setPin(''); }}
                  className={`flex items-center gap-3 px-3 py-2 rounded text-left type-body transition-colors ${
                    selected === u.id
                      ? 'bg-neutral-800 border border-neutral-600 text-neutral-100'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  <span className="flex-1 font-mono">{u.name}</span>
                  <span className="type-meta text-neutral-600">{ROLE_LABELS[u.role]}</span>
                </button>
              ))}
            </div>

            {/* PIN field — shown only if selected user has a PIN */}
            {selected && users.find((u) => u.id === selected)?.pin !== undefined && (
              <input
                type="password"
                placeholder="PIN"
                value={pin}
                onChange={(e) => { setPin(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
                className="bg-neutral-900 border border-neutral-700 rounded px-3 py-1.5 type-control font-mono text-neutral-200 focus:outline-none focus:border-neutral-500"
                maxLength={16}
                autoFocus
              />
            )}

            {error && <div className="text-red-400 type-meta font-mono">{error}</div>}

            <button
              onClick={handleSignIn}
              disabled={!selected}
              className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 border border-neutral-600 rounded px-4 py-2 type-control font-mono transition-colors"
            >
              Sign in
            </button>

            <button
              onClick={() => setCreating(true)}
              className="type-meta text-neutral-600 hover:text-neutral-400 transition-colors text-center"
            >
              + Add account
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded px-3 py-1.5 type-control font-mono text-neutral-200 focus:outline-none focus:border-neutral-500"
              autoFocus
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              className="bg-neutral-900 border border-neutral-700 rounded px-3 py-1.5 type-control font-mono text-neutral-200 focus:outline-none focus:border-neutral-500"
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <input
              type="password"
              placeholder="PIN (optional)"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded px-3 py-1.5 type-control font-mono text-neutral-200 focus:outline-none focus:border-neutral-500"
              maxLength={16}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 border border-neutral-600 rounded px-3 py-1.5 type-control font-mono transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => setCreating(false)}
                className="flex-1 border border-neutral-700 rounded px-3 py-1.5 type-control font-mono text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
