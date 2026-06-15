import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Download, Upload, FileJson, FileText } from 'lucide-react';
import {
  exportWorkspace, importWorkspace, applyWorkspace,
  exportGraphJSON, exportGraphCSV, exportAuditJSON, exportAuditCSV,
} from '../../lib/backup';
import { ModelTuningControls } from './ModelTuningControls';
import { SecurityGates } from './SecurityGates';
import { SecretsPanel } from './SecretsPanel';
import { useApp } from '../../state/AppState';
import { useAuth } from '../../auth/AuthContext';
import { canManageWorkspaces, canConfigureSiem } from '../../auth/roles';
import { reachesNetwork } from '../../lib/llm';
import {
  loadWorkspaces, getActiveWorkspace, createWorkspace, switchWorkspace, deleteWorkspace,
  type Workspace,
} from '../../auth/workspace';

/**
 * CONFIGURATION & CAPABILITY GOVERNANCE.
 * A low-profile tab in the bottom-left corner. It slides open a parameter tray:
 * named presets (add / rename / delete), the routed endpoint, a model picker,
 * temperature & context sliders, and the capability gates. Clicking outside
 * the tray (or pressing Escape) closes it.
 */
export function StealthDrawer() {
  const [open, setOpen] = useState(false);
  const {
    profiles,
    activeProfileId,
    setActiveProfileId,
    activeProfile,
    updateProfile,
    addProfile,
    deleteProfile,
    endpoints,
    activeEndpoint,
    setEndpointModel,
  } = useApp();

  const trayRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 'idle' | 'export-pw' | 'import-pw' | 'importing' | 'done' | 'error'
  const [dataOp, setDataOp] = useState<string>('idle');
  const [passphrase, setPassphrase] = useState('');
  const [dataMsg, setDataMsg] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // 8.3 workspace switcher state
  const { siemConfig, setSiemConfig } = useApp();
  const { currentUser, signOut } = useAuth();
  const canSiem = canConfigureSiem(currentUser?.role);
  const [siemUrl, setSiemUrl] = useState(siemConfig?.url ?? '');
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => loadWorkspaces());
  const [activeWsId, setActiveWsId] = useState(() => getActiveWorkspace().id);
  const [newWsName, setNewWsName] = useState('');
  const canWs = canManageWorkspaces(currentUser?.role);

  // 9.1 log dir
  const [logDir, setLogDir] = useState<string>('');

  // 9.3 crash reporting
  const [crashConsent, setCrashConsent] = useState(false);
  const [crashReports, setCrashReports] = useState<string[]>([]);
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  useEffect(() => {
    if (!isTauri) return;
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<boolean>('get_crash_consent').then(setCrashConsent).catch(() => {});
      invoke<string[]>('get_crash_reports').then(setCrashReports).catch(() => {});
    });
  }, [isTauri]);
  function toggleCrashConsent() {
    if (!isTauri) return;
    const next = !crashConsent;
    import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke('set_crash_consent', { enabled: next })
        .then(() => setCrashConsent(next))
        .catch(() => {})
    );
  }
  function clearCrashReports() {
    if (!isTauri) return;
    import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke('clear_crash_reports')
        .then(() => setCrashReports([]))
        .catch(() => {})
    );
  }
  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<string>('get_log_dir'))
      .then(setLogDir)
      .catch(() => {});
  }, []);

  function refreshWorkspaces() {
    setWorkspaces(loadWorkspaces());
    setActiveWsId(getActiveWorkspace().id);
  }
  function handleSwitchWorkspace(id: string) {
    if (id === activeWsId) return;
    switchWorkspace(id);
    window.location.reload();
  }
  function handleCreateWorkspace() {
    if (!newWsName.trim()) return;
    const ws = createWorkspace(newWsName.trim());
    setNewWsName('');
    refreshWorkspaces();
    if (window.confirm(`Switch to new workspace "${ws.name}"?`)) {
      switchWorkspace(ws.id);
      window.location.reload();
    }
  }
  function handleDeleteWorkspace(id: string) {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws || id === activeWsId) return;
    if (!window.confirm(`Delete workspace "${ws.name}"? Its data cannot be recovered.`)) return;
    deleteWorkspace(id);
    refreshWorkspaces();
  }

  // Close when clicking outside the tray (but not on the trigger), or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (trayRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      {/* Trigger tab — absolute bottom-left corner of the window */}
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-0 left-0 z-[60] w-6 h-7 flex items-center justify-center bg-neutral-900 border-t border-r border-neutral-700 text-emerald-500 font-mono text-sm hover:bg-neutral-800"
        title="Configuration tray"
      >
        {open ? '<' : '>'}
      </button>

      {/* Sliding tray */}
      <div
        ref={trayRef}
        className={`fixed bottom-0 left-0 z-[55] w-72 bg-neutral-950/95 border-t border-r border-neutral-700 backdrop-blur-sm transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div className="p-3 pl-7 space-y-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400/80 border-b border-neutral-800 pb-2">
            Parameter Tray
          </div>

          {/* Presets (saved parameter sets) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-mono uppercase tracking-wider text-neutral-500">
                Presets
              </div>
              <div className="flex gap-1">
                <button
                  onClick={addProfile}
                  title="New preset (copies the current one)"
                  className="flex items-center gap-0.5 px-1 py-0.5 text-[8px] font-mono border border-neutral-700 text-neutral-400 hover:border-emerald-500/50 hover:text-emerald-300"
                >
                  <Plus className="w-2.5 h-2.5" /> NEW
                </button>
                <button
                  onClick={() => deleteProfile(activeProfileId)}
                  disabled={profiles.length <= 1}
                  title="Delete the current preset"
                  className="flex items-center gap-0.5 px-1 py-0.5 text-[8px] font-mono border border-neutral-700 text-neutral-400 hover:border-red-500/50 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-2.5 h-2.5" /> DEL
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveProfileId(p.id)}
                  className={`px-1.5 py-1 text-[9px] font-mono border ${
                    p.id === activeProfileId
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                      : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <input
              value={activeProfile.name}
              onChange={(e) => updateProfile(activeProfile.id, { name: e.target.value })}
              placeholder="preset name"
              className="w-full bg-neutral-900 border border-neutral-800 text-neutral-300 text-[10px] font-mono p-1.5 outline-none focus:border-neutral-600"
            />
          </div>

          {/* Endpoint binding for the active preset */}
          <div className="space-y-1.5">
            <div className="text-[9px] font-mono uppercase tracking-wider text-neutral-500">
              Routed Endpoint
            </div>
            <select
              value={activeProfile.endpointId}
              onChange={(e) => updateProfile(activeProfile.id, { endpointId: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-800 text-neutral-300 text-[10px] font-mono p-1.5 outline-none focus:border-neutral-600"
            >
              {endpoints.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label} {reachesNetwork(e) ? '· cloud-capable' : '· local'}
                </option>
              ))}
            </select>
          </div>

          {/* Model picker for the routed endpoint */}
          <div className="space-y-1.5">
            <div className="text-[9px] font-mono uppercase tracking-wider text-neutral-500">
              Model
            </div>
            {activeEndpoint.models && activeEndpoint.models.length > 0 ? (
              <select
                value={activeEndpoint.model}
                onChange={(e) => setEndpointModel(activeEndpoint.id, e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-neutral-300 text-[10px] font-mono p-1.5 outline-none focus:border-neutral-600"
              >
                {activeEndpoint.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-[9px] font-mono text-neutral-600 border border-neutral-800 p-1.5 leading-relaxed">
                {activeEndpoint.model}
                <br />
                no installed models detected — start the model server, then press the ⟳ button on
                the status pill (top-right) to probe.
              </div>
            )}
          </div>

          {/* API keys in the OS keychain */}
          <SecretsPanel />

          {/* Hardware sliders (temperature + context window) */}
          <ModelTuningControls />

          {/* Workspaces (Phase 8.3) */}
          <div className="space-y-1.5 border-t border-neutral-800 pt-3">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-mono uppercase tracking-wider text-neutral-500">Workspaces</div>
              <button
                onClick={signOut}
                className="text-[8px] font-mono text-neutral-600 hover:text-neutral-400 transition-colors"
              >
                {currentUser?.name} · sign out
              </button>
            </div>
            <div className="space-y-1">
              {workspaces.map((ws) => (
                <div key={ws.id} className="flex items-center gap-1">
                  <button
                    onClick={() => handleSwitchWorkspace(ws.id)}
                    className={`flex-1 text-left px-2 py-1 text-[9px] font-mono border transition-colors ${
                      ws.id === activeWsId
                        ? 'border-violet-500/50 text-violet-300 bg-violet-500/5'
                        : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
                    }`}
                  >
                    {ws.name}
                    {ws.id === activeWsId && <span className="ml-1 text-violet-500">●</span>}
                  </button>
                  {ws.id !== activeWsId && canWs && (
                    <button
                      onClick={() => handleDeleteWorkspace(ws.id)}
                      className="p-1 text-neutral-600 hover:text-red-400 transition-colors"
                      title="Delete workspace"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canWs && (
              <div className="flex gap-1">
                <input
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateWorkspace()}
                  placeholder="New workspace…"
                  className="flex-1 bg-neutral-900 border border-neutral-700 px-2 py-1 text-[9px] font-mono text-neutral-300 focus:outline-none focus:border-neutral-500 placeholder:text-neutral-700"
                />
                <button
                  onClick={handleCreateWorkspace}
                  disabled={!newWsName.trim()}
                  className="px-2 py-1 border border-neutral-700 text-neutral-500 hover:text-neutral-300 disabled:opacity-40 transition-colors"
                  title="Create workspace"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Capability gates */}
          <SecurityGates />

          {/* Data safety — backup / restore / export (Phase 7) */}
          <div className="space-y-1.5 border-t border-neutral-800 pt-3">
            <div className="text-[9px] font-mono uppercase tracking-wider text-neutral-500">
              Data
            </div>

            {/* Encrypted workspace backup */}
            <div className="space-y-1">
              <div className="text-[8px] font-mono text-neutral-600 uppercase tracking-wide">Workspace backup</div>
              <div className="flex gap-1">
                <button
                  onClick={() => { setDataOp('export-pw'); setPassphrase(''); setDataMsg(''); }}
                  className="flex items-center gap-0.5 px-1.5 py-1 text-[8px] font-mono border border-neutral-700 text-neutral-400 hover:border-emerald-500/50 hover:text-emerald-300"
                  title="Export encrypted workspace (.codename)"
                >
                  <Download className="w-2.5 h-2.5" /> Export
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-0.5 px-1.5 py-1 text-[8px] font-mono border border-neutral-700 text-neutral-400 hover:border-amber-500/50 hover:text-amber-300"
                  title="Import workspace from .codename file"
                >
                  <Upload className="w-2.5 h-2.5" /> Import
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".codename,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setPendingFile(f); setDataOp('import-pw'); setPassphrase(''); setDataMsg(''); }
                  e.target.value = '';
                }}
              />

              {/* Passphrase prompt for export */}
              {dataOp === 'export-pw' && (
                <div className="space-y-1 mt-1">
                  <input
                    autoFocus
                    type="password"
                    placeholder="Passphrase to encrypt with…"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setDataOp('idle')}
                    className="w-full bg-neutral-900 border border-neutral-700 text-neutral-300 text-[9px] font-mono p-1 outline-none focus:border-emerald-600"
                  />
                  <div className="flex gap-1">
                    <button
                      disabled={!passphrase}
                      onClick={async () => {
                        try {
                          setDataOp('idle');
                          await exportWorkspace(passphrase);
                          setDataMsg('✓ exported');
                        } catch (e) {
                          setDataMsg(`✗ ${String(e)}`);
                        }
                      }}
                      className="px-2 py-0.5 text-[8px] font-mono border border-emerald-700 text-emerald-400 hover:bg-emerald-950/40 disabled:opacity-30"
                    >OK</button>
                    <button onClick={() => setDataOp('idle')} className="px-2 py-0.5 text-[8px] font-mono border border-neutral-700 text-neutral-500 hover:text-neutral-300">cancel</button>
                  </div>
                </div>
              )}

              {/* Passphrase prompt for import */}
              {dataOp === 'import-pw' && pendingFile && (
                <div className="space-y-1 mt-1">
                  <div className="text-[8px] font-mono text-amber-400/80 truncate">{pendingFile.name}</div>
                  <input
                    autoFocus
                    type="password"
                    placeholder="Passphrase to decrypt…"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setDataOp('idle')}
                    className="w-full bg-neutral-900 border border-neutral-700 text-neutral-300 text-[9px] font-mono p-1 outline-none focus:border-amber-600"
                  />
                  <div className="flex gap-1">
                    <button
                      disabled={!passphrase}
                      onClick={async () => {
                        try {
                          setDataOp('importing');
                          const bundle = await importWorkspace(pendingFile!, passphrase);
                          if (!window.confirm(
                            `Import ${bundle.nodes.length} nodes, ${bundle.edges.length} edges, ` +
                            `${bundle.audit.length} audit records?

This will OVERWRITE all current data. ` +
                            `The app will reload after import.`
                          )) {
                            setDataOp('idle');
                            return;
                          }
                          await applyWorkspace(bundle);
                          window.location.reload();
                        } catch (e) {
                          setDataOp('idle');
                          setDataMsg(`✗ ${String(e)}`);
                        }
                      }}
                      className="px-2 py-0.5 text-[8px] font-mono border border-amber-700 text-amber-400 hover:bg-amber-950/40 disabled:opacity-30"
                    >Import</button>
                    <button onClick={() => setDataOp('idle')} className="px-2 py-0.5 text-[8px] font-mono border border-neutral-700 text-neutral-500 hover:text-neutral-300">cancel</button>
                  </div>
                </div>
              )}

              {dataMsg && (
                <div className={`text-[8px] font-mono ${dataMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                  {dataMsg}
                </div>
              )}
            </div>

            {/* Open-format exports */}
            <div className="space-y-1">
              <div className="text-[8px] font-mono text-neutral-600 uppercase tracking-wide">Open export</div>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => exportGraphJSON().catch(() => {})}
                  className="flex items-center gap-0.5 px-1.5 py-1 text-[8px] font-mono border border-neutral-700 text-neutral-400 hover:border-sky-500/50 hover:text-sky-300"
                  title="Export graph as JSON"
                >
                  <FileJson className="w-2.5 h-2.5" /> Graph JSON
                </button>
                <button
                  onClick={() => exportGraphCSV().catch(() => {})}
                  className="flex items-center gap-0.5 px-1.5 py-1 text-[8px] font-mono border border-neutral-700 text-neutral-400 hover:border-sky-500/50 hover:text-sky-300"
                  title="Export graph as CSV"
                >
                  <FileText className="w-2.5 h-2.5" /> Graph CSV
                </button>
                <button
                  onClick={() => exportAuditJSON().catch(() => {})}
                  className="flex items-center gap-0.5 px-1.5 py-1 text-[8px] font-mono border border-neutral-700 text-neutral-400 hover:border-violet-500/50 hover:text-violet-300"
                  title="Export audit log as JSON"
                >
                  <FileJson className="w-2.5 h-2.5" /> Audit JSON
                </button>
                <button
                  onClick={() => exportAuditCSV().catch(() => {})}
                  className="flex items-center gap-0.5 px-1.5 py-1 text-[8px] font-mono border border-neutral-700 text-neutral-400 hover:border-violet-500/50 hover:text-violet-300"
                  title="Export audit log as CSV"
                >
                  <FileText className="w-2.5 h-2.5" /> Audit CSV
                </button>
              </div>
            </div>
          </div>

          {/* SIEM endpoint (Phase 8.6) */}
          <div className="space-y-1.5 border-t border-neutral-800 pt-3">
            <div className="text-[9px] font-mono uppercase tracking-wider text-neutral-500">
              SIEM Forwarding
            </div>
            {!canSiem ? (
              <div className="text-[8px] font-mono text-neutral-600 px-1">Admin role required to configure SIEM.</div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-[8px] font-mono text-neutral-600">
                  POST audit events to an HTTP endpoint (requires Network gate open).
                </div>
                <input
                  value={siemUrl}
                  onChange={(e) => setSiemUrl(e.target.value)}
                  placeholder="https://siem.corp/ingest"
                  className="w-full bg-neutral-900 border border-neutral-700 px-2 py-1 text-[9px] font-mono text-neutral-300 focus:outline-none focus:border-neutral-500 placeholder:text-neutral-700"
                />
                <div className="flex gap-1 items-center">
                  <button
                    onClick={() => {
                      if (!siemUrl.trim()) { setSiemConfig(null); return; }
                      setSiemConfig({ url: siemUrl.trim(), enabled: true });
                    }}
                    className="px-2 py-1 text-[8px] font-mono border border-neutral-700 text-neutral-400 hover:border-emerald-500/50 hover:text-emerald-300 transition-colors"
                  >
                    Save &amp; Enable
                  </button>
                  {siemConfig?.enabled && (
                    <button
                      onClick={() => setSiemConfig({ ...siemConfig, enabled: false })}
                      className="px-2 py-1 text-[8px] font-mono border border-neutral-700 text-neutral-400 hover:border-red-500/50 hover:text-red-300 transition-colors"
                    >
                      Disable
                    </button>
                  )}
                  <span className={`ml-auto text-[8px] font-mono ${siemConfig?.enabled ? 'text-emerald-400' : 'text-neutral-600'}`}>
                    {siemConfig?.enabled ? '● active' : '○ off'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Crash Reporting (Phase 9.3) */}
          <div className="border-t border-neutral-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[8px] font-mono font-bold tracking-widest text-neutral-500 uppercase">Crash Reports</div>
              <button
                onClick={toggleCrashConsent}
                className={`text-[8px] font-mono px-2 py-0.5 rounded border transition-colors ${
                  crashConsent
                    ? 'border-amber-700 text-amber-400 hover:border-amber-500'
                    : 'border-neutral-700 text-neutral-500 hover:text-neutral-300 hover:border-neutral-500'
                }`}
              >
                {crashConsent ? '● collecting' : '○ off'}
              </button>
            </div>
            {crashConsent && (
              <div className="text-[8px] font-mono text-neutral-600 mb-2">
                Panic and JS errors are written locally — never transmitted.
              </div>
            )}
            {crashReports.length > 0 && (
              <div className="flex flex-col gap-1 mb-2">
                {crashReports.slice(0, 5).map((r) => (
                  <div key={r} className="text-[8px] font-mono text-neutral-500 truncate">{r}</div>
                ))}
                {crashReports.length > 5 && (
                  <div className="text-[8px] font-mono text-neutral-600">…and {crashReports.length - 5} more</div>
                )}
                <button
                  onClick={clearCrashReports}
                  className="text-[8px] font-mono text-red-500/60 hover:text-red-400 text-left mt-1"
                >
                  Clear all reports
                </button>
              </div>
            )}
          </div>

          {/* View Logs (Phase 9.1) */}
          <div className="border-t border-neutral-800 pt-3">
            <div className="text-[8px] font-mono font-bold tracking-widest text-neutral-500 uppercase mb-2">Logs</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
                  import('@tauri-apps/api/core').then(({ invoke }) => invoke('open_log_dir')).catch(() => {});
                }}
                className="text-[9px] font-mono text-neutral-400 hover:text-neutral-200 border border-neutral-700 hover:border-neutral-500 px-2 py-1 rounded transition-colors"
              >
                View Logs
              </button>
              {logDir && (
                <span className="text-[8px] font-mono text-neutral-600 truncate max-w-[160px]" title={logDir}>
                  {logDir}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Re-export to keep a single import surface (tuning controls live in their own file).
export { ModelTuningControls };
