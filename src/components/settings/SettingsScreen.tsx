/**
 * Settings screen (Phase 10, Slice 10.5).
 *
 * One organized, full-screen place for everything that was previously scattered
 * across the stealth drawer: model routing, secrets, capability gates, tuning,
 * interface language (Slice 10.3), logs, and an About panel. The legacy stealth
 * drawer remains for power users; this screen is the discoverable front door.
 *
 * Accessibility (groundwork for Slice 10.2): the overlay is a labelled
 * `role="dialog"` with `aria-modal`, closes on Escape, moves focus to the close
 * button on open, and every control is a real focusable button/select.
 */
import { useEffect, useRef, type ComponentType } from 'react';
import {
  X, Cpu, KeyRound, ShieldCheck, SlidersHorizontal, Languages, ScrollText, Info,
} from 'lucide-react';
import { useApp } from '../../state/AppState';
import { useFocusTrap } from '../../lib/a11y';
import { useLang, useT } from '../../i18n';
import { SecretsPanel } from '../config/SecretsPanel';
import { SecurityGates } from '../config/SecurityGates';
import { SlidersStub } from '../config/SlidersStub';

const APP_VERSION = '0.0.0';

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-4 border-b border-neutral-900">
      <h3 className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-3">
        <Icon className="w-3 h-3 text-emerald-500/70" aria-hidden="true" />
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { lang, setLang, languages } = useLang();
  const {
    profiles, activeProfileId, setActiveProfileId, activeProfile, updateProfile,
    endpoints, activeEndpoint, setEndpointModel,
  } = useApp();

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Trap focus within the dialog, wire Escape, and restore focus on close.
  useFocusTrap(dialogRef, onClose);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  function openLogs() {
    if (!isTauri) return;
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('open_log_dir'))
      .catch(() => {});
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-neutral-950 border border-neutral-800 shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-5 py-4 bg-neutral-950/95 backdrop-blur-sm border-b border-neutral-800">
          <div>
            <h2 id="settings-title" className="text-sm font-mono font-bold tracking-widest text-neutral-100 uppercase">
              {t('settings.title')}
            </h2>
            <p className="text-[10px] font-mono text-neutral-500 mt-1">{t('settings.subtitle')}</p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label={t('common.close')}
            className="shrink-0 p-1.5 text-neutral-500 hover:text-neutral-200 border border-neutral-800 hover:border-neutral-600 rounded transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Models & routing */}
        <Section icon={Cpu} title={t('settings.section.models')}>
          <label className="block">
            <span className="text-[9px] font-mono uppercase tracking-wider text-neutral-500">{t('settings.models.preset')}</span>
            <select
              value={activeProfileId}
              onChange={(e) => setActiveProfileId(e.target.value)}
              className="mt-1 w-full bg-neutral-900 border border-neutral-800 text-neutral-300 text-[11px] font-mono p-1.5 outline-none focus:border-neutral-600"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[9px] font-mono uppercase tracking-wider text-neutral-500">{t('settings.models.endpoint')}</span>
            <select
              value={activeProfile.endpointId}
              onChange={(e) => updateProfile(activeProfile.id, { endpointId: e.target.value })}
              className="mt-1 w-full bg-neutral-900 border border-neutral-800 text-neutral-300 text-[11px] font-mono p-1.5 outline-none focus:border-neutral-600"
            >
              {endpoints.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label} {e.isLocal ? '· local' : '· cloud'}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[9px] font-mono uppercase tracking-wider text-neutral-500">{t('settings.models.model')}</span>
            {activeEndpoint.models && activeEndpoint.models.length > 0 ? (
              <select
                value={activeEndpoint.model}
                onChange={(e) => setEndpointModel(activeEndpoint.id, e.target.value)}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 text-neutral-300 text-[11px] font-mono p-1.5 outline-none focus:border-neutral-600"
              >
                {activeEndpoint.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <p className="mt-1 text-[10px] font-mono text-neutral-600 border border-neutral-800 p-2 leading-relaxed">
                {t('settings.models.noModels')}
              </p>
            )}
          </label>
        </Section>

        {/* Secrets */}
        <Section icon={KeyRound} title={t('settings.section.secrets')}>
          <SecretsPanel />
        </Section>

        {/* Capability gates */}
        <Section icon={ShieldCheck} title={t('settings.section.gates')}>
          <SecurityGates />
        </Section>

        {/* Tuning */}
        <Section icon={SlidersHorizontal} title={t('settings.section.tuning')}>
          <SlidersStub />
        </Section>

        {/* Language */}
        <Section icon={Languages} title={t('settings.section.language')}>
          <fieldset>
            <legend className="text-[9px] font-mono uppercase tracking-wider text-neutral-500 mb-2">
              {t('settings.language.label')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  aria-pressed={lang === l.code}
                  className={`px-3 py-1.5 text-[11px] font-mono border rounded transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500 ${
                    lang === l.code
                      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                      : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] font-mono text-neutral-600 mt-2">{t('settings.language.help')}</p>
          </fieldset>
        </Section>

        {/* Logs */}
        <Section icon={ScrollText} title={t('settings.section.logs')}>
          {isTauri ? (
            <div>
              <button
                onClick={openLogs}
                className="text-[11px] font-mono text-neutral-300 hover:text-neutral-100 border border-neutral-700 hover:border-neutral-500 px-3 py-1.5 rounded transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
              >
                {t('settings.logs.view')}
              </button>
              <p className="text-[10px] font-mono text-neutral-600 mt-2">{t('settings.logs.help')}</p>
            </div>
          ) : (
            <p className="text-[10px] font-mono text-neutral-600">{t('settings.logs.desktopOnly')}</p>
          )}
        </Section>

        {/* Help & docs (Phase 12, Slice 12.5) */}
        <Section icon={Info} title="Help & docs">
          <ul className="text-[11px] font-mono text-neutral-400 space-y-1.5">
            <li><span className="text-neutral-200">User Guide</span> — ingest, search, chat, tools, audit <span className="text-neutral-600">· docs/USER_GUIDE.md</span></li>
            <li><span className="text-neutral-200">Admin Guide</span> — roles, policy, SSO, SIEM, audit <span className="text-neutral-600">· docs/ADMIN_GUIDE.md</span></li>
            <li><span className="text-neutral-200">Troubleshooting</span> — common fixes <span className="text-neutral-600">· docs/TROUBLESHOOTING.md</span></li>
          </ul>
          <p className="text-[10px] font-mono text-neutral-600">Full guides ship in the docs/ folder. Use Logs (above) for diagnostics.</p>
        </Section>

        {/* About */}
        <Section icon={Info} title={t('settings.section.about')}>
          <div className="text-[11px] font-mono text-neutral-300">
            <span className="text-neutral-100 font-bold tracking-widest">{t('app.name')}</span>
            <span className="text-neutral-600"> · {t('settings.about.version')} {APP_VERSION}</span>
          </div>
          <p className="text-[10px] font-mono text-neutral-500 leading-relaxed">{t('settings.about.desc')}</p>
        </Section>
      </div>
    </div>
  );
}
