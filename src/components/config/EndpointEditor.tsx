import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../lib/a11y';
import { LOCKED_ENDPOINT_IDS } from '../../config/defaults';
import { getSecret, setSecret } from '../../lib/secrets';
import type { Endpoint, EndpointKind } from '../../types';

const KINDS: EndpointKind[] = ['ollama', 'lmstudio', 'openai', 'custom', 'gemini', 'a2a'];
const inputCls =
  'w-full bg-neutral-950 border border-neutral-800 text-neutral-300 p-1.5 outline-none focus:border-neutral-600 font-mono text-[10px]';
const roCls = 'w-full bg-neutral-900/60 border border-neutral-800 text-neutral-500 p-1.5 font-mono text-[10px]';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] text-neutral-500 uppercase tracking-wider">{label}</div>
      {children}
    </div>
  );
}

/** The keychain entry name this endpoint's key is stored under. */
function secretNameFor(ep: Endpoint): string {
  if (ep.apiKeyEnv) return ep.apiKeyEnv;
  if (ep.kind === 'ollama') return 'OLLAMA_API_KEY';
  if (ep.kind === 'gemini') return 'GEMINI_API_KEY';
  return `${ep.id.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}_API_KEY`;
}

/** Strip any API path the user pasted — the app appends the right path itself. */
function normalizeBaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(api\/(chat|tags|generate)|v1(\/chat\/completions)?)$/i, '')
    .replace(/\/+$/, '');
}

/**
 * Endpoint editor. Fixed providers (LOCKED_ENDPOINT_IDS) show their transport
 * identity read-only — only model + API key are editable. The API key is written
 * straight to the OS keychain; it's never echoed back or stored in a file.
 */
export function EndpointEditor({
  endpoint,
  onClose,
  onSave,
}: {
  endpoint: Endpoint;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Endpoint>) => void;
}) {
  const locked = LOCKED_ENDPOINT_IDS.has(endpoint.id);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, onClose);
  const [label, setLabel] = useState(endpoint.label);
  const [kind, setKind] = useState<EndpointKind>(endpoint.kind);
  const [baseUrl, setBaseUrl] = useState(endpoint.baseUrl);
  const [model, setModel] = useState(endpoint.model);
  const [isLocal, setIsLocal] = useState(endpoint.isLocal);
  const [apiKey, setApiKey] = useState('');
  const [keySet, setKeySet] = useState(false);

  const secretName = secretNameFor(endpoint);
  const needsKey = !isLocal || kind === 'gemini' || !!endpoint.apiKeyEnv || !!endpoint.usesCloud;

  useEffect(() => {
    (async () => setKeySet(!!(await getSecret(secretName))))();
  }, [secretName]);

  const save = async () => {
    if (apiKey.trim()) {
      await setSecret(secretName, apiKey.trim());
    }
    if (locked) {
      onSave(endpoint.id, { model: model.trim() || endpoint.model });
    } else {
      onSave(endpoint.id, {
        label: label.trim() || endpoint.label,
        kind,
        baseUrl: normalizeBaseUrl(baseUrl),
        model: model.trim(),
        isLocal,
        apiKeyEnv: needsKey ? secretName : undefined,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="endpoint-editor-title"
        className="w-80 bg-neutral-900 border border-neutral-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
          <span id="endpoint-editor-title" className="text-[10px] font-mono uppercase tracking-widest text-emerald-400/80">
            {locked ? 'Provider' : 'Edit Endpoint'}
          </span>
          <button onClick={onClose} aria-label="Close endpoint editor" className="text-neutral-500 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-3 space-y-3">
          {locked && (
            <div className="text-[8px] font-mono text-neutral-500 border border-neutral-800 bg-neutral-950 p-1.5 leading-relaxed">
              Built-in provider — its address and type are fixed so local and cloud can't be
              confused. You can set the API key (if cloud) and pick the model.
            </div>
          )}

          <Field label="Name">
            {locked ? (
              <div className={roCls}>{endpoint.label}</div>
            ) : (
              <input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Name" className={inputCls} />
            )}
          </Field>

          <Field label="Type">
            {locked ? (
              <div className={roCls}>{endpoint.kind}</div>
            ) : (
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as EndpointKind)}
                aria-label="Type"
                className={inputCls}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label={locked ? 'Address (fixed)' : 'Base URL'}>
            {locked ? (
              <div className={roCls}>{endpoint.baseUrl}</div>
            ) : (
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                aria-label="Base URL"
                className={inputCls}
              />
            )}
          </Field>

          <Field label="Model">
            <input value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model" className={inputCls} />
          </Field>

          {needsKey && (
            <Field label={`API Key${keySet ? ' · set' : ' · not set'}`}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={keySet ? '•••••••• stored — paste to replace' : 'paste your API key'}
                aria-label="API key"
                className={inputCls}
              />
            </Field>
          )}

          {!locked && (
            <label className="flex items-center gap-2 text-[10px] font-mono text-neutral-400">
              <input type="checkbox" checked={isLocal} onChange={(e) => setIsLocal(e.target.checked)} />
              Local (not blocked by the Network gate)
            </label>
          )}

          {needsKey && (
            <div className="text-[8px] font-mono text-neutral-600 leading-relaxed">
              Stored in your OS keychain and only ever read inside the Rust shell when making a
              request — never shown on screen or written to a file.
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              className="flex-1 py-1.5 text-[10px] font-mono border border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
            >
              SAVE
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-1.5 text-[10px] font-mono border border-neutral-700 text-neutral-400 hover:bg-neutral-800"
            >
              CANCEL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
