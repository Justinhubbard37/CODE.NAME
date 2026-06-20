import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Pencil, Wrench } from 'lucide-react';
import { useApp } from '../../state/AppState';
import { buildNormalProviderMenu, type SettingsView } from '../../config/runtimeProviders';
import {
  calculateModelMenuLayout,
  modelMenuItems,
  type ModelMenuLayout,
} from '../runtimeControlLayout';
import {
  executionClassLabel,
  isModelSelectable,
  modelAvailabilityLabel,
  providerStatusLabel,
} from '../../lib/llm';
import type { ModelInventoryEntry } from '../../types';

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
  const [modelMenuLayout, setModelMenuLayout] = useState<ModelMenuLayout | null>(null);
  const [focusedModelIndex, setFocusedModelIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const providerMenu = buildNormalProviderMenu(endpoints);
  const modelMenuModels = useMemo(() => modelMenuItems(activeEndpoint.models), [activeEndpoint.models]);

  useEffect(() => {
    if (!providerOpen && !modelOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || modelMenuRef.current?.contains(target)) return;
      if (ref.current || modelMenuRef.current) {
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

  useLayoutEffect(() => {
    if (!modelOpen) return;
    const updateLayout = () => {
      if (typeof window === 'undefined') return;
      const rect = modelTriggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setModelMenuLayout(calculateModelMenuLayout(
        { left: rect.left, right: rect.right, bottom: rect.bottom },
        {
          width: window.visualViewport?.width ?? window.innerWidth,
          height: window.visualViewport?.height ?? window.innerHeight,
        },
      ));
    };
    updateLayout();
    window.addEventListener('resize', updateLayout);
    window.addEventListener('scroll', updateLayout, true);
    return () => {
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('scroll', updateLayout, true);
    };
  }, [modelOpen]);

  useEffect(() => {
    if (!modelOpen) {
      setModelMenuLayout(null);
      return;
    }
    const selectedIndex = modelMenuModels.findIndex(
      (model) => model.id === activeProfile.modelId && isModelSelectable(model),
    );
    const firstSelectableIndex = modelMenuModels.findIndex(isModelSelectable);
    setFocusedModelIndex(selectedIndex >= 0 ? selectedIndex : Math.max(0, firstSelectableIndex));
  }, [activeEndpoint.id, activeEndpoint.models, activeProfile.modelId, modelMenuModels, modelOpen]);

  useEffect(() => {
    if (!modelOpen || !modelMenuLayout) return;
    modelItemRefs.current[focusedModelIndex]?.focus();
  }, [focusedModelIndex, modelMenuLayout, modelOpen]);

  const providerClass = STATUS_CLASS[activeEndpoint.status] ?? STATUS_CLASS.unknown;
  const modelLabel = activeModel?.displayName ?? (activeProfile.modelId || 'Select model');
  const modelState = activeModel ? modelAvailabilityLabel(activeModel.availability) : 'Unavailable';

  function selectableModelIndices() {
    return modelMenuModels.reduce<number[]>((indices, model, index) => {
      if (isModelSelectable(model)) indices.push(index);
      return indices;
    }, []);
  }

  function focusModelAtPosition(position: number) {
    const indices = selectableModelIndices();
    if (indices.length === 0) return;
    const bounded = Math.min(Math.max(position, 0), indices.length - 1);
    setFocusedModelIndex(indices[bounded]);
  }

  function selectModel(model: ModelInventoryEntry) {
    if (!isModelSelectable(model)) return;
    setActiveModel(model.id);
    setModelOpen(false);
  }

  function handleModelMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const indices = selectableModelIndices();
    if (indices.length === 0) return;
    const currentPosition = indices.includes(focusedModelIndex)
      ? indices.indexOf(focusedModelIndex)
      : 0;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusModelAtPosition(currentPosition + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusModelAtPosition(currentPosition - 1);
    } else if (event.key === 'PageDown') {
      event.preventDefault();
      focusModelAtPosition(currentPosition + 6);
    } else if (event.key === 'PageUp') {
      event.preventDefault();
      focusModelAtPosition(currentPosition - 6);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusModelAtPosition(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusModelAtPosition(indices.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const focused = modelMenuModels[focusedModelIndex];
      if (focused) selectModel(focused);
    }
  }

  const modelMenu = modelOpen && modelMenuLayout && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={modelMenuRef}
        role="menu"
        aria-label="Model selector"
        onKeyDown={handleModelMenuKeyDown}
        className="z-[80] bg-neutral-900 border border-neutral-700 shadow-2xl p-1 overflow-y-auto"
        style={modelMenuLayout}
      >
        <div className="px-2 py-1 type-label text-neutral-400 uppercase tracking-wider border-b border-neutral-800">
          {activeEndpoint.label} models
        </div>
        {activeModel && !modelMenuModels.some((model) => model.id === activeModel.id) && (
          <div className="px-2 py-1.5 border-b border-neutral-800 text-red-300">
            <div className="truncate">{activeModel.displayName}</div>
            <div className="type-meta text-red-300/80">Unavailable - select an available model</div>
          </div>
        )}
        {modelMenuModels.length === 0 ? (
          <div className="px-2 py-2 type-meta text-neutral-400">
            No models available. Refresh inventory in Provider Manager.
          </div>
        ) : (
          modelMenuModels.map((model, index) => {
            const selected = model.id === activeProfile.modelId;
            const selectable = isModelSelectable(model);
            return (
              <button
                key={model.id}
                ref={(node) => {
                  modelItemRefs.current[index] = node;
                }}
                onClick={() => selectModel(model)}
                onMouseEnter={() => {
                  if (selectable) setFocusedModelIndex(index);
                }}
                disabled={!selectable}
                role="menuitemradio"
                aria-checked={selected}
                tabIndex={focusedModelIndex === index ? 0 : -1}
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
                  {model.inputTokenLimit ? ` - ${Math.round(model.inputTokenLimit / 1000)}K input` : ''}
                  {model.thinkingSupported ? ' - thinking' : ''}
                </div>
              </button>
            );
          })
        )}
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={ref} className="relative flex items-center gap-1 font-mono type-control">
      <div className="relative">
        <button
          ref={modelTriggerRef}
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
        {modelMenu}
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
