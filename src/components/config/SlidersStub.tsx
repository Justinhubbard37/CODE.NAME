import { useApp } from '../../state/AppState';

const CTX_STEPS = [2048, 4096, 8192, 16384, 32768, 65536, 131072];

export function SlidersStub() {
  const { activeProfile, updateProfile } = useApp();

  const ctxIndex = Math.max(
    0,
    CTX_STEPS.findIndex((v) => v >= activeProfile.contextWindow),
  );

  return (
    <div className="space-y-3">
      {/* Temperature */}
      <div>
        <div className="flex justify-between text-[9px] font-mono mb-1">
          <span className="text-neutral-500 uppercase tracking-wider">Temperature</span>
          <span className="text-emerald-400">{activeProfile.temperature.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={activeProfile.temperature}
          onChange={(e) =>
            updateProfile(activeProfile.id, { temperature: parseFloat(e.target.value) })
          }
          className="w-full accent-emerald-500"
        />
      </div>

      {/* Context window */}
      <div>
        <div className="flex justify-between text-[9px] font-mono mb-1">
          <span className="text-neutral-500 uppercase tracking-wider">Context Window</span>
          <span className="text-emerald-400">
            {(activeProfile.contextWindow / 1024).toFixed(0)}K
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={CTX_STEPS.length - 1}
          step={1}
          value={ctxIndex}
          onChange={(e) =>
            updateProfile(activeProfile.id, {
              contextWindow: CTX_STEPS[parseInt(e.target.value, 10)],
            })
          }
          className="w-full accent-emerald-500"
        />
      </div>
    </div>
  );
}
