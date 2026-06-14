import { Edge, Node } from '@xyflow/react';

/* ------------------------------------------------------------------ */
/* Graph domain (Relational Intelligence Graph)                        */
/* ------------------------------------------------------------------ */

export type NodeVersion = {
  version: number;
  timestamp: number;
  changes: string;
  snap: Partial<NodeData>;
};

export type NodeData = {
  label: string;
  type: string;
  title?: string;
  description?: string;
  pages?: number;
  date?: string;
  class?: string;
  src?: string;
  name?: string;
  alias?: string;
  nat?: string;
  status?: string;
  items?: number;
  tier?: number;
  icon?: string;
  hash?: string;
  history?: NodeVersion[];
  currentVersion?: number;
  /** GraphRAG community identifier (Phase 4, Slice 4.4). */
  communityId?: string;
  /** LLM-generated summary of the node's community (Phase 4, Slice 4.4). */
  communitySummary?: string;
};

export type AppNode = Node<NodeData, 'doc' | 'subject' | 'org' | 'audio' | 'cluster'>;

export type { Edge };

/* ------------------------------------------------------------------ */
/* Model-agnostic endpoint registry                                    */
/* ------------------------------------------------------------------ */

export type EndpointKind = 'ollama' | 'openai' | 'lmstudio' | 'gemini' | 'custom' | 'a2a';
export type EndpointStatus = 'offline' | 'configuring' | 'ready' | 'error';

export interface Endpoint {
  id: string;
  label: string;
  kind: EndpointKind;
  baseUrl: string;
  model: string;
  isLocal: boolean;
  /** true if this endpoint reaches the internet even when isLocal — e.g. an
   *  Ollama "-cloud" model offloaded through the local daemon. Network-gated. */
  usesCloud?: boolean;
  /** name of the env var holding an API key, for cloud endpoints */
  apiKeyEnv?: string;
  status: EndpointStatus;
  detail?: string;
  /** models actually available at this endpoint (filled by a live probe) */
  models?: string[];
}

/* ------------------------------------------------------------------ */
/* Capability governance                                               */
/* ------------------------------------------------------------------ */

export interface SecurityGates {
  filesystem: boolean;
  network: boolean;
  tools: boolean;
}

export interface ConfigProfile {
  id: string;
  name: string;
  endpointId: string;
  temperature: number;
  /** context window in tokens */
  contextWindow: number;
}

/* ------------------------------------------------------------------ */
/* Execution canvas (chat + activity)                                  */
/* ------------------------------------------------------------------ */

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Tool-call messages (role === 'tool') encode their payload as JSON in `content`:
 *   { name: string; args: Record<string, unknown>; result?: string }
 * `result` is absent while the call is in-flight, present once the app posts the result.
 */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  ts: number;
  streaming?: boolean;
}

export type ActivityKind = 'tool' | 'reasoning' | 'query' | 'system' | 'network';

export interface ActivityEvent {
  id: string;
  ts: number;
  kind: ActivityKind;
  text: string;
}

/* ------------------------------------------------------------------ */
/* Task tabs (isolated context frames)                                 */
/* ------------------------------------------------------------------ */

export type TaskKind = 'analysis' | 'research' | 'codegen';

/** Per-tab capability grants (Phase 5). A tab may revoke, never exceed, the global gates. */
export interface TabCaps {
  browser: boolean;
  tools: boolean;
  network: boolean;
  filesystem: boolean;
}

export interface TabSession {
  id: string;
  caps: TabCaps;
}

export interface WorkTask {
  id: string;
  name: string;
  kind: TaskKind;
  agent: string;
  messages: ChatMessage[];
  activity: ActivityEvent[];
  session: TabSession;
}

/* ------------------------------------------------------------------ */
/* Gated ingestion / quarantine                                        */
/* ------------------------------------------------------------------ */

export type QuarantineStatus =
  | 'checking'
  | 'ready'
  | 'conflict'
  | 'indexed'
  | 'skipped'
  | 'rejected';

export interface QuarantineItem {
  id: string;
  name: string;
  size: number;
  hash: string;
  status: QuarantineStatus;
  conflictWith?: string;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Phase 0 contracts — sidecar handshake (P0.2)                        */
/* ------------------------------------------------------------------ */

/**
 * Emitted by the Python sidecar on stdout at startup and read by the Rust
 * supervisor. The sidecar binds 127.0.0.1 on an OS-assigned ephemeral port
 * (port 0) and mints a per-launch token that must accompany every A2A call.
 */
export interface SidecarHandshake {
  ready: true;
  host: '127.0.0.1';
  port: number; // OS-assigned ephemeral
  token: string; // per-launch bearer, required on every A2A request
  protocol: 'a2a';
  specVersion: string; // align JS+Python, e.g. '0.3'
  pid?: number;
}

export type SidecarStatus =
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'restarting'
  | 'error';

/* ------------------------------------------------------------------ */
/* Phase 0 contracts — gated KG write audit (P0.3)                     */
/* ------------------------------------------------------------------ */

export type AuditAction = 'create' | 'update' | 'delete' | 'link' | 'unlink';
export type GateName = keyof SecurityGates;

export interface GateDecision {
  allowed: boolean;
  gate?: GateName; // which gate decided, if denied/required
  reason?: string;
}

export interface AuditActor {
  kind: 'user' | 'agent' | 'system';
  id: string;
  taskId?: string;
  sessionId?: string;
}

/**
 * Append-only record written at the single KG-mutation chokepoint. Extends the
 * per-node version history into a global ledger.
 *
 * Phase 5 Slice 5.5: target.kind now includes 'file' for sandbox harness writes.
 */
export interface AuditRecord {
  id: string;
  ts: number;
  actor: AuditActor;
  action: AuditAction;
  target: { kind: 'node' | 'edge' | 'file'; id: string };
  before?: unknown; // snapshot or content hash
  after?: unknown;
  diff?: string; // human-readable summary
  decision: GateDecision;
  provenance?: { source?: string; ingestionId?: string };
  /** SHA-256 hash of the previous AuditRecord — forms the tamper-evident chain (Phase 7, Slice 7.2). */
  prevHash?: string;
}

/* ------------------------------------------------------------------ */
/* Phase 0 — tunable system config (P0.4)                             */
/* ------------------------------------------------------------------ */

/** Screen-space LOD: thresholds are projected on-screen pixels (zoom-independent). */
export interface LodConfig {
  fullCardMinPx: number; // >= -> full readable card
  labelMinPx: number; // [labelMinPx, fullCardMinPx) -> small label; below -> dot
  clusterWhenCommunityGt: number; // GraphRAG community size that collapses to a cluster node
}

export interface PoolConfig {
  maxBrowserContexts: number;
  maxAgents: number;
  idleEvictMs: number;
}

export interface SidecarConfig {
  host: string;
  port: number;
  token: string;
}

export interface SystemConfig {
  lod: LodConfig;
  pools: PoolConfig;
  sidecar: {
    host: string;
    bind: 'ephemeral' | number;
    warmStart: boolean;
    healthIntervalMs: number;
    restartBackoffMs: number;
  };
}
