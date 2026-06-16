import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';

import type {
  ActivityKind,
  AppNode,
  AuditAction,
  AuditActor,
  ChatMessage,
  ConfigProfile,
  Endpoint,
  EffectiveGateState,
  NodeData,
  QuarantineItem,
  SecurityGates,
  TabCaps,
  WorkTask,
} from '../types';
import { initialNodes, initialEdges } from '../store';
import {
  defaultEndpoints,
  defaultGates,
  defaultProfiles,
  initialTask,
} from '../config/defaults';
import {
  loadEndpoints,
  loadProfiles,
  loadActiveProfileId,
  loadGates,
  saveConfig,
} from '../config/persist';
import { hashFile } from '../lib/hash';
import { pingEndpoint, streamChat, listModels, reachesNetwork, type ChatTurn } from '../lib/llm';
import {
  RETRIEVAL_CHAT_RESULT_LIMIT,
  RETRIEVAL_RESULT_LIMIT,
  buildOptionalChatPromptWithRetrievedContext,
  clearRetrievedContextState,
  retrievedContextAfterDocumentDelete,
  retrievedContextAfterSearch,
} from '../lib/retrievalContext';
import {
  activeKbWorkspaceId,
  emptyKbStats,
  emptyKbEmbeddingStatus,
  kbInit,
  kbIngestText,
  kbGraphProjection,
  kbSearch,
  kbSemanticSearch,
  kbEmbeddingStatus,
  kbEmbedMissing,
  kbStats as loadKbStats,
  kbListDocuments,
  kbDeleteDocument,
  type KbDocument,
  type KbEmbeddingStatus,
  type KbRetrievalMode,
  type KbSearchResult,
  type KbStats,
} from '../lib/kb';
import { kgStore } from '../kg/store';
import {
  hasConnectedKbProjection,
  reconcileKbGraphProjection,
  upsertKbGraphProjection,
} from '../kg/kbProjection';
import { evaluateKgWrite, makeAudit } from '../kg/commit';
import { retriever } from '../kg/retrieve';
import { getSidecarInfo, streamFromSidecar, cancelSidecar, sidecarToolResult, sidecarCommunities, sidecarBrowserOpen, sidecarPoolCreate, sidecarPoolRelease } from '../lib/sidecar';
import { installWebMcp, setToolGuard, setToolLogger, registerTool, executeTool } from '../lib/webmcp';
import { setAgentUI } from '../components/right/a2ui/bus';
import type { A2UIPayload } from '../components/right/a2ui/types';
import { effectiveGates } from '../lib/perms';
import { runSelfCheck } from '../lib/selfcheck';
import { lease as poolLease, releaseAll as poolReleaseAll, configurePoolBackend } from '../lib/pools';
import { useAuth } from '../auth/AuthContext';
import { canWrite, canToggleGates, canUseTool } from '../auth/roles';
import { getActiveWorkspace } from '../auth/workspace';
import { initWorkspaceStore } from '../kg/store';
import { loadPolicy, savePolicy, applyPolicy, isGateLocked, type AdminPolicy } from '../auth/policy';
import { loadSiemConfig, saveSiemConfig, configureSiem, type SiemConfig } from '../lib/siem';

const NODE_STYLE: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.8)',
  border: '1px solid #333',
  color: '#ccc',
  borderRadius: '2px',
  fontFamily: 'monospace',
  fontSize: '10px',
  padding: '8px',
  boxShadow: '0 0 10px rgba(0,0,0,0.5)',
};

interface AppStateValue {
  /* graph */
  nodes: AppNode[];
  edges: Edge[];
  onNodesChange: (c: NodeChange<AppNode>[]) => void;
  onEdgesChange: (c: EdgeChange[]) => void;
  onConnect: (c: Connection | Edge) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  updateNodeData: (id: string, data: NodeData) => void;
  graphQuery: string;
  setGraphQuery: (q: string) => void;
  runGraphQuery: (q: string) => void;
  kbStats: KbStats;
  kbDocuments: KbDocument[];
  kbSearchResults: KbSearchResult[];
  retrievalQuery: string;
  retrievalResults: KbSearchResult[];
  retrievalMode: KbRetrievalMode;
  setRetrievalMode: (mode: KbRetrievalMode) => void;
  retrievalEnabledForChat: boolean;
  setRetrievalEnabledForChat: (enabled: boolean) => void;
  runKbRetrieval: (query: string, limit?: number) => Promise<KbSearchResult[]>;
  clearKbRetrieval: () => void;
  semanticStatus: KbEmbeddingStatus;
  semanticIndexing: boolean;
  semanticError: string;
  refreshSemanticStatus: () => Promise<void>;
  buildSemanticIndex: () => Promise<void>;
  refreshKbStats: () => Promise<void>;
  refreshKbDocuments: () => Promise<void>;
  deleteKbDocument: (documentId: string) => Promise<void>;
  stabilizeGraphLayout: () => Promise<void>;

  /* tasks */
  tasks: WorkTask[];
  activeTaskId: string;
  activeTask: WorkTask;
  setActiveTaskId: (id: string) => void;
  addTask: (kind: WorkTask['kind']) => void;
  closeTask: (id: string) => void;
  setTabCap: (taskId: string, cap: keyof TabCaps, value: boolean) => void;

  /* chat */
  sending: boolean;
  sendMessage: (text: string) => void;
  abort: () => void;
  showActivity: boolean;
  setShowActivity: (v: boolean) => void;
  /** model the server last confirmed it actually ran (empty until first reply) */
  runningModel: string;

  /* endpoints / profiles / gates */
  endpoints: Endpoint[];
  profiles: ConfigProfile[];
  activeProfileId: string;
  setActiveProfileId: (id: string) => void;
  activeProfile: ConfigProfile;
  activeEndpoint: Endpoint;
  updateProfile: (id: string, patch: Partial<ConfigProfile>) => void;
  setEndpointModel: (endpointId: string, model: string) => void;
  updateEndpoint: (id: string, patch: Partial<Endpoint>) => void;
  addProfile: () => void;
  deleteProfile: (id: string) => void;
  refreshEndpoints: () => void;
  gates: SecurityGates;
  toggleGate: (k: keyof SecurityGates) => void;
  adminPolicy: AdminPolicy;
  togglePolicyLock: (k: keyof SecurityGates) => void;
  siemConfig: SiemConfig | null;
  setSiemConfig: (cfg: SiemConfig | null) => void;

  /* ingestion */
  quarantine: QuarantineItem[];
  ingestFiles: (files: File[]) => void;
  resolveConflict: (id: string, action: 'overwrite' | 'skip' | 'fork') => void;
  clearLedger: () => void;

  /* telemetry */
  bootTs: number;
  /** "ok" | "degraded" | "offline" | "unknown" — from Slice 9.2 watchdog */
  watchdogHealth: string;
}

const Ctx = createContext<AppStateValue | null>(null);

