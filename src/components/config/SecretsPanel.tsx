import { useEffect, useState } from 'react';
import { secretPresent, setSecret, deleteSecret } from '../../lib/secrets';
import { useApp } from '../../state/AppState';

// Secrets the app knows about — keyed by the same name as the env-var fallback.
const SECRETS: { name: string; label: string }[] = [
  { name: 'GEMINI_API_KEY', label: 'Gemini API key' },
  { name: 'OLLAMA_API_KEY', label: 'Ollama Cloud API key' },
];

/**
 * Secrets panel (Phase 2.4). Stores API keys in the OS keychain via the Rust
 * shell — never in plain text. Falls back to env vars when the keychain is
 * unavailable (e.g. plain-browser mode).
 */
export function SecretsPanel() {
  const { refreshEndpoints } = useApp();
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const p: Record<string, boolean> = {};
      for (const s of SECRETS) p[s.name] = await secretPresent(s.name);
      setPresent(p);
    })();
  }, []);

  const save = async (name: string) => {
    const val = (drafts[name] ?? '').trim();
    if (!val) return;
    const ok = await setSecret(name, val);
    if (ok) {
      setPresent((p) => ({ ...p, [name]: true }));
      setDrafts((d) => ({ ...d, [name]: '' }));
      refreshEndpoints(); // re-check connectivity now that the key exists
    }
  };

  const clear = async (name: string) => {
    await deleteSecret(name);
    setPresent((p) => ({ ...p, [name]: false }));
    refreshEndpoints();
  };

  return (
    <div className="space-y-2">
      <div className="type-label font-mono uppercase tracking-wider text-neutral-500">
        Secrets · OS keychain
      </div>
      {SECRETS.map((s) => (
        <div key={s.name} className="space-y-1">
          <div className="flex items-center justify-between type-label font-mono">
            <span className="text-neutral-500">{s.label}</span>
            <span className={present[s.name] ? 'text-emerald-400' : 'text-neutral-600'}>
              {present[s.name] ? 'set' : 'not set'}
            </span>
          </div>
          <div className="flex gap-1">
            <input
              type="password"
              value={drafts[s.name] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [s.name]: e.target.value }))}
              aria-label={s.label}
              placeholder={present[s.name] ? '•••••••• stored' : 'paste key'}
              className="flex-1 min-w-0 bg-neutral-900 border border-neutral-800 text-neutral-300 type-control font-mono p-1.5 outline-none focus:border-neutral-600"
            />
            <button
              onClick={() => save(s.name)}
              aria-label={`Save ${s.label}`}
              className="px-1.5 type-control font-mono border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
            >
              SAVE
            </button>
            {present[s.name] && (
              <button
                onClick={() => clear(s.name)}
                aria-label={`Clear ${s.label}`}
                className="px-1.5 type-control font-mono border border-neutral-700 text-neutral-400 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
              >
                CLEAR
              </button>
            )}
          </div>
        </div>
      ))}
      <div className="type-meta font-mono text-neutral-600">
        Stored in your OS keychain, not in a plain-text file. Secret values are
        not readable from the webview after saving.
      </div>
    </div>
  );
}
