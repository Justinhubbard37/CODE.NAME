import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Pencil, Wrench } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { buildNormalProviderMenu, type SettingsView } from '../../config/runtimeProviders';
import {
  executionClassLabel,
  isModelSelectable,
  modelAvailabilityLabel,
  providerStatusLabel,
} from '../../lib/llm';

const STATUS_CLASS: Record<string, string> = {
  ready: 'text-emerald-300 border-emerald-500/50 bg-emerald-500/10',
  available: 'text-emerald-300 border-emerald-500/50 bg-emerald-500/10',
  requires_api_key: 'text-amber-300 border-amber-500/50 bg-amber-500/10',
  requires_sign_in: 'text-amber-300 border-amber-500/50 bg-amber-500/10',
  server_offline: 'text-red-300 border-red-500/50 bg-red-500/10',
  unavailable: 'text-red-300 border-red-500/50 bg-red-500/10',
  unknown: 'text-neutral-300 border-neutral-700 bg-neutral-800/40',
  configuring: 'text-amber-300 border-amber-500/50 bg-amber-500/10',
};

function openSettings(view: SettingsView) {
  window.dispatchEvent(new CustomEvent('codename:open-settings', { detail: { view } }));
}

export function StatusModule() {
  const {
    endpoints,
    activeEndpoint,
    activeModel,
    activeProfile,
    setActiveProvider,
    setActiveModel,
  } = useApp();
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const providerMenu = buildNormalProviderMenu(endpoints);

  useEffect(() => {
    if (!providerOpen && !modelOpen) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setProviderOpen(false);
        setModelOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProviderOpen(false);
        setModelOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [providerOpen, modelOpen]);

  const providerClass = STATUS_CLASS[activeEndpoint.status] ?? STATUS_CLASS.unknown;
  const modelLabel = activeModel?.displayName ?? (activeProfile.modelId || 'Select model');
  const modelState = activeModel ? modelAvailabilityLabel(activeModel.availability) : 'Unavailable';

  return (
    <div ref={ref} className="relative flex items-center gap-1 font-mono type-control">
      <div className="relative">
        <button
          onClick={() => {
            setModelOpen((open) => !open);
            setProviderOpen(false);
          }}
          className="flex items-center gap-1.5 max-w-[220px] px-2 py-1 border border-neutral-700 bg-neutral-900/70 text-neutral-300 hover:border-neutral-500 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
          aria-haspopup="menu"
          aria-expanded={modelOpen}
          title={`${modelLabel} · ${modelState}`}
        >
          <span className="truncate">{modelLabel}</span>
          <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
        </button>
        {modelOpen && (
          <div role="menu" aria-label="Model selector" className="absolute top-8 right-0 z-50 w-80 bg-neutral-900 border border-neutral-700 shadow-2xl p-1">
            <div className="px-2 py-1 type-label text-neutral-400 uppercase tracking-wider border-b border-neutral-800">
              {activeEndpoint.label} models
            </div>
            {activeModel && !activeEndpoint.models.some((model) => model.id === activeModel.id) && (
              <div className="px-2 py-1.5 border-b border-neutral-800 text-red-300">
                <div className="truncate">{activeModel.displayName}</div>
                <div className="type-meta text-red-300/80">Unavailable · select an available model</div>
              </div>
            )}
            {activeEndpoint.models.length === 0 ? (
              <div className="px-2 py-2 type-meta text-neutral-400">
                No models available. Refresh inventory in Provider Manager.
              </div>
            ) : (
              activeEndpoint.models.map((model) => {
                const selected = model.id === activeProfile.modelId;
                const selectable = isModelSelectable(model);
                return (
                  <button
                    key={model.id}
                    onClick={() => {
                      if (!selectable) return;
                      setActiveModel(model.id);
                      setModelOpen(false);
                    }}
                    disabled={!selectable}
                    role="menuitemradio"
                    aria-checked={selected}
                    className={`w-full text-left px-2 py-1.5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500 ${
                      selected ? 'bg-neutral-800 text-emerald-300' : 'text-neutral-300 hover:bg-neutral-800'
                    } disabled:text-neutral-500 disabled:hover:bg-transparent`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{model.displayName}</span>
                      <span className="type-meta text-neutral-400 shrink-0">{executionClassLabel(model.executionClass)}</span>
                    </div>
                    <div className="type-meta text-neutral-400 truncate">
                      {modelAvailabilityLabel(model.availability)}
                      {model.inputTokenLimit ? ` · ${Math.round(model.inputTokenLimit / 1000)}K input` : ''}
                      {model.thinkingSupported ? ' · thinking' : ''}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => {
            setProviderOpen((open) => !open);
            setModelOpen(false);
          }}
          className={`flex items-center gap-1.5 max-w-[220px] px-2 py-1 border rounded-full transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500 ${providerClass}`}
          aria-haspopup="menu"
          aria-expanded={providerOpen}
          title={`${activeEndpoint.label} · ${providerStatusLabel(activeEndpoint.status)}`}
        >
          <span className="truncate">{activeEndpoint.label}</span>
          <span className="type-meta text-neutral-400">{providerStatusLabel(activeEndpoint.status)}</span>
          <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
        </button>
        {providerOpen && (
          <div role="menu" aria-label="Provider selector" className="absolute top-8 right-0 z-50 w-80 bg-neutral-900 border border-neutral-700 shadow-2xl p-1">
            <div className="px-2 py-1 type-label text-neutral-400 uppercase tracking-wider border-b border-neutral-800">
              Providers
            </div>
            {providerMenu.map((item) => {
              if (item.type === 'divider') {
                return <div key={item.id} role="separator" className="my-1 border-t border-neutral-800" />;
              }
              if (item.type === 'action') {
                const Icon = item.id === 'setup-sidecar' ? Wrench : Pencil;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setProviderOpen(false);
                      openSettings(item.target);
                    }}
                    role="menuitem"
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
                  >
                    <Icon className="w-3 h-3" aria-hidden="true" />
                    {item.label}
                  </button>
                );
              }
              const provider = item.provider;
              const active = provider.id === activeEndpoint.id;
              return (
                <button
                  key={provider.id}
                  onClick={async () => {
                    await setActiveProvider(provider.id);
                    setProviderOpen(false);
                  }}
                  role="menuitemradio"
                  aria-checked={active}
                  className={`w-full text-left px-2 py-1.5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500 ${
                    active ? 'bg-neutral-800 text-emerald-300' : 'text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{provider.label}</span>
                    <span className="type-meta text-neutral-400">{providerStatusLabel(provider.status)}</span>
                  </div>
                  <div className="type-meta text-neutral-400 truncate">{provider.detail ?? 'No inventory refresh yet.'}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
