/**
 * First-run setup wizard (Phase 12, Slice 12.4).
 *
 * A short, fully skippable flow that gets a brand-new user to a working chat:
 *   1. Welcome
 *   2. Model     — pick an endpoint + model (defaults to local Ollama)
 *   3. Access    — optional API key / Ollama sign-in (cloud endpoints only)
 *   4. Gates     — review the capability gates (safe, open-by-default)
 *   5. Self-check — run the local-first degradation check and show results
 *   6. Done      — links to the in-app docs
 *
 * Design rules (per the plan): every step can be skipped, and the wizard never
 * changes anything unless the user acts — defaults stay safe and offline. The
 * "onboarded" flag is persisted by the parent (App Shell) when this closes.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Rocket, Cpu, KeyRound, ShieldCheck, Stethoscope, BookOpen,
  ChevronLeft, ChevronRight, Check, X, Loader2, RefreshCw, CircleAlert,
} from 'lucide-react';
import { useApp } from '../../state/AppState';
import { runSelfCheck, type CheckResult } from '../../lib/selfcheck';
import { useFocusTrap } from '../../lib/a11y';

type StepId = 'welcome' | 'model' | 'access' | 'gates' | 'check' | 'done';
const STEPS: StepId[] = ['welcome', 'model', 'access', 'gates', 'check', 'done'];

const GATE_COPY: { key: 'filesystem' | 'network' | 'tools'; label: string; help: string }[] = [
  { key: 'filesystem', label: 'Filesystem', help: 'Allow gated ingestion and writes to the local knowledge graph.' },
  { key: 'network', label: 'Network', help: 'Allow outbound calls to cloud models. Local models never need this.' },
  { key: 'tools', label: 'Tools', help: 'Allow the agent to run WebMCP tools and reach the agent sidecar.' },
];

export function OnboardingWizard({ onClose }: { onClose: () => void }) {
  const {
    gates, toggleGate,
  } = useApp();

  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, onClose);

  const go = (delta: number) => setStepIdx((i) => Math.min(STEPS.length - 1, Math.max(0, i + delta)));

  /* ---- self-check step ---- */
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const runChecks = useCallback(async () => {
    setChecking(true);
    try {
      setChecks(await runSelfCheck());
    } finally {
      setChecking(false);
    }
  }, []);
  // Auto-run the self-check the first time the user reaches that step.
  useEffect(() => {
    if (step === 'check' && checks === null && !checking) void runChecks();
  }, [step, checks, checking, runChecks]);

  const configureProvider = () => {
    window.dispatchEvent(new CustomEvent('codename:open-settings', { detail: { view: 'provider-manager' } }));
  };

  const stepMeta: Record<StepId, { icon: typeof Rocket; title: string }> = {
    welcome: { icon: Rocket, title: 'Welcome' },
    model: { icon: Cpu, title: 'Choose a model' },
    access: { icon: KeyRound, title: 'Access' },
    gates: { icon: ShieldCheck, title: 'Capability gates' },
    check: { icon: Stethoscope, title: 'Self-check' },
    done: { icon: BookOpen, title: 'You’re ready' },
  };
  const Meta = stepMeta[step];

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="w-full max-w-lg bg-neutral-950 border border-neutral-800 shadow-2xl flex flex-col"
      >
        {/* Header + progress */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Meta.icon className="w-4 h-4 text-emerald-500/80" aria-hidden="true" />
            <div>
              <h2 id="onboarding-title" className="type-heading font-mono tracking-widest text-neutral-100 uppercase">
                {Meta.title}
              </h2>
              <p className="type-meta font-mono text-neutral-400 mt-0.5">
                Step {stepIdx + 1} of {STEPS.length} · CODE NAME setup
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Skip setup"
            className="shrink-0 p-1.5 text-neutral-500 hover:text-neutral-200 border border-neutral-800 hover:border-neutral-600 rounded transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-neutral-900">
          <div
            className="h-full bg-emerald-500/70 transition-all"
            style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Body */}
        <div className="px-5 py-5 min-h-[15rem] type-body font-mono text-neutral-300 space-y-4">
          {step === 'welcome' && (
            <div className="space-y-3">
              <p className="text-neutral-200">A local-first agent harness with a governed knowledge graph.</p>
              <p className="text-neutral-400">
                This quick setup is optional — every step can be skipped, and the safe defaults run
                fully offline on your machine. You can change all of this later in Settings.
              </p>
              <ul className="text-neutral-400 space-y-1">
                <li>· Pick a model (local Ollama by default)</li>
                <li>· Add a cloud key only if you want one</li>
                <li>· Review the capability gates</li>
                <li>· Run a self-check</li>
              </ul>
            </div>
          )}

          {step === 'model' && (
            <div className="space-y-3">
              <p className="text-neutral-400">
                Configure provider connections, credentials, and model inventory in Provider Manager.
              </p>
              <button
                onClick={configureProvider}
                className="type-control border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 px-3 py-1.5 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
              >
                Configure Provider
              </button>
            </div>
          )}

          {step === 'access' && (
            <div className="space-y-3">
              <p className="text-neutral-400">
                API keys and provider health checks are handled in Provider Manager. Keys are stored in the desktop OS keychain and are never written to app config.
              </p>
              <button
                onClick={configureProvider}
                className="type-control border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 px-3 py-1.5 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
              >
                Configure Provider
              </button>
            </div>
          )}

          {step === 'gates' && (
            <div className="space-y-3">
              <p className="text-neutral-400">
                Gates are capability switches. They start open for a smooth first run; close any you don’t want.
              </p>
              {GATE_COPY.map((g) => (
                <div key={g.key} className="flex items-start justify-between gap-3 border border-neutral-800 px-3 py-2">
                  <div>
                    <div className="text-neutral-200">{g.label}</div>
                    <div className="type-meta text-neutral-400">{g.help}</div>
                  </div>
                  <button
                    onClick={() => toggleGate(g.key)}
                    role="switch"
                    aria-checked={gates[g.key]}
                    aria-label={`${g.label} gate`}
                    className={`shrink-0 mt-0.5 w-10 h-5 rounded-full border transition-colors relative focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500 ${
                      gates[g.key] ? 'bg-emerald-500/20 border-emerald-500/60' : 'bg-neutral-800 border-neutral-700'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
                      gates[g.key] ? 'left-[1.35rem] bg-emerald-400' : 'left-0.5 bg-neutral-500'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {step === 'check' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-neutral-400">Confirms each integration has a working offline/loopback path.</p>
                <button
                  onClick={runChecks}
                  disabled={checking}
                  className="flex items-center gap-1 type-control border border-neutral-700 hover:border-neutral-500 text-neutral-300 px-2 py-1 rounded disabled:opacity-40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
                >
                  {checking ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3 h-3" aria-hidden="true" />}
                  Re-run
                </button>
              </div>
              <div className="space-y-1.5">
                {checks === null && checking && <p className="text-neutral-400">Running…</p>}
                {(checks ?? []).map((c) => (
                  <div key={c.name} className="flex items-center gap-2 border border-neutral-800 px-2 py-1.5">
                    {c.ok
                      ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                      : <CircleAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />}
                    <span className="text-neutral-300 w-24 shrink-0">{c.name}</span>
                    <span className="type-meta text-neutral-400 truncate">{c.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500/80 mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-neutral-300">
                  Setup complete. Drop a file into the left pane to ingest it, run Graph / KB search, and start chatting on the right.
                </p>
              </div>
              <div className="border-t border-neutral-900 pt-3">
                <div className="type-label uppercase tracking-wider text-neutral-400 mb-2">Docs &amp; help</div>
                <ul className="space-y-1 text-neutral-400">
                  <li>· <span className="text-neutral-200">User Guide</span> — ingestion, search, chat, audit (docs/USER_GUIDE.md)</li>
                  <li>· <span className="text-neutral-200">Admin Guide</span> — roles, policy, SSO, SIEM (docs/ADMIN_GUIDE.md)</li>
                  <li>· <span className="text-neutral-200">Troubleshooting</span> — common fixes (docs/TROUBLESHOOTING.md)</li>
                </ul>
                <p className="type-meta text-neutral-400 mt-2">Open Settings (Ctrl+,) any time to change models, keys, gates, and language.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-neutral-800">
          <button
            onClick={() => go(-1)}
            disabled={stepIdx === 0}
            className="flex items-center gap-1 type-control text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
          >
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back
          </button>

          <button
            onClick={onClose}
            className="type-meta font-mono text-neutral-400 hover:text-neutral-400 transition-colors"
          >
            {step === 'done' ? '' : 'Skip setup'}
          </button>

          {step === 'done' ? (
            <button
              onClick={onClose}
              className="flex items-center gap-1 type-control bg-emerald-500/10 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/20 px-3 py-1.5 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" /> Finish
            </button>
          ) : (
            <button
              onClick={() => go(1)}
              className="flex items-center gap-1 type-control bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-neutral-100 px-3 py-1.5 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
            >
              Next <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