export function useApp(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within AppStateProvider');
  return v;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();

  // 8.3: initialise the KG store for the active workspace before any reads.
  // This is synchronous (sets a module-level string) so it runs before effects.
  initWorkspaceStore(getActiveWorkspace().dbName);
  const bootTs = useRef(Date.now()).current;

  /* ---- 9.2 health watchdog ---- */
  const [watchdogHealth, setWatchdogHealth] = useState<string>('unknown');
  const failCountRef = useRef(0);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
      try {
        const { invoke: inv } = await import('@tauri-apps/api/core');
        const res = await inv<{ ok: boolean; latency_ms: number; reason?: string }>(
          'sidecar_health',
        );
        if (!alive) return;
        if (res.ok) {
          failCountRef.current = 0;
          setWatchdogHealth('ok');
        } else {
          failCountRef.current += 1;
          setWatchdogHealth(failCountRef.current >= 3 ? 'offline' : 'degraded');
          if (failCountRef.current >= 3) {
            failCountRef.current = 0;
            inv('sidecar_restart').catch(() => {});
          }
        }
      } catch {
        if (!alive) return;
        failCountRef.current += 1;
        setWatchdogHealth(failCountRef.current >= 3 ? 'offline' : 'degraded');
        if (failCountRef.current >= 3) {
          failCountRef.current = 0;
          import('@tauri-apps/api/core').then(({ invoke: inv }) => inv('sidecar_restart')).catch(() => {});
        }
      }
    };
    // Initial probe after 2 s to let the sidecar boot
    const initial = setTimeout(poll, 2000);
    const interval = setInterval(poll, 10_000);
    return () => { alive = false; clearTimeout(initial); clearInterval(interval); };
  }, []);

  /* ---- 9.3 JS crash reporting ---- */
  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    const sendCrash = (msg: string, stack: string) => {
      import('@tauri-apps/api/core')
        .then(({ invoke }) =>
          invoke('get_crash_consent')
            .then((ok) => {
              if (ok) invoke('append_js_crash_log', { message: msg, stack }).catch(() => {});
            })
        )
        .catch(() => {});
    };
    const onError = (e: ErrorEvent) => {
      sendCrash(e.message ?? 'Unknown error', e.error?.stack ?? '');
    };
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const reason = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
      sendCrash(`Unhandled promise rejection: ${reason.message}`, reason.stack ?? '');
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, []);

  /* ---- graph ---- */
  const [nodes, setNodes] = useState<AppNode[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges as Edge[]);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphQuery, setGraphQuery] = useState('');
  const [kbStatsState, setKbStatsState] = useState<KbStats>(emptyKbStats);
  const [kbDocuments, setKbDocuments] = useState<KbDocument[]>([]);
  const [kbSearchResults, setKbSearchResults] = useState<KbSearchResult[]>([]);
  const [retrievalQuery, setRetrievalQuery] = useState('');
  const [retrievalMode, setRetrievalModeState] = useState<KbRetrievalMode>('lexical');
  const [retrievalEnabledForChat, setRetrievalEnabledForChatState] = useState(false);
  const [semanticStatus, setSemanticStatus] = useState<KbEmbeddingStatus>(emptyKbEmbeddingStatus);
  const [semanticIndexing, setSemanticIndexing] = useState(false);
  const [semanticError, setSemanticError] = useState('');

  const onNodesChange = useCallback(
    (c: NodeChange<AppNode>[]) => setNodes((nds) => applyNodeChanges(c, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (c: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(c, eds)),
    [],
  );
  const onConnect = useCallback(
    (c: Connection | Edge) =>
      setEdges((eds) => {
        const next = addEdge({ ...c, animated: true, style: { stroke: '#666' } } as Edge, eds);
        // Edges are KG content: persist + audit the link (best-effort).
        const decision = evaluateKgWrite(gatesRef.current);
        kgStore.appendAudit(
          makeAudit({
            actor: { kind: 'user', id: currentUser?.id ?? 'local' },
            action: 'link',
            target: { kind: 'edge', id: 'edge' },
            decision,
          }),
        ).catch(() => {});
        if (decision.allowed) kgStore.putEdges(next).catch(() => {});
        return next;
      }),
    [],
  );

  const refreshKbStats = useCallback(async () => {
    setKbStatsState(await loadKbStats());
  }, []);

  const refreshKbDocuments = useCallback(async () => {
    setKbDocuments(await kbListDocuments({ workspaceId: activeKbWorkspaceId() }));
  }, []);

  const refreshSemanticStatus = useCallback(async () => {
    const status = await kbEmbeddingStatus({ workspaceId: activeKbWorkspaceId() });
    setSemanticStatus(status);
    setSemanticError(status.lastError ?? '');
  }, []);

  const setRetrievalEnabledForChat = useCallback((enabled: boolean) => {
    setRetrievalEnabledForChatState(enabled);
  }, []);

  const applyRetrievedContext = useCallback(
    (next: ReturnType<typeof clearRetrievedContextState>) => {
      setKbSearchResults(next.results);
      setRetrievalQuery(next.query);
      setRetrievalEnabledForChatState(next.attachEnabled);
      setRetrievalModeState(next.mode);
    },
    [],
  );

  const clearKbRetrieval = useCallback(() => {
    applyRetrievedContext(clearRetrievedContextState(retrievalMode));
  }, [applyRetrievedContext, retrievalMode]);

  const setRetrievalMode = useCallback(
    (mode: KbRetrievalMode) => {
      applyRetrievedContext(clearRetrievedContextState(mode));
    },
    [applyRetrievedContext],
  );

  const runKbRetrieval = useCallback(
    async (queryInput: string, limit = RETRIEVAL_RESULT_LIMIT): Promise<KbSearchResult[]> => {
      const query = queryInput.trim();
      if (!query) {
        clearKbRetrieval();
        return [];
      }
      try {
        const results =
          retrievalMode === 'semantic'
            ? await kbSemanticSearch({ workspaceId: activeKbWorkspaceId(), query, limit })
            : await kbSearch({ workspaceId: activeKbWorkspaceId(), query, limit });
        const next = retrievedContextAfterSearch(query, results, retrievalMode);
        applyRetrievedContext(next);
        if (retrievalMode === 'semantic') setSemanticError('');
        await refreshKbStats();
        if (retrievalMode === 'semantic') await refreshSemanticStatus();
        return results;
      } catch (err) {
        const next = retrievedContextAfterSearch(query, [], retrievalMode);
        applyRetrievedContext(next);
        if (retrievalMode === 'semantic') {
          const reason = err instanceof Error ? err.message : 'semantic retrieval unavailable';
          setSemanticError(reason);
          setSemanticStatus((current) => ({
            ...current,
            ready: false,
            state: 'unavailable',
            lastError: reason,
          }));
        }
        return [];
      }
    },
    [applyRetrievedContext, clearKbRetrieval, refreshKbStats, refreshSemanticStatus, retrievalMode],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await kbInit();
        const [stats, docs, semantic] = await Promise.all([
          loadKbStats(),
          kbListDocuments({ workspaceId: activeKbWorkspaceId() }),
          kbEmbeddingStatus({ workspaceId: activeKbWorkspaceId() }),
        ]);
        if (alive) {
          setKbStatsState(stats);
          setKbDocuments(docs);
          setSemanticStatus(semantic);
          setSemanticError(semantic.lastError ?? '');
        }
      } catch {
        if (alive) {
          setKbStatsState(emptyKbStats);
          setKbDocuments([]);
          setSemanticStatus(emptyKbEmbeddingStatus);
          setSemanticError('');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const runGraphQuery = useCallback((q: string) => {
    const query = q.trim();
    if (!query) clearKbRetrieval();
    setNodes((nds) => {
      if (!query) {
        return nds.map((n) => ({ ...n, hidden: false }));
      }
      retriever.index(nds);
      const hits = new Set(retriever.retrieve(query).map((r) => r.id));
      return nds.map((n) => ({ ...n, hidden: !hits.has(n.id) }));
    });
    if (query) {
      void runKbRetrieval(query, RETRIEVAL_RESULT_LIMIT);
    }
  }, [clearKbRetrieval, runKbRetrieval]);

  // Hydrate the knowledge graph from the local store on boot (Phase 1).
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    (async () => {
      try {
        const total = await kgStore.countNodes();
        if (total > 0) {
          // Phase 10 Slice 10.1: stream nodes in pages so a large store renders
          // progressively and never blocks boot. Edges are set first so links
          // appear as their endpoints arrive (Edges3D skips missing endpoints).
          // A small graph (< one page) arrives in a single batch — identical to
          // the previous single setNodes().
          const pe = await kgStore.getAllEdges();
          setEdges(pe);
          const acc: AppNode[] = [];
          await kgStore.streamNodes((page) => {
            for (const n of page) acc.push(n);
            setNodes(acc.slice());
          }, 1000);
        } else {
          await kgStore.putNodes(initialNodes);
          await kgStore.putEdges(initialEdges as Edge[]);
        }
      } catch {
        /* store unavailable — continue in-memory */
      }
    })();
  }, []);

  /* ---- tasks ---- */
  const [tasks, setTasks] = useState<WorkTask[]>([initialTask]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const [activeTaskId, setActiveTaskId] = useState(initialTask.id);
  const activeTaskIdRef = useRef(activeTaskId);
  activeTaskIdRef.current = activeTaskId;
  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeTaskId) ?? tasks[0],
    [tasks, activeTaskId],
  );

  const patchTask = useCallback((id: string, fn: (t: WorkTask) => WorkTask) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  const addTask = useCallback((kind: WorkTask['kind']) => {
    const id = `task-${uuidv4().slice(0, 6)}`;
    const names: Record<WorkTask['kind'], string> = {
      analysis: 'DOC ANALYSIS',
      research: 'RESEARCH THREAD',
      codegen: 'CODE WORKSPACE',
    };
    const agents: Record<WorkTask['kind'], string> = {
      analysis: 'ANALYST',
      research: 'SCOUT',
      codegen: 'ARTIFICER',
    };
    const task: WorkTask = {
      id,
      name: names[kind],
      kind,
      agent: `${agents[kind]}-${Math.floor(Math.random() * 9) + 1}`,
      messages: [],
      activity: [],
      session: {
        id: `sess-${uuidv4().slice(0, 6)}`,
        caps: { browser: true, tools: true, network: true, filesystem: true },
      },
    };
    setTasks((ts) => [...ts, task]);
    setActiveTaskId(id);
  }, []);

  const setTabCap = useCallback((taskId: string, cap: keyof TabCaps, value: boolean) => {
    setTasks((ts) =>
      ts.map((t) =>
        t.id === taskId
          ? { ...t, session: { ...t.session, caps: { ...t.session.caps, [cap]: value } } }
          : t,
      ),
    );
  }, []);

  const closeTask = useCallback(
    (id: string) => {
      poolReleaseAll(id);
      setTasks((ts) => {
        if (ts.length <= 1) return ts;
        const next = ts.filter((t) => t.id !== id);
        if (id === activeTaskId) setActiveTaskId(next[0].id);
        return next;
      });
    },
    [activeTaskId],
  );

  /* ---- endpoints / profiles / gates (persisted) ---- */
  const [endpoints, setEndpoints] = useState<Endpoint[]>(() => loadEndpoints());
  const endpointsRef = useRef(endpoints);
  endpointsRef.current = endpoints;
  const [profiles, setProfiles] = useState<ConfigProfile[]>(() => loadProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string>(() => loadActiveProfileId());
  const [gates, setGates] = useState<SecurityGates>(() => loadGates());
  const gatesRef = useRef(gates);
  // 8.5: apply admin policy ceiling — gatesRef always holds the policy-constrained value
  const [adminPolicy, setAdminPolicy] = useState<AdminPolicy>(() => loadPolicy());
  gatesRef.current = applyPolicy(adminPolicy, gates);
  const [siemConfig, setSiemConfigState] = useState<SiemConfig | null>(() => loadSiemConfig());

  // Save config (endpoints, presets, active preset, gates) whenever it changes.
  useEffect(() => {
    saveConfig({ endpoints, profiles, activeProfileId, gates });
  }, [endpoints, profiles, activeProfileId, gates]);

  // Mirror the gate state into the Rust shell so it enforces the gates at the
  // process level (Phase 1.3), not just in the UI. No-op in a plain browser.
  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    let cancelled = false;
    import('@tauri-apps/api/core')
      .then(({ invoke }) =>
        invoke<EffectiveGateState>('set_gates', {
          filesystem: gates.filesystem,
          network: gates.network,
          tools: gates.tools,
        }),
      )
      .then((effective) => {
        if (cancelled) return;
        setGates((current) => {
          if (
            current.filesystem === effective.filesystem &&
            current.network === effective.network &&
            current.tools === effective.tools
          ) {
            return current;
          }
          return {
            filesystem: effective.filesystem,
            network: effective.network,
            tools: effective.tools,
          };
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [gates]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? profiles[0],
    [profiles, activeProfileId],
  );
  const activeEndpoint = useMemo(
    () => endpoints.find((e) => e.id === activeProfile.endpointId) ?? endpoints[0],
    [endpoints, activeProfile],
  );

  const updateProfile = useCallback((id: string, patch: Partial<ConfigProfile>) => {
    setProfiles((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const setEndpointModel = useCallback((endpointId: string, model: string) => {
    setEndpoints((eps) => eps.map((e) => (e.id === endpointId ? { ...e, model } : e)));
  }, []);

  const updateEndpoint = useCallback((id: string, patch: Partial<Endpoint>) => {
    setEndpoints((eps) => eps.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const addProfile = useCallback(() => {
    const id = `profile-${uuidv4().slice(0, 6)}`;
    setProfiles((ps) => {
      const base = ps.find((p) => p.id === activeProfileId) ?? ps[0];
      return [...ps, { ...base, id, name: 'NEW PRESET' }];
    });
    setActiveProfileId(id);
  }, [activeProfileId]);

  const deleteProfile = useCallback(
    (id: string) => {
      setProfiles((ps) => {
        if (ps.length <= 1) return ps; // always keep at least one preset
        const next = ps.filter((p) => p.id !== id);
        if (id === activeProfileId) setActiveProfileId(next[0].id);
        return next;
      });
    },
    [activeProfileId],
  );

  const toggleGate = useCallback((k: keyof SecurityGates) => {
    if (!canToggleGates(currentUser?.role)) return; // 8.2: admin-only
    setGates((g) => ({ ...g, [k]: !g[k] }));
  }, [currentUser]);

  const setSiemConfig = useCallback((cfg: SiemConfig | null) => {
    saveSiemConfig(cfg);
    setSiemConfigState(cfg);
    // reconfigure the live forwarder immediately
    configureSiem(cfg, () => gatesRef.current.network);
  }, []);

  const togglePolicyLock = useCallback((k: keyof SecurityGates) => {
    // 8.5: admin can lock gates closed via the policy ceiling
    if (currentUser?.role !== 'admin') return;
    setAdminPolicy((p) => {
      const next = { ...p, [k]: p[k] === false ? undefined : false };
      savePolicy(next);
      return next;
    });
  }, [currentUser]);

  const refreshEndpoints = useCallback(async () => {
    setEndpoints((eps) => eps.map((e) => ({ ...e, status: 'configuring' as const })));
    type Probe = {
      id: string;
      status: Endpoint['status'];
      detail: string;
      models?: string[];
      model?: string;
    };
    const results: Probe[] = await Promise.all(
      endpointsRef.current.map(async (e): Promise<Probe> => {
        if (e.kind === 'a2a') {
          const info = await getSidecarInfo();
          const ready = !!info && info.status === 'ready';
          return {
            id: e.id,
            status: ready ? 'ready' : 'offline',
            detail: info?.status ?? 'sidecar (desktop only)',
          };
        }
        if (!gates.network && reachesNetwork(e)) {
          return { id: e.id, status: 'offline', detail: 'network gate closed' };
        }
        const r = await pingEndpoint(e);
        if (!r.ok) return { id: e.id, status: 'error', detail: r.detail };
        // Reachable — find out which models are actually installed and make sure
        // the selected one exists. A missing model is the #1 cause of "READY but
        // it won't answer" (the probe hits /api/tags, which is fine even when the
        // configured model isn't downloaded).
        const list = await listModels(e);
        let model: string | undefined;
        let detail = r.detail;
        if (list.length) {
          const current = e.model;
          model = list.includes(current) ? current : list[0];
          detail = `${list.length} model(s)`;
        }
        return {
          id: e.id,
          status: 'ready',
          detail,
          models: list.length ? list : undefined,
          model,
        };
      }),
    );
    setEndpoints((eps) =>
      eps.map((e) => {
        const r = results.find((x) => x.id === e.id);
        if (!r) return e;
        return {
          ...e,
          status: r.status,
          detail: r.detail,
          ...(r.models ? { models: r.models } : {}),
          ...(r.model ? { model: r.model } : {}),
        };
      }),
    );
  }, [gates.network]);

  /* ---- chat ---- */
  const [sending, setSending] = useState(false);
  const [showActivity, setShowActivity] = useState(true);
  const [runningModel, setRunningModel] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const pushActivity = useCallback(
    (taskId: string, kind: ActivityKind, text: string) => {
      patchTask(taskId, (t) => ({
        ...t,
        activity: [
          ...t.activity,
          { id: uuidv4().slice(0, 8), ts: Date.now(), kind, text },
        ].slice(-60),
      }));
    },
    [patchTask],
  );

  const buildSemanticIndex = useCallback(async () => {
    if (semanticIndexing) return;
    setSemanticIndexing(true);
    setSemanticError('');
    try {
      const result = await kbEmbedMissing({ workspaceId: activeKbWorkspaceId() });
      if (result.error) {
        setSemanticError(result.error);
        setSemanticStatus((current) => ({
          ...current,
          provider: result.provider,
          model: result.model,
          dimension: result.dimension ?? current.dimension,
          ready: false,
          state: 'unavailable',
          lastError: result.error,
        }));
      }
      await refreshSemanticStatus();
      if (result.error) {
        setSemanticError(result.error);
        setSemanticStatus((current) => ({
          ...current,
          provider: result.provider,
          model: result.model,
          dimension: result.dimension ?? current.dimension,
          ready: false,
          state: 'unavailable',
          lastError: result.error,
        }));
      }
      pushActivity(
        activeTaskIdRef.current,
        'system',
        result.error
          ? `semantic kb unavailable: ${result.error}`
          : `semantic kb: ${result.embeddedCount} chunk embedding(s) stored`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'semantic indexing unavailable';
      setSemanticError(reason);
      setSemanticStatus((current) => ({
        ...current,
        ready: false,
        state: 'unavailable',
        lastError: reason,
      }));
      pushActivity(activeTaskIdRef.current, 'system', `semantic kb unavailable: ${reason}`);
    } finally {
      setSemanticIndexing(false);
    }
  }, [refreshSemanticStatus, semanticIndexing, pushActivity]);

  /* ---- KG write chokepoint (gated + audited, Phase 1) ---- */
  const commit = useCallback(
    (spec: {
      action: AuditAction;
      node?: AppNode;
      removeNodeId?: string;
      actor: AuditActor;
      diff?: string;
      provenance?: { source?: string; ingestionId?: string };
    }): boolean => {
      // 8.2: viewers have read-only access — deny before gate check
      if (!canWrite(currentUser?.role)) {
        pushActivity(activeTaskId, 'system', 'KG write denied — viewer role');
        return false;
      }
      const targetId = spec.node?.id ?? spec.removeNodeId ?? 'unknown';
      const decision = evaluateKgWrite(gatesRef.current);
      kgStore
        .appendAudit(
          makeAudit({
            actor: spec.actor,
            action: spec.action,
            target: { kind: 'node', id: targetId },
            decision,
            diff: spec.diff,
            provenance: spec.provenance,
          }),
        )
        .catch(() => {});
      if (!decision.allowed) {
        pushActivity(activeTaskId, 'system', `KG write denied — ${decision.reason}`);
        return false;
      }
      if (spec.removeNodeId) {
        const rid = spec.removeNodeId;
        setNodes((nds) => nds.filter((n) => n.id !== rid));
        kgStore.deleteNode(rid).catch(() => {});
      }
      if (spec.node) {
        const nn = spec.node;
        setNodes((nds) =>
          nds.some((n) => n.id === nn.id) ? nds.map((n) => (n.id === nn.id ? nn : n)) : nds.concat(nn),
        );
        kgStore.putNodes([nn]).catch(() => {});
      }
      return true;
    },
    [activeTaskId, pushActivity],
  );

  const updateNodeData = useCallback(
    (id: string, data: NodeData) => {
      const cur = nodesRef.current.find((n) => n.id === id);
      if (!cur) return;
      commit({
        action: 'update',
        node: { ...cur, data },
        actor: { kind: 'user', id: currentUser?.id ?? 'local', taskId: activeTaskId },
        diff: `edit ${cur.data.label}`,
      });
    },
    [commit, activeTaskId],
  );

  const mergeKbGraphProjection = useCallback(
    async (documentId: string): Promise<{ nodes: number; edges: number; connected: boolean }> => {
      if (!canWrite(currentUser?.role)) {
        pushActivity(activeTaskId, 'system', 'KB graph projection denied - viewer role');
        return { nodes: 0, edges: 0, connected: false };
      }
      const projection = await kbGraphProjection({
        workspaceId: activeKbWorkspaceId(),
        documentId,
      });
      const connected = hasConnectedKbProjection(projection);
      const reconciled = upsertKbGraphProjection(nodesRef.current, edgesRef.current, projection);
      const projectedNodes = reconciled.nodes.filter((node) => node.data.src === 'SQLite KB');
      const projectedEdges = reconciled.edges.filter((edge) => edge.id.startsWith('kb_edge_') || edge.id.startsWith('rel_'));
      if (!projectedNodes.length) return { nodes: 0, edges: 0, connected };

      const decision = evaluateKgWrite(gatesRef.current);
      await kgStore.appendAudit(
        makeAudit({
          actor: { kind: 'system', id: 'sqlite-kb', taskId: activeTaskId },
          action: 'create',
          target: { kind: 'node', id: documentId },
          decision,
          diff: `project SQLite KB document ${documentId} into graph`,
          provenance: { source: 'SQLite KB', ingestionId: documentId },
        }),
      );
      if (!decision.allowed) {
        pushActivity(activeTaskId, 'system', `KB graph projection denied - ${decision.reason}`);
        return { nodes: 0, edges: 0, connected: false };
      }

      setNodes(reconciled.nodes);
      setEdges(reconciled.edges);
      await Promise.all([
        ...reconciled.removedNodeIds.map((id) => kgStore.deleteNode(id)),
        ...reconciled.removedEdgeIds.map((id) => kgStore.deleteEdge(id)),
        kgStore.putNodes(projectedNodes),
        kgStore.putEdges(projectedEdges),
      ]);
      return { nodes: projectedNodes.length, edges: projectedEdges.length, connected };
    },
    [activeTaskId, currentUser?.role, pushActivity],
  );

  const deleteKbDocument = useCallback(
    async (documentId: string) => {
      if (!canWrite(currentUser?.role)) {
        pushActivity(activeTaskId, 'system', 'KB delete denied - viewer role');
        return;
      }
      const deletion = await kbDeleteDocument({ documentId, mode: 'soft' });
      const projection = await kbGraphProjection({ workspaceId: activeKbWorkspaceId() });
      const reconciled = reconcileKbGraphProjection(nodesRef.current, edgesRef.current, projection, {
        preserveExistingPositions: true,
      });
      setNodes(reconciled.nodes);
      setEdges(reconciled.edges);
      await Promise.all([
        ...reconciled.removedNodeIds.map((id) => kgStore.deleteNode(id)),
        ...reconciled.removedEdgeIds.map((id) => kgStore.deleteEdge(id)),
        kgStore.putNodes(reconciled.nodes.filter((node) => node.data.src === 'SQLite KB')),
        kgStore.putEdges(reconciled.edges.filter((edge) => edge.id.startsWith('kb_edge_') || edge.id.startsWith('rel_'))),
      ]);
      await kgStore.appendAudit(
        makeAudit({
          actor: { kind: 'user', id: currentUser?.id ?? 'local', taskId: activeTaskId },
          action: 'delete',
          target: { kind: 'node', id: documentId },
          decision: { allowed: true, gate: 'filesystem' },
          diff: `soft delete SQLite KB document ${documentId}`,
          provenance: { source: 'SQLite KB', ingestionId: documentId },
        }),
      );
      await Promise.all([refreshKbStats(), refreshKbDocuments(), refreshSemanticStatus()]);
      const nextRetrieval = retrievedContextAfterDocumentDelete(
        {
          query: retrievalQuery,
          results: kbSearchResults,
          attachEnabled: retrievalEnabledForChat,
          mode: retrievalMode,
        },
        documentId,
      );
      setKbSearchResults(nextRetrieval.results);
      setRetrievalQuery(nextRetrieval.query);
      setRetrievalEnabledForChatState(nextRetrieval.attachEnabled);
      pushActivity(
        activeTaskId,
        'system',
        `sqlite kb: soft-deleted ${deletion.documentId}; removed ${reconciled.removedNodeIds.length} graph node(s)`,
      );
    },
    [
      activeTaskId,
      currentUser?.id,
      currentUser?.role,
      kbSearchResults,
      pushActivity,
      refreshKbDocuments,
      refreshKbStats,
      refreshSemanticStatus,
      retrievalEnabledForChat,
      retrievalMode,
      retrievalQuery,
    ],
  );

  const stabilizeGraphLayout = useCallback(async () => {
    const projection = await kbGraphProjection({ workspaceId: activeKbWorkspaceId() });
    const reconciled = reconcileKbGraphProjection(nodesRef.current, edgesRef.current, projection, {
      preserveExistingPositions: false,
    });
    setNodes(reconciled.nodes);
    setEdges(reconciled.edges);
    await Promise.all([
      ...reconciled.removedNodeIds.map((id) => kgStore.deleteNode(id)),
      ...reconciled.removedEdgeIds.map((id) => kgStore.deleteEdge(id)),
      kgStore.putNodes(reconciled.nodes.filter((node) => node.data.src === 'SQLite KB')),
      kgStore.putEdges(reconciled.edges.filter((edge) => edge.id.startsWith('kb_edge_') || edge.id.startsWith('rel_'))),
    ]);
    pushActivity(
      activeTaskId,
      'system',
      `graph stabilized: ${reconciled.removedNodeIds.length} stale KB node(s) cleaned`,
    );
  }, [activeTaskId, pushActivity]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const taskId = activeTaskId;
      const ep = activeEndpoint;

      const userMsg: ChatMessage = {
        id: uuidv4().slice(0, 8),
        role: 'user',
        content: trimmed,
        ts: Date.now(),
      };
      const asstId = uuidv4().slice(0, 8);
      const asstMsg: ChatMessage = {
        id: asstId,
        role: 'assistant',
        content: '',
        ts: Date.now(),
        streaming: true,
      };

      patchTask(taskId, (t) => ({ ...t, messages: [...t.messages, userMsg, asstMsg] }));
      setSending(true);
      pushActivity(taskId, 'query', `routing to ${ep.label} (${ep.kind})`);

      const retrievalForMessage = retrievalEnabledForChat
        ? kbSearchResults.slice(0, RETRIEVAL_CHAT_RESULT_LIMIT)
        : [];
      const hasAttachedRetrieval = retrievalEnabledForChat && retrievalForMessage.length > 0;
      const promptText = buildOptionalChatPromptWithRetrievedContext(
        trimmed,
        retrievalForMessage,
        hasAttachedRetrieval,
        retrievalMode,
      );
      if (hasAttachedRetrieval) {
        pushActivity(taskId, 'query', `${retrievalMode} retrieval: ${retrievalForMessage.length} local KB chunk(s) attached`);
      }

      const baseTask = tasks.find((t) => t.id === taskId);
      const turns: ChatTurn[] = (baseTask?.messages ?? [])
        .filter((m) => m.role !== 'system' && m.role !== 'tool')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      turns.push({ role: 'user', content: promptText });
      // Tell the model its TRUE identity — the exact model we route to, which the
      // app also verifies the server actually ran. Accurate self-knowledge, not a
      // hardcoded guess. (Some local models otherwise parrot Qwen/NVIDIA/etc.)
      const systemTurns: ChatTurn[] = [{
        role: 'system',
        content:
          `You are "${ep.model}", a large language model running locally through the ` +
          `CODE NAME desktop app. If asked what model or AI you are, identify yourself as ` +
          `"${ep.model}". Do not claim to be a different model, company, or product.`,
      }];
      if (hasAttachedRetrieval) {
        systemTurns.push({
          role: 'system',
          content:
            'Use the Local SQLite KB context when it is relevant. If the provided chunks are insufficient, say so plainly. Source labels like [KB1] identify the retrieved local chunks.',
        });
      }
      turns.unshift(...systemTurns);

      const ctl = new AbortController();
      abortRef.current = ctl;

      if (!gates.network && reachesNetwork(ep)) {
        patchTask(taskId, (t) => ({
          ...t,
          messages: t.messages.map((m) =>
            m.id === asstId
              ? {
                  ...m,
                  streaming: false,
                  content:
                    '[BLOCKED] Network gate is closed. Outbound cloud routing is severed at the bridge. Re-open the Network gate in the stealth drawer or switch to a local endpoint.',
                }
              : m,
          ),
        }));
        pushActivity(taskId, 'system', 'network gate closed — cloud route severed');
        setSending(false);
        abortRef.current = null;
        return;
      }

      // Route to the local agent sidecar over A2A when that endpoint is active.
      if (ep.kind === 'a2a') {
        if (!gates.tools) {
          patchTask(taskId, (t) => ({
            ...t,
            messages: t.messages.map((m) =>
              m.id === asstId
                ? {
                    ...m,
                    streaming: false,
                    content:
                      '[BLOCKED] Tool-execution gate is closed. The agent sidecar bridge is severed. Re-open the Tools gate to route to the sidecar.',
                  }
                : m,
            ),
          }));
          pushActivity(taskId, 'system', 'tools gate closed — sidecar bridge severed');
          setSending(false);
          abortRef.current = null;
          return;
        }
        try {
          const info = await getSidecarInfo();
          if (!info || info.status !== 'ready') throw new Error('sidecar not ready');
          pushActivity(taskId, 'network', `A2A → ${info.host}:${info.port} (token held in shell)`);
          await streamFromSidecar(
            promptText,
            async (tok) => {
              // Tool call event from sidecar (Slice 3.4): execute via WebMCP guard + audit,
              // then post the result back so the ADK tool proxy can unblock.
              if (tok.startsWith('{"__tool_call__":')) {
                try {
                  const tc = JSON.parse(tok) as {
                    id: string;
                    name: string;
                    args: Record<string, unknown>;
                  };
                  // Push a tool bubble (in-flight — no result yet).
                  const toolMsgId = `tool-${uuidv4().slice(0, 8)}`;
                  const toolMsgContent = JSON.stringify({ name: tc.name, args: tc.args });
                  patchTask(taskId, (t) => ({
                    ...t,
                    messages: [
                      ...t.messages,
                      { id: toolMsgId, role: 'tool' as const, content: toolMsgContent, ts: Date.now() },
                    ],
                  }));
                  pushActivity(taskId, 'tool', `agent → ${tc.name}(${JSON.stringify(tc.args)})`);
                  const result = await executeTool(tc.name, tc.args);
                  const resultText = result.content.map((c) => c.text).join('');
                  // Update tool bubble with result.
                  patchTask(taskId, (t) => ({
                    ...t,
                    messages: t.messages.map((m) =>
                      m.id === toolMsgId
                        ? { ...m, content: JSON.stringify({ name: tc.name, args: tc.args, result: resultText }) }
                        : m,
                    ),
                  }));
                  await sidecarToolResult(tc.id, resultText);
                } catch {
                  /* ignore — tool proxy times out gracefully */
                }
                return;
              }
              // Normal text token — append to the assistant message.
              patchTask(taskId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === asstId ? { ...m, content: m.content + tok } : m,
                ),
              }));
            },
            { model: activeEndpoint.model, temperature: activeProfile.temperature },
          );
        } catch (err) {
          patchTask(taskId, (t) => ({
            ...t,
            messages: t.messages.map((m) =>
              m.id === asstId
                ? {
                    ...m,
                    content:
                      m.content ||
                      `[SIDECAR OFFLINE] ${err instanceof Error ? err.message : 'unavailable'}. Run the desktop app (npm run tauri dev) so the Rust supervisor can launch the Python sidecar.`,
                  }
                : m,
            ),
          }));
        } finally {
          patchTask(taskId, (t) => ({
            ...t,
            messages: t.messages.map((m) => (m.id === asstId ? { ...m, streaming: false } : m)),
          }));
          setSending(false);
          abortRef.current = null;
        }
        return;
      }

      let servedModel = '';
      try {
        await streamChat(ep, activeProfile, turns, {
          signal: ctl.signal,
          onActivity: (kind, t) => pushActivity(taskId, kind, t),
          onModel: (m) => {
            servedModel = m;
            setRunningModel(m);
          },
          onToken: (tok) =>
            patchTask(taskId, (t) => ({
              ...t,
              messages: t.messages.map((m) =>
                m.id === asstId ? { ...m, content: m.content + tok } : m,
              ),
            })),
        });
      } finally {
        patchTask(taskId, (t) => ({
          ...t,
          messages: t.messages.map((m) => (m.id === asstId ? { ...m, streaming: false } : m)),
        }));
        setSending(false);
        abortRef.current = null;
      }
      // Truth check: confirm the server actually ran the model we requested. If it
      // substituted a different one (e.g. LM Studio serving its already-loaded
      // model), say so plainly instead of pretending — the chosen model must be
      // the one that actually runs.
      const wanted = ep.model.toLowerCase();
      const got = servedModel.toLowerCase();
      if (servedModel && got !== wanted && !got.includes(wanted) && !wanted.includes(got)) {
        pushActivity(
          taskId,
          'system',
          `model mismatch — requested "${ep.model}", server ran "${servedModel}"`,
        );
        patchTask(taskId, (t) => ({
          ...t,
          messages: [
            ...t.messages,
            {
              id: uuidv4().slice(0, 8),
              role: 'system' as const,
              content:
                `⚠ Model mismatch: you selected "${ep.model}", but the server actually ran ` +
                `"${servedModel}" — the reply above came from "${servedModel}", not your choice. ` +
                `To run the model you pick: in LM Studio turn on "Just-In-Time model loading" (or load ` +
                `"${ep.model}" there). Ollama loads the requested model automatically.`,
              ts: Date.now(),
            },
          ],
        }));
      }
    },
    [
      sending,
      activeTaskId,
      activeEndpoint,
      activeProfile,
      gates.network,
      gates.tools,
      kbSearchResults,
      retrievalEnabledForChat,
      retrievalMode,
      patchTask,
      pushActivity,
      tasks,
    ],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    cancelSidecar();
  }, []);

  /* ---- ingestion ---- */
  const [quarantine, setQuarantine] = useState<QuarantineItem[]>([]);
  const quarantineRef = useRef(quarantine);
  quarantineRef.current = quarantine;

  const clearLedger = useCallback(() => {
    // Remove resolved entries; keep anything still in-flight (checking / ready / conflict).
    setQuarantine((q) => q.filter((it) => it.status === 'checking' || it.status === 'ready' || it.status === 'conflict'));
  }, []);

  const createDocNode = useCallback(
    (name: string, text: string, hash: string): string => {
      const id = `doc-${uuidv4().slice(0, 8)}`;
      const node: AppNode = {
        id,
        type: 'doc',
        position: { x: 200 + Math.random() * 320, y: 160 + Math.random() * 320 },
        data: {
          label: `DOC_${id.slice(4).toUpperCase()}`,
          type: 'INGEST',
          title: name,
          description: text,
          class: 'UNCLASSIFIED',
          hash,
          currentVersion: 1,
          history: [
            {
              version: 1,
              timestamp: Date.now(),
              changes: 'Gated ingestion',
              snap: { title: name, class: 'UNCLASSIFIED', hash },
            },
          ],
        },
        style: NODE_STYLE,
      };
      commit({
        action: 'create',
        node,
        actor: { kind: 'system', id: 'ingest', taskId: activeTaskId },
        diff: `ingest ${name}`,
        provenance: { source: name, ingestionId: id },
      });
      return id;
    },
    [commit, activeTaskId],
  );

  // Install the WebMCP shim and register built-in, gate-routed tools (Phase 4).
  useEffect(() => {
    // Phase 6 (Slices 6.1 / 6.2): wire real sidecar context lifecycle into the pool.
    // If sidecar is offline, sidecarPoolCreate returns null and the lease stays a safe placeholder.
    configurePoolBackend(
      async (kind, taskId, leaseId) => {
        const r = await sidecarPoolCreate(kind, taskId, leaseId);
        return r?.handle ?? null;
      },
      async (handle) => {
        await sidecarPoolRelease(handle);
      },
    );
    // 8.6: configure SIEM forwarder with live network-gate check
    configureSiem(loadSiemConfig(), () => gatesRef.current.network);
    installWebMcp();
    setToolGuard(() => {
      const task = tasksRef.current.find((t) => t.id === activeTaskIdRef.current);
      const caps = task?.session.caps ?? { browser: true, tools: true, network: true, filesystem: true };
      const eff = effectiveGates(gatesRef.current, caps, adminPolicy);
      if (!canUseTool(currentUser?.role)) return { allowed: false, reason: 'viewer role — tools not permitted' };
      return eff.tools ? { allowed: true } : { allowed: false, reason: 'tools gate/scope closed' };
    });
    setToolLogger((name, allowed, detail) =>
      pushActivity(
        activeTaskIdRef.current,
        'tool',
        `${allowed ? 'tool' : 'tool blocked'}: ${name}${detail ? ` (${detail})` : ''}`,
      ),
    );
    const ctl = new AbortController();
    registerTool(
      {
        name: 'graph.search',
        description: 'Search the knowledge graph with local lexical and legacy hash-vector filtering.',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        execute: async (args) => {
          retriever.index(nodesRef.current);
          const query = String(args.query ?? '');
          const hits = retriever.retrieve(query, 8).map((h) => {
            const n = nodesRef.current.find((x) => x.id === h.id);
            return n ? `${n.data.label}: ${n.data.title ?? n.data.name ?? ''}` : h.id;
          });
          return { content: [{ type: 'text', text: hits.length ? hits.join('\n') : 'no matches' }] };
        },
      },
      { signal: ctl.signal },
    );
    registerTool(
      {
        name: 'graph.note',
        description: 'Create a note node in the knowledge graph (gated + audited).',
        inputSchema: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['title'] },
        execute: (args) => {
          const id = createDocNode(String(args.title ?? 'NOTE'), String(args.text ?? ''), `note:${Date.now()}`);
          return { content: [{ type: 'text', text: `created ${id}` }] };
        },
      },
      { signal: ctl.signal },
    );
    registerTool(
      {
        name: 'graph.get',
        description: 'Read a node from the knowledge graph by id or label.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } } },
        execute: (args) => {
          const node = nodesRef.current.find(
            (n) => n.id === String(args.id ?? '') || n.data.label === String(args.label ?? ''),
          );
          if (!node) return { content: [{ type: 'text', text: 'not found' }] };
          return { content: [{ type: 'text', text: JSON.stringify(node.data) }] };
        },
      },
      { signal: ctl.signal },
    );
    registerTool(
      {
        name: 'graph.link',
        description: 'Connect two nodes in the knowledge graph with a directed edge (filesystem-gated + audited).',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            target: { type: 'string' },
            label: { type: 'string' },
          },
          required: ['source', 'target'],
        },
        execute: (args) => {
          const src = String(args.source ?? '');
          const tgt = String(args.target ?? '');
          if (!nodesRef.current.find((n) => n.id === src))
            return { content: [{ type: 'text', text: `source not found: ${src}` }] };
          if (!nodesRef.current.find((n) => n.id === tgt))
            return { content: [{ type: 'text', text: `target not found: ${tgt}` }] };
          const decision = evaluateKgWrite(gatesRef.current);
          const edgeId = `e-${uuidv4().slice(0, 8)}`;
          const record = makeAudit({
            actor: { kind: 'agent', id: 'webmcp', taskId: activeTaskIdRef.current },
            action: 'link' as AuditAction,
            target: { kind: 'edge', id: edgeId },
            decision,
            diff: `link ${src} → ${tgt}`,
          });
          void kgStore.appendAudit(record);
          if (!decision.allowed) {
            return { content: [{ type: 'text', text: '[blocked] filesystem gate closed' }] };
          }
          setEdges((es) =>
            addEdge({ id: edgeId, source: src, target: tgt, label: args.label as string | undefined }, es),
          );
          void kgStore.putEdges([{ id: edgeId, source: src, target: tgt }]);
          pushActivity(activeTaskIdRef.current, 'tool', `graph.link ${src} → ${tgt}`);
          return { content: [{ type: 'text', text: `linked ${edgeId}: ${src} → ${tgt}` }] };
        },
      },
      { signal: ctl.signal },
    );
    registerTool(
      {
        name: 'ingest.text',
        description: 'Ingest raw text as a document node — equivalent to dropping a .txt file (filesystem-gated + audited).',
        inputSchema: {
          type: 'object',
          properties: { title: { type: 'string' }, text: { type: 'string' } },
          required: ['title', 'text'],
        },
        execute: (args) => {
          const id = createDocNode(
            String(args.title ?? 'AGENT_DOC'),
            String(args.text ?? ''),
            `agent:${Date.now()}`,
          );
          pushActivity(activeTaskIdRef.current, 'tool', `ingest.text → ${id}`);
          return { content: [{ type: 'text', text: `ingested as ${id}` }] };
        },
      },
      { signal: ctl.signal },
    );
    registerTool(
      {
        name: 'ui.render',
        description: 'Render an A2UI payload into the Agent UI panel.',
        inputSchema: { type: 'object', properties: { root: { type: 'string' }, components: { type: 'array' } }, required: ['root', 'components'] },
        execute: (args) => {
          setAgentUI(activeTaskIdRef.current, args as unknown as A2UIPayload);
          return { content: [{ type: 'text', text: 'rendered' }] };
        },
      },
      { signal: ctl.signal },
    );
    registerTool(
      {
        name: 'browser.open',
        description: 'Open a URL via the shared Browser Harness pool (per-tab isolated context).',
        inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
        execute: async (args) => {
          const taskId = activeTaskIdRef.current;
          const task = tasksRef.current.find((t) => t.id === taskId);
          if (!task?.session.caps.browser) {
            return { content: [{ type: 'text', text: '[blocked] this tab lacks BROWSER permission' }] };
          }
          const lz = poolLease('browser', taskId);
          if (!lz.ok) return { content: [{ type: 'text', text: `[blocked] ${lz.reason}` }] };
          const url = String(args.url ?? '');
          pushActivity(taskId, 'tool', `browser ctx ${lz.id} → ${url}`);
          // Forward to sidecar CDP harness (Phase 5, Slice 5.4).
          const result = await sidecarBrowserOpen(url);
          // Audit any harness-written files (Phase 5, Slice 5.5).
          if (result.harness_files?.length) {
            for (const hf of result.harness_files) {
              const hRecord = makeAudit({
                actor: { kind: 'system', id: 'browser-harness', taskId },
                action: 'create' as AuditAction,
                target: { kind: 'file' as const, id: hf.path },
                decision: { allowed: true, gate: 'filesystem' },
                diff: `harness file: ${hf.path} (${hf.size} bytes)`,
                provenance: { source: 'browser-harness' },
              });
              void kgStore.appendAudit(hRecord);
              pushActivity(taskId, 'system', `harness wrote: ${hf.path}`);
            }
          }
          if (result.error) {
            return { content: [{ type: 'text', text: result.error }] };
          }
          const summary = result.text?.trim() || '(no text content)';
          return {
            content: [{ type: 'text', text: `[${url}]\n${summary}` }],
          };
        },
      },
      { signal: ctl.signal },
    );
    // Local-first degradation self-check -> activity feed (Phase 6).
    runSelfCheck().then((rs) =>
      rs.forEach((r) =>
        pushActivity(activeTaskIdRef.current, 'system', `selfcheck ${r.ok ? 'ok' : 'warn'}: ${r.name} — ${r.detail}`),
      ),
    );
    return () => ctl.abort();
  }, [createDocNode, pushActivity]);

  const ingestFiles = useCallback(
    async (files: File[]) => {
      if (!gatesRef.current.filesystem) {
        pushActivity(activeTaskId, 'system', 'filesystem gate closed — ingestion blocked');
        const blocked: QuarantineItem = {
          id: uuidv4().slice(0, 8),
          name: `${files.length} file(s)`,
          size: 0,
          hash: '—',
          status: 'rejected',
          note: 'Filesystem gate closed',
        };
        setQuarantine((q) => [blocked, ...q].slice(0, 50));
        return;
      }

      for (const file of files) {
        const itemId = uuidv4().slice(0, 8);
        const staged: QuarantineItem = {
          id: itemId,
          name: file.name,
          size: file.size,
          hash: '…',
          status: 'checking',
        };
        setQuarantine((q) => [staged, ...q].slice(0, 50));
        pushActivity(activeTaskId, 'tool', `staging ${file.name}`);

        const hash = await hashFile(file);
        let text = '';
        try {
          if (file.type.startsWith('text/') || /\.(txt|md|json|csv|js|ts|tsx|py)$/i.test(file.name)) {
            text = (await file.text()).slice(0, 4000);
          } else {
            text = `[binary asset · ${file.type || 'unknown'} · ${file.size} bytes]`;
          }
        } catch {
          text = '[unreadable]';
        }

        try {
          const kbResult = await kbIngestText({
            workspaceId: activeKbWorkspaceId(),
            title: file.name,
            text,
            sourceUri: file.name,
            sourceKind: 'file',
            mimeType: file.type || 'text/plain',
          });
          const projection = await mergeKbGraphProjection(kbResult.documentId);
          await Promise.all([refreshKbStats(), refreshKbDocuments(), refreshSemanticStatus()]);
          pushActivity(activeTaskId, 'system', `sqlite kb: ${kbResult.chunkCount} chunk(s) stored`);
          pushActivity(
            activeTaskId,
            'system',
            projection.connected
              ? `sqlite graph: ${projection.nodes} node(s), ${projection.edges} edge(s) linked`
              : 'sqlite graph: projection produced no visible links',
          );
          setQuarantine((q) =>
            q.map((it) =>
              it.id === itemId
                ? {
                    ...it,
                    hash,
                    status: 'indexed',
                    note: `${kbResult.documentId} - ${projection.nodes} graph nodes`,
                  }
                : it,
            ),
          );
          continue;
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'unavailable';
          pushActivity(activeTaskId, 'system', `sqlite kb unavailable: ${reason}`);
        }

        const conflict = nodesRef.current.find(
          (n) => n.data.hash === hash || n.data.title === file.name,
        );

        if (conflict) {
          setQuarantine((q) =>
            q.map((it) =>
              it.id === itemId
                ? { ...it, hash, status: 'conflict', conflictWith: conflict.id, note: text.slice(0, 120) }
                : it,
            ),
          );
          pushActivity(activeTaskId, 'system', `redundancy detected: ${file.name} ↔ ${conflict.data.label}`);
        } else {
          const nodeId = createDocNode(file.name, text, hash);
          setQuarantine((q) =>
            q.map((it) => (it.id === itemId ? { ...it, hash, status: 'indexed', note: nodeId } : it)),
          );
          pushActivity(activeTaskId, 'tool', `indexed ${file.name} → graph`);
        }
      }
      // After all files ingested, refresh community assignments via sidecar (Slice 4.4).
      void (async () => {
        const allNodes = nodesRef.current;
        const allEdges = edgesRef.current;
        if (allNodes.length < 2) return;
        const nodePayload = allNodes.map((n) => ({
          id: n.id,
          text: [n.data.label, n.data.title, n.data.description].filter(Boolean).join(' '),
        }));
        const edgePayload = allEdges.map((e) => ({ source: e.source, target: e.target }));
        const communities = await sidecarCommunities(nodePayload, edgePayload);
        if (!communities.length) return;
        // Patch communityId + communitySummary onto each node
        for (const comm of communities) {
          for (const memberId of comm.memberIds) {
            const existing = nodesRef.current.find((n) => n.id === memberId);
            if (existing) {
              updateNodeData(memberId, { ...existing.data, communityId: comm.id, communitySummary: comm.summary });
            }
          }
        }
        pushActivity(activeTaskId, 'system', `communities: ${communities.length} detected`);
      })();
    },
    [
      activeTaskId,
      createDocNode,
      mergeKbGraphProjection,
      pushActivity,
      refreshKbDocuments,
      refreshKbStats,
      refreshSemanticStatus,
      updateNodeData,
    ],
  );

  const resolveConflict = useCallback(
    (id: string, action: 'overwrite' | 'skip' | 'fork') => {
      const item = quarantineRef.current.find((it) => it.id === id);
      if (!item) return;

      if (action === 'skip') {
        pushActivity(activeTaskId, 'system', `discarded ${item.name}`);
        setQuarantine((q) => q.map((it) => (it.id === id ? { ...it, status: 'skipped' } : it)));
        return;
      }

      if (action === 'overwrite' && item.conflictWith) {
        const cur = nodesRef.current.find((n) => n.id === item.conflictWith);
        if (cur) {
          const nextVer = (cur.data.currentVersion ?? 1) + 1;
          const updated: AppNode = {
            ...cur,
            data: {
              ...cur.data,
              title: item.name,
              hash: item.hash,
              description: item.note,
              currentVersion: nextVer,
              history: [
                {
                  version: nextVer,
                  timestamp: Date.now(),
                  changes: 'Overwritten via ingestion',
                  snap: { title: item.name, hash: item.hash },
                },
                ...(cur.data.history ?? []),
              ],
            },
          };
          commit({
            action: 'update',
            node: updated,
            actor: { kind: 'system', id: 'ingest', taskId: activeTaskId },
            diff: `overwrite ${cur.data.label}`,
            provenance: { source: item.name },
          });
        }
        pushActivity(activeTaskId, 'tool', `overwrote graph copy with ${item.name}`);
        setQuarantine((q) => q.map((it) => (it.id === id ? { ...it, status: 'indexed' } : it)));
        return;
      }

      if (action === 'fork') {
        const nodeId = createDocNode(`${item.name} (fork)`, item.note ?? '', item.hash);
        pushActivity(activeTaskId, 'tool', `forked ${item.name} → ${nodeId}`);
        setQuarantine((q) => q.map((it) => (it.id === id ? { ...it, status: 'indexed' } : it)));
        return;
      }
    },
    [activeTaskId, createDocNode, pushActivity],
  );

  const value: AppStateValue = {
    /* graph */
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectedNodeId,
    setSelectedNodeId,
    updateNodeData,
    graphQuery,
    setGraphQuery,
    runGraphQuery,
    kbStats: kbStatsState,
    kbDocuments,
    kbSearchResults,
    retrievalQuery,
    retrievalResults: kbSearchResults,
    retrievalMode,
    setRetrievalMode,
    retrievalEnabledForChat,
    setRetrievalEnabledForChat,
    runKbRetrieval,
    clearKbRetrieval,
    semanticStatus,
    semanticIndexing,
    semanticError,
    refreshSemanticStatus,
    buildSemanticIndex,
    refreshKbStats,
    refreshKbDocuments,
    deleteKbDocument,
    stabilizeGraphLayout,
    /* tasks */
    tasks,
    activeTaskId,
    activeTask,
    setActiveTaskId,
    addTask,
    closeTask,
    setTabCap,
    /* chat */
    sending,
    sendMessage,
    abort,
    showActivity,
    setShowActivity,
    runningModel,
    /* endpoints / profiles / gates */
    endpoints,
    profiles,
    activeProfileId,
    setActiveProfileId,
    activeProfile,
    activeEndpoint,
    updateProfile,
    setEndpointModel,
    updateEndpoint,
    addProfile,
    deleteProfile,
    refreshEndpoints,
    gates: applyPolicy(adminPolicy, gates),
    toggleGate,
    adminPolicy,
    togglePolicyLock,
    siemConfig,
    setSiemConfig,
    /* ingestion */
    quarantine,
    ingestFiles,
    resolveConflict,
    clearLedger,
    /* telemetry */
    bootTs,
    watchdogHealth,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
