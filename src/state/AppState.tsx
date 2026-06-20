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
  ModelInventoryEntry,
  NodeData,
  ProviderConnection,
  ProviderFailure,
  RuntimeProvenance,
  RuntimeRequestSnapshot,
  QuarantineItem,
  SecurityGates,
  TabCaps,
  WorkTask,
} from '../types';
import { initialNodes, initialEdges } from '../store';
import { defaultRuntimeProfiles, initialTask } from '../config/defaults';
import {
  loadEndpoints,
  loadProfiles,
  loadActiveProfileId,
  loadGates,
  saveConfig,
} from '../config/persist';
import {
  normalizeRuntimeProfileTuning,
  resolveEffectiveRuntimeTuning,
} from '../config/runtimeTuning';
import { canonicalProviderIdForReference, normalizeProviderConnections } from '../config/runtimeProviders';
import { hashFile } from '../lib/hash';
import {
  canSendWithRuntime,
  classifyProviderFailure,
  discoverProviderModels,
  executionClassForModel,
  executionClassLabel,
  modelEntryForSelection,
  providerStatusLabel,
  reachesNetwork,
  streamChat,
  type ChatTurn,
} from '../lib/llm';
import {
  RETRIEVAL_CHAT_RESULT_LIMIT,
  RETRIEVAL_RESULT_LIMIT,
  buildOptionalChatPromptWithRetrievedContext,
  clearRetrievedContextState,
  retrievedContextAfterDocumentDelete,
  retrievedContextAfterSearch,
  retrievalContextDisplayLabel,
  selectedRetrievalResults,
  updateRouteTraceCounts,
  type RetrievalRouteTrace,
  type RetrievedContextState,
} from '../lib/retrievalContext';
import { routeRetrieval } from '../lib/autoRetrievalRouter';
import {
  activeKbWorkspaceId,
  emptyKbStats,
  emptyKbEmbeddingStatus,
  kbInit,
  kbIngestText,
  kbGraphProjection,
  kbSearch,
  kbSemanticSearch,
  kbHybridSearch,
  kbGraphRagSearch,
  kbEmbeddingStatus,
  kbEmbedMissing,
  kbStats as loadKbStats,
  kbListDocuments,
  kbDeleteDocument,
  type KbDocument,
  type KbEmbeddingStatus,
  type KbResolvedRetrievalMode,
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
import { cancelSidecar } from '../lib/sidecar';
import {
  getTools,
  installWebMcp,
  onToolChange,
  registerTool,
  setToolGuard,
  setToolLogger,
  type ToolMeta,
} from '../lib/webmcp';
import {
  buildRuntimeCapabilityState,
  type RuntimeCapabilityBindingState,
} from '../lib/capabilities';
import { setAgentUI } from '../components/right/a2ui/bus';
import type { A2UIPayload } from '../components/right/a2ui/types';
import { effectiveGates } from '../lib/perms';
import { runSelfCheck } from '../lib/selfcheck';
import { releaseAll as poolReleaseAll } from '../lib/pools';
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

const NO_ACTIVE_PROVIDER: ProviderConnection = {
  id: '',
  label: 'Select provider',
  providerKind: 'custom',
  baseUrl: '',
  requiresNetwork: false,
  requiresSecret: false,
  secretRequirement: 'none',
  status: 'unknown',
  detail: 'No normal chat provider selected.',
  models: [],
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
  retrievalRouteTrace?: RetrievalRouteTrace;
  setRetrievalMode: (mode: KbRetrievalMode) => void;
  retrievalSelectedChunkIds: string[];
  setRetrievalChunkSelected: (chunkId: string, selected: boolean) => void;
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

  /* endpoints / profiles / gates */
  endpoints: ProviderConnection[];
  profiles: ConfigProfile[];
  activeProfileId: string;
  setActiveProfileId: (id: string) => void;
  activeProfile: ConfigProfile;
  activeEndpoint: ProviderConnection;
  activeModel: ModelInventoryEntry | undefined;
  activeRuntimeLabel: string;
  effectiveTemperature: number;
  effectiveContextWindow: number;
  canSend: boolean;
  cannotSendReason: string;
  updateProfile: (id: string, patch: Partial<ConfigProfile>) => void;
  setActiveProvider: (providerId: string) => Promise<void>;
  setActiveModel: (modelId: string) => void;
  setEndpointModel: (endpointId: string, model: string) => void;
  updateEndpoint: (id: string, patch: Partial<Endpoint>) => void;
  updateProviderConnection: (id: string, patch: Partial<ProviderConnection>) => void;
  setRuntimeOverride: (patch: { temperature?: number; contextWindow?: number }) => void;
  clearRuntimeOverrides: () => void;
  addProfile: () => void;
  deleteProfile: (id: string) => void;
  refreshEndpoints: () => Promise<void>;
  refreshProviderModels: (providerId: string) => Promise<void>;
  gates: SecurityGates;
  toggleGate: (k: keyof SecurityGates) => void;
  adminPolicy: AdminPolicy;
  togglePolicyLock: (k: keyof SecurityGates) => void;
  siemConfig: SiemConfig | null;
  setSiemConfig: (cfg: SiemConfig | null) => void;
  runtimeCapabilities: RuntimeCapabilityBindingState;

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

  const watchdogHealth = 'unavailable';

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
  const [retrievalMode, setRetrievalModeState] = useState<KbRetrievalMode>('auto');
  const [retrievalRouteTrace, setRetrievalRouteTrace] = useState<RetrievalRouteTrace | undefined>(undefined);
  const [retrievalSelectedChunkIds, setRetrievalSelectedChunkIds] = useState<string[]>([]);
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
    setRetrievalRouteTrace((current) =>
      updateRouteTraceCounts(current, kbSearchResults, retrievalSelectedChunkIds, enabled),
    );
  }, [kbSearchResults, retrievalSelectedChunkIds]);

  const setRetrievalChunkSelected = useCallback((chunkId: string, selected: boolean) => {
    setRetrievalSelectedChunkIds((current) => {
      const hasChunk = current.includes(chunkId);
      const next = selected
        ? hasChunk || current.length >= RETRIEVAL_CHAT_RESULT_LIMIT
          ? current
          : [...current, chunkId]
        : current.filter((id) => id !== chunkId);
      const attachEnabled = next.length === 0 ? false : retrievalEnabledForChat;
      if (next.length === 0) setRetrievalEnabledForChatState(false);
      setRetrievalRouteTrace((trace) =>
        updateRouteTraceCounts(trace, kbSearchResults, next, attachEnabled),
      );
      return next;
    });
  }, [kbSearchResults, retrievalEnabledForChat]);

  const applyRetrievedContext = useCallback(
    (next: RetrievedContextState) => {
      setKbSearchResults(next.results);
      setRetrievalQuery(next.query);
      setRetrievalSelectedChunkIds(next.selectedChunkIds);
      setRetrievalEnabledForChatState(next.attachEnabled);
      setRetrievalModeState(next.mode);
      setRetrievalRouteTrace(next.routeTrace);
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
      const routeTrace = routeRetrieval({
        requestedMode: retrievalMode,
        query,
        kbStats: kbStatsState,
        semanticStatus,
      });

      if (routeTrace.resolvedMode === 'none') {
        applyRetrievedContext(retrievedContextAfterSearch(query, [], retrievalMode, routeTrace));
        setSemanticError(routeTrace.warningMessage ?? '');
        return [];
      }

      if (retrievalMode !== 'auto' && (retrievalMode === 'hybrid' || retrievalMode === 'graph') && !semanticStatus.ready) {
        const reason =
          retrievalMode === 'graph'
            ? 'Graph retrieval requires a ready semantic index because it uses Hybrid seed retrieval. Build / Refresh semantic index first.'
            : 'Hybrid retrieval requires a ready semantic index. Build / Refresh semantic index first.';
        const next = retrievedContextAfterSearch(query, [], retrievalMode, {
          ...routeTrace,
          routeReason: reason,
          warningMessage: reason,
        });
        applyRetrievedContext(next);
        await refreshSemanticStatus();
        setSemanticError(reason);
        return [];
      }

      const runResolvedSearch = async (resolvedMode: KbResolvedRetrievalMode): Promise<KbSearchResult[]> => {
        if (resolvedMode === 'graph') {
          return kbGraphRagSearch({ workspaceId: activeKbWorkspaceId(), query, limit, maxDepth: 1 });
        }
        if (resolvedMode === 'hybrid') {
          return kbHybridSearch({ workspaceId: activeKbWorkspaceId(), query, limit });
        }
        if (resolvedMode === 'semantic') {
          return kbSemanticSearch({ workspaceId: activeKbWorkspaceId(), query, limit });
        }
        return kbSearch({ workspaceId: activeKbWorkspaceId(), query, limit });
      };

      try {
        const results = await runResolvedSearch(routeTrace.resolvedMode);
        const next = retrievedContextAfterSearch(query, results, retrievalMode, routeTrace);
        applyRetrievedContext(next);
        setSemanticError(next.routeTrace?.warningMessage ?? '');
        await refreshKbStats();
        if (routeTrace.resolvedMode === 'semantic' || routeTrace.resolvedMode === 'hybrid' || routeTrace.resolvedMode === 'graph') await refreshSemanticStatus();
        return results;
      } catch (err) {
        const reason = err instanceof Error
          ? err.message
          : routeTrace.resolvedMode === 'graph'
            ? 'Graph retrieval unavailable; using lexical retrieval only.'
          : routeTrace.resolvedMode === 'hybrid'
            ? 'Hybrid retrieval unavailable; using lexical retrieval only.'
            : 'semantic retrieval unavailable';
        if (retrievalMode === 'auto' && routeTrace.resolvedMode !== 'lexical') {
          const fallbackTrace: RetrievalRouteTrace = {
            ...routeTrace,
            resolvedMode: 'lexical',
            routeReason: reason,
            fallbackFrom: routeTrace.resolvedMode,
            fallbackReason: reason,
            warningMessage: reason,
          };
          const fallbackResults = await kbSearch({ workspaceId: activeKbWorkspaceId(), query, limit }).catch(() => []);
          const fallbackState = retrievedContextAfterSearch(query, fallbackResults, retrievalMode, fallbackTrace);
          applyRetrievedContext(fallbackState);
          setSemanticError(reason);
          setSemanticStatus((current) => ({
            ...current,
            ready: false,
            state: 'unavailable',
            lastError: reason,
          }));
          await refreshKbStats();
          return fallbackResults;
        }
        const next = retrievedContextAfterSearch(query, [], retrievalMode, {
          ...routeTrace,
          warningMessage: reason,
        });
        applyRetrievedContext(next);
        if (retrievalMode === 'semantic' || retrievalMode === 'hybrid' || retrievalMode === 'graph') {
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
    [
      applyRetrievedContext,
      clearKbRetrieval,
      kbStatsState,
      refreshKbStats,
      refreshSemanticStatus,
      retrievalMode,
      semanticStatus,
    ],
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

  /* ---- provider connections / Runtime Profiles / gates (persisted) ---- */
  const [endpoints, setEndpoints] = useState<ProviderConnection[]>(() =>
    normalizeProviderConnections(loadEndpoints()),
  );
  const endpointsRef = useRef(endpoints);
  endpointsRef.current = endpoints;
  const [profiles, setProfiles] = useState<ConfigProfile[]>(() => loadProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string>(() => loadActiveProfileId());
  const [gates, setGates] = useState<SecurityGates>(() => loadGates());
  const gatesRef = useRef(gates);
  // 8.5: apply admin policy ceiling — gatesRef always holds the policy-constrained value
  const [adminPolicy, setAdminPolicy] = useState<AdminPolicy>(() => loadPolicy());
  const effectiveGateState = applyPolicy(adminPolicy, gates);
  gatesRef.current = effectiveGateState;
  const [siemConfig, setSiemConfigState] = useState<SiemConfig | null>(() => loadSiemConfig());
  const [registeredTools, setRegisteredTools] = useState<ToolMeta[]>(() => getTools());
  const runtimeCapabilities = useMemo(
    () => buildRuntimeCapabilityState(registeredTools, {
      toolsGateOpen: effectiveGateState.tools,
      hasActiveToolBindings: false,
      explicitlyAuthorized: false,
    }),
    [effectiveGateState.tools, registeredTools],
  );

  useEffect(() => {
    const syncTools = () => setRegisteredTools(getTools());
    syncTools();
    return onToolChange(syncTools);
  }, []);

  // Save config (providers, Runtime Profiles, active profile, gates) whenever it changes.
  useEffect(() => {
    saveConfig({ providerConnections: endpoints, runtimeProfiles: profiles, activeProfileId, gates });
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
    () =>
      normalizeRuntimeProfileTuning(
        profiles.find((p) => p.id === activeProfileId) ??
          profiles[0] ??
          defaultRuntimeProfiles[0],
      ),
    [profiles, activeProfileId],
  );
  const activeEndpoint = useMemo(
    () => endpoints.find((e) => e.id === activeProfile.providerId) ?? NO_ACTIVE_PROVIDER,
    [endpoints, activeProfile.providerId],
  );
  const activeModel = useMemo(
    () => modelEntryForSelection(activeEndpoint, activeProfile.modelId),
    [activeEndpoint, activeProfile.modelId],
  );
  const effectiveTuning = useMemo(
    () =>
      resolveEffectiveRuntimeTuning({
        runtimeOverrides: activeTask.runtimeOverrides,
        profile: activeProfile,
      }),
    [activeTask.runtimeOverrides, activeProfile],
  );
  const effectiveTemperature = effectiveTuning.temperature;
  const effectiveContextWindow = effectiveTuning.contextWindow;
  const canSendState = canSendWithRuntime(activeEndpoint, activeModel);
  const activeRuntimeLabel = activeModel
    ? `${activeEndpoint.label} · ${activeModel.displayName}`
    : `${activeEndpoint.label} · No model`;

  const updateProfile = useCallback((id: string, patch: Partial<ConfigProfile>) => {
    setProfiles((ps) =>
      ps.map((p) => (p.id === id ? normalizeRuntimeProfileTuning({ ...p, ...patch }) : p)),
    );
  }, []);

  const setEndpointModel = useCallback((endpointId: string, model: string) => {
    setProfiles((ps) =>
      ps.map((profile) =>
        profile.id === activeProfileId && profile.providerId === endpointId
          ? { ...profile, modelId: model }
          : profile,
      ),
    );
  }, [activeProfileId]);

  const setActiveModel = useCallback((modelId: string) => {
    setProfiles((ps) =>
      ps.map((profile) =>
        profile.id === activeProfileId ? { ...profile, modelId } : profile,
      ),
    );
  }, [activeProfileId]);

  const updateEndpoint = useCallback((id: string, patch: Partial<Endpoint>) => {
    setEndpoints((eps) => normalizeProviderConnections(eps.map((e) => (e.id === id ? { ...e, ...patch } : e))));
  }, []);
  const updateProviderConnection = updateEndpoint;

  const setRuntimeOverride = useCallback((patch: { temperature?: number; contextWindow?: number }) => {
    patchTask(activeTaskIdRef.current, (task) => ({
      ...task,
      runtimeOverrides: {
        ...(task.runtimeOverrides ?? {}),
        ...patch,
      },
    }));
  }, [patchTask]);

  const clearRuntimeOverrides = useCallback(() => {
    patchTask(activeTaskIdRef.current, (task) => ({
      ...task,
      runtimeOverrides: undefined,
    }));
  }, [patchTask]);

  const addProfile = useCallback(() => {
    const id = `profile-${uuidv4().slice(0, 6)}`;
    setProfiles((ps) => {
      const base = ps.find((p) => p.id === activeProfileId) ?? ps[0];
      return [...ps, { ...base, id, label: 'NEW PRESET' }];
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

  const refreshProviderModels = useCallback(async (providerId: string) => {
    const provider = endpointsRef.current.find((e) => e.id === providerId);
    if (!provider) return;
    setEndpoints((eps) =>
      normalizeProviderConnections(
        eps.map((e) => (e.id === providerId ? { ...e, status: 'configuring', detail: 'Refreshing model inventory.' } : e)),
      ),
    );
    const result = await discoverProviderModels(provider, gatesRef.current.network);
    setEndpoints((eps) =>
      normalizeProviderConnections(
        eps.map((e) =>
          e.id === providerId
            ? {
                ...e,
                status: result.status,
                detail: result.detail,
                models: result.models,
                lastFailure: result.lastFailure,
              }
            : e,
        ),
      ),
    );
    pushActivity(
      activeTaskIdRef.current,
      result.lastFailure ? 'system' : 'network',
      result.lastFailure
        ? `${provider.label}: ${result.lastFailure.safeMessage}`
        : `${provider.label}: ${result.detail ?? providerStatusLabel(result.status)}`,
    );
  }, [pushActivity]);

  const refreshEndpoints = useCallback(async () => {
    await Promise.all(endpointsRef.current.map((provider) => refreshProviderModels(provider.id)));
  }, [refreshProviderModels]);

  const setActiveProvider = useCallback(async (providerId: string) => {
    const canonicalProviderId = canonicalProviderIdForReference(providerId, endpointsRef.current);
    if (!canonicalProviderId) return;
    setProfiles((ps) =>
      ps.map((profile) =>
        profile.id === activeProfileId ? { ...profile, providerId: canonicalProviderId } : profile,
      ),
    );
    await refreshProviderModels(canonicalProviderId);
  }, [activeProfileId, refreshProviderModels]);

  /* ---- chat ---- */
  const [sending, setSending] = useState(false);
  const [showActivity, setShowActivity] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

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
          selectedChunkIds: retrievalSelectedChunkIds,
          attachEnabled: retrievalEnabledForChat,
          mode: retrievalMode,
          routeTrace: retrievalRouteTrace,
        },
        documentId,
      );
      setKbSearchResults(nextRetrieval.results);
      setRetrievalQuery(nextRetrieval.query);
      setRetrievalSelectedChunkIds(nextRetrieval.selectedChunkIds);
      setRetrievalEnabledForChatState(nextRetrieval.attachEnabled);
      setRetrievalRouteTrace(nextRetrieval.routeTrace);
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
      retrievalRouteTrace,
      retrievalSelectedChunkIds,
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
      const provider = activeEndpoint;
      const model = activeModel;
      const sendable = canSendWithRuntime(provider, model);
      const requestStartedAt = Date.now();
      const executionClass = model?.executionClass ?? executionClassForModel(provider, activeProfile.modelId);
      const modelId = model?.id ?? activeProfile.modelId;
      const modelLabel = model?.displayName ?? modelId;
      const temperature =
        model?.maxTemperature !== undefined
          ? Math.min(effectiveTemperature, model.maxTemperature)
          : effectiveTemperature;
      const runtime: RuntimeProvenance = {
        providerId: provider.id,
        providerLabel: provider.label,
        modelId,
        modelLabel,
        executionClass,
        requestStartedAt,
        outcome: 'success',
      };
      const snapshot: RuntimeRequestSnapshot = {
        ...runtime,
        providerBaseUrl: provider.baseUrl,
        providerKind: provider.providerKind,
        temperature,
        contextWindow: effectiveContextWindow,
      };

      const userMsg: ChatMessage = {
        id: uuidv4().slice(0, 8),
        role: 'user',
        content: trimmed,
        ts: Date.now(),
        runtime,
      };
      const asstId = uuidv4().slice(0, 8);
      const asstMsg: ChatMessage = {
        id: asstId,
        role: 'assistant',
        content: '',
        ts: Date.now(),
        streaming: true,
        runtime,
      };

      patchTask(taskId, (t) => ({ ...t, messages: [...t.messages, userMsg, asstMsg] }));
      setSending(true);
      pushActivity(taskId, 'query', `runtime ${provider.label} · ${modelLabel} · ${executionClassLabel(executionClass)}`);

      const completeRuntime = (outcome: RuntimeProvenance['outcome']): RuntimeProvenance => ({
        ...runtime,
        requestCompletedAt: Date.now(),
        outcome,
      });

      const finishWithFailure = (failure: ProviderFailure) => {
        const completed = completeRuntime('error');
        patchTask(taskId, (t) => ({
          ...t,
          messages: t.messages.map((m) =>
            m.id === asstId || m.id === userMsg.id
              ? {
                  ...m,
                  streaming: false,
                  runtime: completed,
                  failure: m.id === asstId ? failure : m.failure,
                  content: m.id === asstId ? failure.safeMessage : m.content,
                }
              : m,
          ),
        }));
        pushActivity(
          taskId,
          'system',
          `${provider.label} · ${modelLabel}: ${failure.category} · ${failure.safeMessage}`,
        );
      };

      if (!sendable.ok) {
        const failure = classifyProviderFailure(new Error(sendable.reason), provider, modelId, executionClass);
        finishWithFailure(failure);
        setSending(false);
        abortRef.current = null;
        return;
      }

      const retrievalForMessage = retrievalEnabledForChat
        ? selectedRetrievalResults(kbSearchResults, retrievalSelectedChunkIds, RETRIEVAL_CHAT_RESULT_LIMIT)
        : [];
      const hasAttachedRetrieval = retrievalEnabledForChat && retrievalForMessage.length > 0;
      const promptText = buildOptionalChatPromptWithRetrievedContext(
        trimmed,
        retrievalForMessage,
        hasAttachedRetrieval,
        retrievalMode,
        retrievalRouteTrace,
      );
      if (hasAttachedRetrieval) {
        pushActivity(
          taskId,
          'query',
          `${retrievalContextDisplayLabel(retrievalMode, retrievalRouteTrace)} retrieval: ${retrievalForMessage.length} selected local KB chunk(s) attached`,
        );
      }

      const baseTask = tasks.find((t) => t.id === taskId);
      const turns: ChatTurn[] = (baseTask?.messages ?? [])
        .filter((m) => {
          if (m.role !== 'user' && m.role !== 'assistant') return false;
          if (m.failure) return false;
          if (m.runtime?.outcome === 'error' || m.runtime?.outcome === 'cancelled') return false;
          if (!m.content.trim()) return false;
          return true;
        })
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      turns.push({ role: 'user', content: promptText });
      const systemTurns: ChatTurn[] = [{
        role: 'system',
        content:
          `You are "${modelLabel}", a model reached through ${provider.label} in the ` +
          `CODE NAME desktop app. If asked what model or AI you are, identify yourself as ` +
          `"${modelLabel}". Do not claim to be a different model, company, or product.`,
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

      if (!gates.network && reachesNetwork(provider, modelId)) {
        const failure = classifyProviderFailure(new Error('permission denied: network gate closed'), provider, modelId, executionClass);
        finishWithFailure({
          ...failure,
          category: 'permission_denied',
          safeMessage: 'Network gate is closed.',
          retryable: false,
          nextStep: 'Open the Network gate or choose a local model.',
        });
        setSending(false);
        abortRef.current = null;
        return;
      }

      let servedModel = '';
      try {
        await streamChat(provider, snapshot, turns, {
          signal: ctl.signal,
          onActivity: (kind, t) => pushActivity(taskId, kind, t),
          onModel: (m) => {
            servedModel = m;
          },
          onToken: (tok) =>
            patchTask(taskId, (t) => ({
              ...t,
              messages: t.messages.map((m) =>
                m.id === asstId ? { ...m, content: m.content + tok } : m,
              ),
            })),
        });
        const completed = completeRuntime('success');
        patchTask(taskId, (t) => ({
          ...t,
          messages: t.messages.map((m) =>
            m.id === asstId || m.id === userMsg.id
              ? { ...m, streaming: false, runtime: completed }
              : m,
          ),
        }));
        if (
          provider.providerKind === 'lmstudio' &&
          (!servedModel || servedModel === modelId)
        ) {
          setEndpoints((eps) =>
            eps.map((endpoint) =>
              endpoint.id === provider.id
                ? {
                    ...endpoint,
                    models: endpoint.models.map((entry) =>
                      entry.id === modelId ? { ...entry, availability: 'ready' as const } : entry,
                    ),
                  }
                : endpoint,
            ),
          );
        }
        if (servedModel && servedModel !== modelId) {
          pushActivity(taskId, 'system', `model mismatch: requested ${modelId}, provider reported ${servedModel}`);
        }
      } catch (err) {
        const cancelled = ctl.signal.aborted;
        if (cancelled) {
          const completed = completeRuntime('cancelled');
          patchTask(taskId, (t) => ({
            ...t,
            messages: t.messages.map((m) =>
              m.id === asstId || m.id === userMsg.id
                ? { ...m, streaming: false, runtime: completed }
                : m,
            ),
          }));
          pushActivity(taskId, 'system', `${provider.label} · ${modelLabel}: request cancelled`);
        } else {
          const failure =
            err instanceof Error && 'failure' in err
              ? (err as Error & { failure: ProviderFailure }).failure
              : classifyProviderFailure(err, provider, modelId, executionClass);
          finishWithFailure(failure);
          setEndpoints((eps) =>
            eps.map((endpoint) =>
              endpoint.id === provider.id
                ? { ...endpoint, lastFailure: failure, detail: failure.safeMessage }
                : endpoint,
            ),
          );
        }
      } finally {
        setSending(false);
        abortRef.current = null;
      }
    },
    [
      sending,
      activeTaskId,
      activeEndpoint,
      activeModel,
      activeProfile,
      effectiveTemperature,
      effectiveContextWindow,
      gates.network,
      kbSearchResults,
      retrievalSelectedChunkIds,
      retrievalEnabledForChat,
      retrievalMode,
      retrievalRouteTrace,
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
        description: 'Browser navigation is unavailable during Sidecar containment.',
        inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
        execute: async (args) => {
          const taskId = activeTaskIdRef.current;
          const task = tasksRef.current.find((t) => t.id === taskId);
          if (!task?.session.caps.browser) {
            return { content: [{ type: 'text', text: '[blocked] this tab lacks BROWSER permission' }] };
          }
          const url = String(args.url ?? '');
          pushActivity(taskId, 'tool', `browser.open unavailable: ${url}`);
          return {
            content: [{
              type: 'text',
              text: '[unavailable] Browser execution is not connected or bound during Sidecar containment.',
            }],
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
    },
    [
      activeTaskId,
      createDocNode,
      mergeKbGraphProjection,
      pushActivity,
      refreshKbDocuments,
      refreshKbStats,
      refreshSemanticStatus,
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
    retrievalRouteTrace,
    setRetrievalMode,
    retrievalSelectedChunkIds,
    setRetrievalChunkSelected,
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
    /* endpoints / profiles / gates */
    endpoints,
    profiles,
    activeProfileId,
    setActiveProfileId,
    activeProfile,
    activeEndpoint,
    activeModel,
    activeRuntimeLabel,
    effectiveTemperature,
    effectiveContextWindow,
    canSend: canSendState.ok,
    cannotSendReason: canSendState.reason,
    updateProfile,
    setActiveProvider,
    setActiveModel,
    setEndpointModel,
    updateEndpoint,
    updateProviderConnection,
    setRuntimeOverride,
    clearRuntimeOverrides,
    addProfile,
    deleteProfile,
    refreshEndpoints,
    refreshProviderModels,
    gates: effectiveGateState,
    toggleGate,
    adminPolicy,
    togglePolicyLock,
    siemConfig,
    setSiemConfig,
    runtimeCapabilities,
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
