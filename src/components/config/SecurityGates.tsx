import { HardDrive, Globe, Wrench, Lock, Unlock, ShieldOff } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { useAuth } from '../../auth/AuthContext';
import { canToggleGates } from '../../auth/roles';
import { isGateLocked } from '../../auth/policy';
import type { SecurityGates as Gates } from '../../types';

const GATES: { key: keyof Gates; label: string; icon: typeof HardDrive; desc: string }[] = [
  { key: 'filesystem', label: 'FILE SYSTEM', icon: HardDrive, desc: 'local ingest + disk reads' },
  { key: 'network', label: 'NETWORK', icon: Globe, desc: 'outward / cloud requests' },
  { key: 'tools', label: 'TOOL EXEC', icon: Wrench, desc: 'agent tool invocations' },
];

export function SecurityGates() {
  const { gates, toggleGate, adminPolicy, togglePolicyLock } = useApp();
  const { currentUser } = useAuth();
  const isAdmin = canToggleGates(currentUser?.role);

  return (
    <div className="space-y-2">
      <div className="type-label font-mono uppercase tracking-wider text-neutral-500">
        Capability Gates
      </div>
      {!isAdmin && (
        <div className="flex items-center gap-1.5 type-meta font-mono text-amber-600/70 px-1">
          <ShieldOff className="w-3 h-3 shrink-0" />
          <span>Read-only — gate changes require admin role</span>
        </div>
      )}
      {GATES.map(({ key, label, icon: Icon, desc }) => {
        const on = gates[key];
        const locked = isGateLocked(adminPolicy, key);
        return (
          <div key={key} className="flex items-center gap-1">
            <button
              onClick={() => !locked && isAdmin && toggleGate(key)}
              disabled={!isAdmin || locked}
              title={
                locked
                  ? 'Gate locked by admin policy'
                  : !isAdmin
                  ? 'Admin role required to change gates'
                  : undefined
              }
              className={`flex-1 flex items-center gap-2 px-2 py-2 border text-left transition-colors ${
                !isAdmin || locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
              } ${
                on
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-red-500/40 bg-red-500/5'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${on ? 'text-emerald-400' : 'text-red-400'}`} />
              <div className="flex-1 min-w-0">
                <div className={`type-control font-mono tracking-wider ${on ? 'text-neutral-200' : 'text-neutral-400'}`}>
                  {label}
                </div>
                <div className="type-meta text-neutral-600 font-mono truncate">{desc}</div>
              </div>
              <span
                className={`flex items-center gap-1 type-meta font-mono px-1.5 py-0.5 rounded-full ${
                  on ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
                }`}
              >
                {on ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                {on ? 'OPEN' : 'SEVERED'}
              </span>
            </button>

            {/* Policy lock toggle — admin only; shows lock state for all roles */}
            <button
              onClick={() => isAdmin && togglePolicyLock(key)}
              title={
                isAdmin
                  ? locked
                    ? 'Unlock policy — allow user control'
                    : 'Lock gate via admin policy'
                  : locked
                  ? 'Locked by admin policy'
                  : 'No policy lock'
              }
              className={`p-1.5 transition-colors ${
                locked
                  ? 'text-amber-400 hover:text-amber-300'
                  : 'text-neutral-700 hover:text-neutral-400'
              } ${!isAdmin ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <Lock className="w-3 h-3" />
            </button>
          </div>
        );
      })}
      {isAdmin && (
        <div className="type-meta font-mono text-neutral-700 px-1">
          Lock icon → admin policy ceiling (forces gate closed for all users)
        </div>
      )}
    </div>
  );
}
