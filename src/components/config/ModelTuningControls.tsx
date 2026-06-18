import { useApp } from '../../state/AppState';

const CTX_STEPS = [2048, 4096, 8192, 16384, 32768, 65536, 131072];

export function ModelTuningControls() {
  const {
    activeProfile,
    activeTask,
    effectiveTemperature,
    effectiveContextWindow,
    setRuntimeOverride,
    clearRuntimeOverrides,
  } = useApp();

  const ctxIndex = Math.max(
    0,
    CTX_STEPS.findIndex((v) => v >= effectiveContextWindow),
  );
  const hasOverrides = !!activeTask.runtimeOverrides;

  return (
    <div className="space-y-3">
      {/* Temperature */}
      <div>
        <div className="flex justify-between type-label font-mono mb-1">
          <span className="text-neutral-400 uppercase tracking-wider">Temperature</span>
          <span className="text-emerald-400">{effectiveTemperature.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={effectiveTemperature}
          onChange={(e) =>
            setRuntimeOverride({ temperature: parseFloat(e.target.value) })
          }
          className="w-full accent-emerald-500"
        />
      </div>

      {/* Context window */}
      <div>
        <div className="flex justify-between type-label font-mono mb-1">
          <span className="text-neutral-400 uppercase tracking-wider">Context Window</span>
          <span className="text-emerald-400">
            {(effectiveContextWindow / 1024).toFixed(0)}K
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={CTX_STEPS.length - 1}
          step={1}
          value={ctxIndex}
          onChange={(e) =>
            setRuntimeOverride({ contextWindow: CTX_STEPS[parseInt(e.target.value, 10)] })
          }
          className="w-full accent-emerald-500"
        />
      </div>

      <div className="type-meta font-mono text-neutral-400">
        Defaults: T{activeProfile.defaultTemperature.toFixed(2)} · CTX{activeProfile.defaultContextWindow}
      </div>
      {hasOverrides && (
        <button
          onClick={clearRuntimeOverrides}
          className="type-control font-mono border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 px-2 py-1"
        >
          Clear chat overrides
        </button>
      )}
    </div>
  );
}
