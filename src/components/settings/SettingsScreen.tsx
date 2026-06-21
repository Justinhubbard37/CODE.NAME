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
  approveProviderConnection,
  clearProviderCredential,
  createProviderConnection,
  deleteProviderConnection,
  disableProviderConnection,
  editProviderConnection,
  executionClassLabel,
  modelAvailabilityLabel,
  providerStatusLabel,
  storeProviderCredential,
} from '../../lib/llm';
import { getSidecarInfo, restartSidecar, type SidecarInfo } from '../../lib/sidecar';
import {
  configuredSidecarEndpoint,
  sidecarCheckResult,
  type SidecarCheckResult,
} from '../../config/sidecarSetup';
import { type SettingsView } from '../../config/runtimeProviders';
import type { ProviderConnection } from '../../types';

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

export function SettingsScreen({
  onClose,
  view = 'settings',
}: {
  onClose: () => void;
  view?: SettingsView;
}) {
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
    setActiveProvider,
    reloadProviderRuntimeState,
    checkProviderConnectionStatus,
    refreshProviderModels,
  } = useApp();

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [busyProviderId, setBusyProviderId] = useState('');
  const [providerOperationError, setProviderOperationError] = useState('');
  const [customDraft, setCustomDraft] = useState({ label: 'Custom OpenAI-compatible', endpoint: '' });
  const [editDrafts, setEditDrafts] = useState<Record<string, { label: string; endpoint: string }>>({});
  const [credentialDrafts, setCredentialDrafts] = useState<Record<string, string>>({});
  const [sidecarInfo, setSidecarInfo] = useState<SidecarInfo | null>(null);
  const [sidecarResult, setSidecarResult] = useState<SidecarCheckResult | null>(null);
  const managedProviders = endpoints;
  const title =
    view === 'sidecar-setup'
      ? 'Agent Sidecar Setup'
      : view === 'provider-manager'
        ? 'Provider Manager'
        : t('settings.title');
  const subtitle =
    view === 'sidecar-setup'
      ? 'Configure and verify Sidecar connectivity.'
      : view === 'provider-manager'
        ? 'Manage Ollama, LM Studio, Custom OpenAI-compatible, and Gemini.'
        : t('settings.subtitle');
  const showProviderManager = view !== 'sidecar-setup';
  const showSidecarSetup = view === 'sidecar-setup' || view === 'settings';
  const showGeneralSettings = view === 'settings';

  useFocusTrap(dialogRef, onClose);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  function providerKey(provider: ProviderConnection): string {
    return provider.connectionId ?? provider.id;
  }

  function providerCanUseCredential(provider: ProviderConnection): boolean {
    return provider.requiresSecret || provider.secretRequirement === 'keychain';
  }

  function providerCanEditEndpoint(provider: ProviderConnection): boolean {
    return provider.providerKind !== 'gemini' && !!provider.connectionId;
  }

  function providerCanDelete(provider: ProviderConnection): boolean {
    return provider.providerKind === 'openai-compatible' && provider.id !== 'custom-openai';
  }

  function providerDraft(provider: ProviderConnection): { label: string; endpoint: string } {
    const key = providerKey(provider);
    return editDrafts[key] ?? {
      label: provider.label,
      endpoint: provider.displayEndpoint ?? '',
    };
  }

  function setProviderDraft(provider: ProviderConnection, patch: Partial<{ label: string; endpoint: string }>) {
    const key = providerKey(provider);
    setEditDrafts((drafts) => ({
      ...drafts,
      [key]: { ...providerDraft(provider), ...patch },
    }));
  }

  async function runProviderAction(providerId: string, action: () => Promise<void>, afterSuccess?: () => void) {
    if (busyProviderId) return;
    setBusyProviderId(providerId);
    setProviderOperationError('');
    try {
      await action();
      await reloadProviderRuntimeState();
      afterSuccess?.();
    } catch (err) {
      setProviderOperationError(err instanceof Error ? err.message : 'Provider operation failed.');
    } finally {
      setBusyProviderId('');
    }
  }

  async function refreshProvider(providerId: string) {
    await runProviderAction(providerId, () => refreshProviderModels(providerId));
  }

  async function checkProvider(providerId: string) {
    await runProviderAction(providerId, () => checkProviderConnectionStatus(providerId));
  }

  async function createCustomProviderConnection() {
    await runProviderAction(
      'custom-openai:create',
      () => createProviderConnection({
        providerId: 'custom-openai',
        label: customDraft.label,
        endpoint: customDraft.endpoint,
      }),
      () => setCustomDraft({ label: 'Custom OpenAI-compatible', endpoint: '' }),
    );
  }

  async function saveProviderConnection(provider: ProviderConnection) {
    const draft = providerDraft(provider);
    await runProviderAction(providerKey(provider), () =>
      editProviderConnection(provider, {
        label: draft.label,
        endpoint: providerCanEditEndpoint(provider) ? draft.endpoint : undefined,
      }),
    );
  }

  async function storeCredential(provider: ProviderConnection) {
    const key = providerKey(provider);
    const value = credentialDrafts[key] ?? '';
    await runProviderAction(
      key,
      () => storeProviderCredential(provider, value),
      () => {},
    ).finally(() => {
      setCredentialDrafts((drafts) => ({ ...drafts, [key]: '' }));
    });
  }

  async function clearCredential(provider: ProviderConnection) {
    const key = providerKey(provider);
    await runProviderAction(
      key,
      () => clearProviderCredential(provider),
      () => {},
    ).finally(() => {
      setCredentialDrafts((drafts) => ({ ...drafts, [key]: '' }));
    });
  }

  async function checkSidecar() {
    const info = await getSidecarInfo();
    setSidecarInfo(info);
    setSidecarResult(sidecarCheckResult(info));
  }

  async function restartAndCheckSidecar() {
    const info = await restartSidecar();
    setSidecarInfo(info);
    setSidecarResult(sidecarCheckResult(info));
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
              {title}
            </h2>
            <p className="type-meta font-mono text-neutral-400 mt-1">{subtitle}</p>
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

        {showProviderManager && <Section icon={Cpu} title="Provider Manager">
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

          {providerOperationError && (
            <div className="border border-red-500/40 bg-red-500/10 text-red-200 type-meta font-mono px-3 py-2">
              {providerOperationError}
            </div>
          )}

          <div className="border border-neutral-800 bg-neutral-950 p-3 space-y-2">
            <div className="type-body-strong font-mono text-neutral-200">Create Custom OpenAI-compatible connection</div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_auto] gap-2">
              <input
                value={customDraft.label}
                onChange={(event) => setCustomDraft((draft) => ({ ...draft, label: event.target.value }))}
                placeholder="Label"
                className="bg-neutral-900 border border-neutral-800 text-neutral-300 type-control font-mono p-1.5 outline-none focus:border-neutral-600"
              />
              <input
                value={customDraft.endpoint}
                onChange={(event) => setCustomDraft((draft) => ({ ...draft, endpoint: event.target.value }))}
                placeholder="https://api.example.com/v1"
                className="bg-neutral-900 border border-neutral-800 text-neutral-300 type-control font-mono p-1.5 outline-none focus:border-neutral-600"
              />
              <button
                onClick={createCustomProviderConnection}
                disabled={!!busyProviderId || !customDraft.endpoint.trim()}
                className="type-control font-mono border border-neutral-700 text-neutral-300 hover:border-neutral-500 px-2 py-1 disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {managedProviders.map((provider) => {
              const active = provider.id === activeEndpoint.id;
              const key = providerKey(provider);
              const busy = busyProviderId === key || busyProviderId === provider.id;
              const draft = providerDraft(provider);
              const hasConnection = !!provider.connectionId;
              const canEditEndpoint = providerCanEditEndpoint(provider);
              const hasCredentialControl = providerCanUseCredential(provider);
              const credentialDraft = credentialDrafts[key] ?? '';
              return (
                <div key={key} className={`border p-3 ${active ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-neutral-800 bg-neutral-950'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="type-body-strong font-mono text-neutral-200">
                        {provider.label}
                        {active && <span className="ml-2 type-meta text-emerald-400">active profile provider</span>}
                      </div>
                      <div className="type-meta font-mono text-neutral-400">
                        {providerStatusLabel(provider.status)} · {provider.detail ?? 'No inventory refresh yet.'}
                      </div>
                      <div className="type-meta font-mono text-neutral-500">
                        {provider.connectionId ?? 'No Rust connection record'} Â· {provider.approvalState ?? 'unapproved'}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => setActiveProvider(provider.id)}
                        disabled={!hasConnection || !!busyProviderId}
                        className="type-control font-mono border border-neutral-700 text-neutral-300 hover:border-neutral-500 px-2 py-1 disabled:opacity-40"
                      >
                        Use
                      </button>
                      <button
                        onClick={() => checkProvider(provider.id)}
                        disabled={!hasConnection || busy || provider.checkInProgress || provider.refreshInProgress}
                        className="flex items-center gap-1 type-control font-mono border border-neutral-700 text-neutral-300 hover:border-neutral-500 px-2 py-1 disabled:opacity-40"
                      >
                        <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                        Check
                      </button>
                      <button
                        onClick={() => refreshProvider(provider.id)}
                        disabled={!hasConnection || busy || provider.checkInProgress || provider.refreshInProgress}
                        className="flex items-center gap-1 type-control font-mono border border-neutral-700 text-neutral-300 hover:border-neutral-500 px-2 py-1 disabled:opacity-40"
                      >
                        <RefreshCw className={`w-3 h-3 ${busy || provider.refreshInProgress ? 'animate-spin' : ''}`} aria-hidden="true" />
                        Refresh
                      </button>
                    </div>
                  </div>

                  {hasConnection ? (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_auto] gap-2">
                      <label className="block">
                        <span className="type-label font-mono uppercase tracking-wider text-neutral-400">Label</span>
                        <input
                          value={draft.label}
                          onChange={(event) => setProviderDraft(provider, { label: event.target.value })}
                          className="mt-1 w-full bg-neutral-900 border border-neutral-800 text-neutral-300 type-control font-mono p-1.5 outline-none focus:border-neutral-600"
                        />
                      </label>
                      <label className="block">
                        <span className="type-label font-mono uppercase tracking-wider text-neutral-400">Configured endpoint</span>
                        <input
                          value={draft.endpoint}
                          onChange={(event) => setProviderDraft(provider, { endpoint: event.target.value })}
                          readOnly={!canEditEndpoint}
                          className="mt-1 w-full bg-neutral-900 border border-neutral-800 text-neutral-300 type-control font-mono p-1.5 outline-none focus:border-neutral-600 read-only:text-neutral-500"
                        />
                      </label>
                      <div className="flex items-end gap-2">
                        <button
                          onClick={() => saveProviderConnection(provider)}
                          disabled={busy || !draft.label.trim() || (canEditEndpoint && !draft.endpoint.trim())}
                          className="type-control font-mono border border-neutral-700 text-neutral-300 hover:border-neutral-500 px-2 py-1 disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => runProviderAction(key, () => approveProviderConnection(provider))}
                          disabled={busy || provider.approvalState === 'approved'}
                          className="type-control font-mono border border-neutral-700 text-neutral-300 hover:border-neutral-500 px-2 py-1 disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => runProviderAction(key, () => disableProviderConnection(provider))}
                          disabled={busy || provider.approvalState === 'disabled'}
                          className="type-control font-mono border border-neutral-700 text-neutral-300 hover:border-neutral-500 px-2 py-1 disabled:opacity-40"
                        >
                          Disable
                        </button>
                        {providerCanDelete(provider) && (
                          <button
                            onClick={() => runProviderAction(key, () => deleteProviderConnection(provider))}
                            disabled={busy}
                            className="type-control font-mono border border-red-500/50 text-red-200 hover:border-red-400 px-2 py-1 disabled:opacity-40"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 border border-neutral-900 px-2 py-2 type-meta font-mono text-neutral-400">
                      No Rust-owned connection exists. Create a Custom OpenAI-compatible connection above.
                    </div>
                  )}

                  {hasCredentialControl && hasConnection && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 border border-neutral-900 p-2">
                      <label className="block">
                        <span className="type-label font-mono uppercase tracking-wider text-neutral-400">
                          Credential {provider.credentialConfigured ? 'configured' : 'not configured'}
                        </span>
                        <input
                          type="password"
                          value={credentialDraft}
                          onChange={(event) => setCredentialDrafts((drafts) => ({ ...drafts, [key]: event.target.value }))}
                          placeholder="Enter credential"
                          className="mt-1 w-full bg-neutral-900 border border-neutral-800 text-neutral-300 type-control font-mono p-1.5 outline-none focus:border-neutral-600"
                        />
                      </label>
                      <button
                        onClick={() => storeCredential(provider)}
                        disabled={busy || !credentialDraft}
                        className="self-end type-control font-mono border border-neutral-700 text-neutral-300 hover:border-neutral-500 px-2 py-1 disabled:opacity-40"
                      >
                        Save Credential
                      </button>
                      <button
                        onClick={() => clearCredential(provider)}
                        disabled={busy || !provider.credentialConfigured}
                        className="self-end type-control font-mono border border-neutral-700 text-neutral-300 hover:border-neutral-500 px-2 py-1 disabled:opacity-40"
                      >
                        Clear
                      </button>
                    </div>
                  )}

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
        </Section>}

        {showProviderManager && <Section icon={KeyRound} title={t('settings.section.secrets')}>
          <SecretsPanel />
        </Section>}

        {showSidecarSetup && <Section icon={Wrench} title="Agent Sidecar Setup">
          <div className="border border-neutral-800 bg-neutral-950 p-3 type-body font-mono text-neutral-300">
            <div>Configured endpoint: <span className="text-neutral-100">{configuredSidecarEndpoint()}</span></div>
            <div>Readiness: <span className="text-neutral-100">{sidecarInfo?.status ?? 'unknown'}</span></div>
            <div className="type-meta text-neutral-400">
              Connection: {sidecarInfo ? `${sidecarInfo.host}:${sidecarInfo.port}` : 'not checked'}
            </div>
            {sidecarResult && (
              <div className={`mt-2 type-meta ${
                sidecarResult.kind === 'success'
                  ? 'text-emerald-300'
                  : sidecarResult.kind === 'failed'
                    ? 'text-red-300'
                    : 'text-amber-300'
              }`}>
                {sidecarResult.message}
              </div>
            )}
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
              <button
                onClick={onClose}
                className="type-control font-mono border border-neutral-700 text-neutral-300 hover:border-neutral-500 px-2 py-1"
              >
                Close
              </button>
            </div>
          </div>
        </Section>}

        {showGeneralSettings && <Section icon={ShieldCheck} title={t('settings.section.gates')}>
          <SecurityGates />
        </Section>}

        {showProviderManager && <Section icon={SlidersHorizontal} title="Runtime Defaults">
          <p className="type-meta font-mono text-neutral-400">
            Persistent provider/profile defaults are edited above. The bottom-left Parameter Tray applies per-chat temporary overrides.
          </p>
        </Section>}

        {showGeneralSettings && <Section icon={Languages} title={t('settings.section.language')}>
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
        </Section>}

        {showGeneralSettings && <Section icon={ScrollText} title={t('settings.section.logs')}>
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
        </Section>}

        {showGeneralSettings && <Section icon={Info} title="Help & docs">
          <ul className="type-body font-mono text-neutral-400 space-y-1.5">
            <li><span className="text-neutral-200">User Guide</span> · docs/USER_GUIDE.md</li>
            <li><span className="text-neutral-200">Admin Guide</span> · docs/ADMIN_GUIDE.md</li>
            <li><span className="text-neutral-200">Troubleshooting</span> · docs/TROUBLESHOOTING.md</li>
          </ul>
        </Section>}

        {showGeneralSettings && <Section icon={Info} title={t('settings.section.about')}>
          <div className="type-body-strong font-mono text-neutral-300">
            <span className="text-neutral-100 font-bold tracking-widest">{t('app.name')}</span>
            <span className="text-neutral-400"> · {t('settings.about.version')} {APP_VERSION}</span>
          </div>
          <p className="type-body font-mono text-neutral-400">{t('settings.about.desc')}</p>
        </Section>}
      </div>
    </div>
  );
}
