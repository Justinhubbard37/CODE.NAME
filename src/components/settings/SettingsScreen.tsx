import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  X,
  Cpu,
  KeyRound,
  ShieldCheck,
  SlidersHorizontal,
  Languages,
  ScrollText,
  Info,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { useApp } from '../../state/AppState';
import { useFocusTrap } from '../../lib/a11y';
import { useLang, useT } from '../../i18n';
import { SecretsPanel } from '../config/SecretsPanel';
import { SecurityGates } from '../config/SecurityGates';
import {
  executionClassLabel,
  modelAvailabilityLabel,
  providerStatusLabel,
} from '../../lib/llm';
import { getSidecarInfo, restartSidecar, type SidecarInfo } from '../../lib/sidecar';

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
      <h3 className="flex items-center gap-2 type-section font-mono uppercase tracking-widest text-neutral-400 mb-3">
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
    profiles,
    activeProfileId,
    setActiveProfileId,
    activeProfile,
    updateProfile,
    endpoints,
    activeEndpoint,
    updateProviderConnection,
    refreshProviderModels,
  } = useApp();

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [refreshingProviderId, setRefreshingProviderId] = useState('');
  const [sidecarInfo, setSidecarInfo] = useState<SidecarInfo | null>(null);
  const [sidecarMessage, setSidecarMessage] = useState('');

  useFocusTrap(dialogRef, onClose);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  async function refreshProvider(providerId: string) {
    setRefreshingProviderId(providerId);
    try {
      await refreshProviderModels(providerId);
    } finally {
      setRefreshingProviderId('');
    }
  }

  async function checkSidecar() {
    const info = await getSidecarInfo();
    setSidecarInfo(info);
    setSidecarMessage(info ? `Sidecar ${info.status}` : 'Sidecar unavailable in this runtime.');
  }

  async function restartAndCheckSidecar() {
    const info = await restartSidecar();
    setSidecarInfo(info);
    setSidecarMessage(info ? `Sidecar ${info.status}` : 'Sidecar restart unavailable.');
  }

  function openLogs() {
    if (!isTauri) return;
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('open_log_dir'))
      .catch(() => {});
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto bg-neutral-950 border border-neutral-800 shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-5 py-4 bg-neutral-950/95 backdrop-blur-sm border-b border-neutral-800">
          <div>
            <h2 id="settings-title" className="type-heading font-mono tracking-widest text-neutral-100 uppercase">
              {t('settings.title')}
            </h2>
            <p className="type-meta font-mono text-neutral-400 mt-1">{t('settings.subtitle')}</p>
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

        <Section icon={Cpu} title="Provider Manager">
          <label className="block">
            <span className="type-label font-mono uppercase tracking-wider text-neutral-400">Runtime Profile</span>
            <select
              value={activeProfileId}
              onChange={(event) => setActiveProfileId(event.target.value)}
              className="mt-1 w-full bg-neutral-900 border border-neutral-800 text-neutral-300 type-control font-mono p-1.5 outline-none focus:border-neutral-600"
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.label}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="block">
              <span className="type-label font-mono uppercase tracking-wider text-neutral-400">Profile Label</span>
              <input
                value={activeProfile.label}
                onChange={(event) => updateProfile(activeProfile.id, { label: event.target.value })}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 text-neutral-300 type-control font-mono p-1.5 outline-none focus:border-neutral-600"
              />
            </label>
            <label className="block">
              <span className="type-label font-mono uppercase tracking-wider text-neutral-400">Default Temp</span>
              <input
                type="number"
                min={0}
                max={2}
                step={0.05}
                value={activeProfile.defaultTemperature}
                onChange={(event) =>
                  updateProfile(activeProfile.id, { defaultTemperature: Number(event.target.value) })
                }
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 text-neutral-300 type-control font-mono p-1.5 outline-none focus:border-neutral-600"
              />
            </label>
            <label className="block">
              <span className="type-label font-mono uppercase tracking-wider text-neutral-400">Default Context</span>
              <input
                type="number"
                min={512}
                step={512}
                value={activeProfile.defaultContextWindow}
                onChange={(event) =>
                  updateProfile(activeProfile.id, { defaultContextWindow: Number(event.target.value) })
                }
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 text-neutral-300 type-control font-mono p-1.5 outline-none focus:border-neutral-600"
              />
            </label>
          </div>

          <div className="space-y-2">
            {endpoints.map((provider) => {
              const active = provider.id === activeEndpoint.id;
              const refreshing = refreshingProviderId === provider.id;
              return (
                <div key={provider.id} className={`border p-3 ${active ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-neutral-800 bg-neutral-950'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="type-body-strong font-mono text-neutral-200">
                        {provider.label}
                        {active && <span className="ml-2 type-meta text-emerald-400">active profile provider</span>}
                      </div>
                      <div className="type-meta font-mono text-neutral-400">
                        {providerStatusLabel(provider.status)} · {provider.detail ?? 'No inventory refresh yet.'}
                      </div>
                    </div>
                    <button
                      onClick={() => refreshProvider(provider.id)}
                      disabled={refreshing}
                      className="shrink-0 flex items-center gap-1 type-control font-mono border border-neutral-700 text-neutral-300 hover:border-neutral-500 px-2 py-1 disabled:opacity-40"
                    >
                      <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                      Refresh
                    </button>
                  </div>

                  <label className="block mt-2">
                    <span className="type-label font-mono uppercase tracking-wider text-neutral-400">Base URL</span>
                    <input
                      value={provider.baseUrl}
                      readOnly={!provider.userEditable}
                      onChange={(event) => updateProviderConnection(provider.id, { baseUrl: event.target.value })}
                      className="mt-1 w-full bg-neutral-900 border border-neutral-800 text-neutral-300 type-control font-mono p-1.5 outline-none focus:border-neutral-600 read-only:text-neutral-500"
                    />
                  </label>

                  <div className="mt-2 border border-neutral-900">
                    {provider.models.length === 0 ? (
                      <div className="px-2 py-2 type-meta font-mono text-neutral-400">No compatible models in inventory.</div>
                    ) : (
                      provider.models.map((model) => (
                        <div key={model.id} className="flex items-center justify-between gap-2 px-2 py-1 border-b border-neutral-900 last:border-b-0 type-meta font-mono">
                          <span className="truncate text-neutral-300">{model.displayName}</span>
                          <span className="shrink-0 text-neutral-400">
                            {executionClassLabel(model.executionClass)} · {modelAvailabilityLabel(model.availability)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section icon={KeyRound} title={t('settings.section.secrets')}>
          <SecretsPanel />
        </Section>

        <Section icon={Wrench} title="Agent Sidecar Setup">
          <div className="border border-neutral-800 bg-neutral-950 p-3 type-body font-mono text-neutral-300">
            <div>Readiness: <span className="text-neutral-100">{sidecarInfo?.status ?? 'unknown'}</span></div>
            <div className="type-meta text-neutral-400">
              Connection: {sidecarInfo ? `${sidecarInfo.host}:${sidecarInfo.port}` : 'not checked'}
            </div>
            {sidecarMessage && <div className="mt-2 type-meta text-neutral-400">{sidecarMessage}</div>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={checkSidecar}
                className="type-control font-mono border border-neutral-700 text-neutral-300 hover:border-neutral-500 px-2 py-1"
              >
                Check Connection
              </button>
              <button
                onClick={restartAndCheckSidecar}
                className="type-control font-mono border border-neutral-700 text-neutral-300 hover:border-neutral-500 px-2 py-1"
              >
                Restart Sidecar
              </button>
            </div>
          </div>
        </Section>

        <Section icon={ShieldCheck} title={t('settings.section.gates')}>
          <SecurityGates />
        </Section>

        <Section icon={SlidersHorizontal} title="Runtime Defaults">
          <p className="type-meta font-mono text-neutral-400">
            Persistent provider/profile defaults are edited above. The bottom-left Parameter Tray applies per-chat temporary overrides.
          </p>
        </Section>

        <Section icon={Languages} title={t('settings.section.language')}>
          <fieldset>
            <legend className="type-label font-mono uppercase tracking-wider text-neutral-400 mb-2">
              {t('settings.language.label')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  aria-pressed={lang === l.code}
                  className={`px-3 py-1.5 type-control font-mono border rounded transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500 ${
                    lang === l.code
                      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                      : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="type-meta font-mono text-neutral-400 mt-2">{t('settings.language.help')}</p>
          </fieldset>
        </Section>

        <Section icon={ScrollText} title={t('settings.section.logs')}>
          {isTauri ? (
            <div>
              <button
                onClick={openLogs}
                className="type-control font-mono text-neutral-300 hover:text-neutral-100 border border-neutral-700 hover:border-neutral-500 px-3 py-1.5 rounded transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
              >
                {t('settings.logs.view')}
              </button>
              <p className="type-meta font-mono text-neutral-400 mt-2">{t('settings.logs.help')}</p>
            </div>
          ) : (
            <p className="type-meta font-mono text-neutral-400">{t('settings.logs.desktopOnly')}</p>
          )}
        </Section>

        <Section icon={Info} title="Help & docs">
          <ul className="type-body font-mono text-neutral-400 space-y-1.5">
            <li><span className="text-neutral-200">User Guide</span> · docs/USER_GUIDE.md</li>
            <li><span className="text-neutral-200">Admin Guide</span> · docs/ADMIN_GUIDE.md</li>
            <li><span className="text-neutral-200">Troubleshooting</span> · docs/TROUBLESHOOTING.md</li>
          </ul>
        </Section>

        <Section icon={Info} title={t('settings.section.about')}>
          <div className="type-body-strong font-mono text-neutral-300">
            <span className="text-neutral-100 font-bold tracking-widest">{t('app.name')}</span>
            <span className="text-neutral-400"> · {t('settings.about.version')} {APP_VERSION}</span>
          </div>
          <p className="type-body font-mono text-neutral-400">{t('settings.about.desc')}</p>
        </Section>
      </div>
    </div>
  );
}
