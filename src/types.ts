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
  /** Local graph community identifier. This is not full GraphRAG retrieval. */
  communityId?: string;
  /** LLM-generated summary of the node's community (Phase 4, Slice 4.4). */
  communitySummary?: string;
};

export type AppNode = Node<
  NodeData,
  'doc' | 'subject' | 'org' | 'audio' | 'cluster' | 'chunk' | 'entity'
>;

export type { Edge };

/* ------------------------------------------------------------------ */
/* Canonical runtime/provider registry                                 */
/* ------------------------------------------------------------------ */

export type ProviderKind = 'ollama' | 'lmstudio' | 'openai-compatible' | 'gemini' | 'custom';
export type ExecutionClass = 'local' | 'cloud' | 'sidecar' | 'unknown';
export type SecretRequirement = 'none' | 'optional' | 'keychain';
export type ProviderStatus =
  | 'ready'
  | 'available'
  | 'requires_api_key'
  | 'requires_sign_in'
  | 'server_offline'
  | 'unavailable'
  | 'unknown'
  | 'configuring';
export type ModelAvailability =
  | 'available'
  | 'ready'
  | 'requires_api_key'
  | 'requires_sign_in'
  | 'server_offline'
  | 'unavailable'
  | 'unknown';
export type ModelInventorySource =
  | 'ollama'
  | 'lmstudio'
  | 'gemini'
  | 'openai-compatible'
  | 'custom'
  | 'migration'
  | 'configured';
export type ProviderFailureCategory =
  | 'api_key_missing'
  | 'sign_in_required'
  | 'authentication_failed'
  | 'permission_denied'
  | 'quota_exhausted'
  | 'model_unavailable'
  | 'endpoint_unreachable'
  | 'request_invalid'
  | 'timeout'
  | 'stream_error'
  | 'provider_error'
  | 'unknown';
export type RuntimeOutcome = 'success' | 'error' | 'cancelled';

export interface ModelInventoryEntry {
  id: string;
  displayName: string;
  executionClass: ExecutionClass;
  availability: ModelAvailability;
  source: ModelInventorySource;
  discoveredAt: number;
  capabilities: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  maxTemperature?: number;
  thinkingSupported?: boolean;
}

export interface ProviderFailure {
  category: ProviderFailureCategory;
  safeMessage: string;
  httpStatus?: number;
  retryable: boolean;
  providerId: string;
  modelId: string;
  executionClass: ExecutionClass;
  nextStep?: string;
}

export interface ProviderConnection {
  id: string;
  label: string;
  providerKind: ProviderKind;
  baseUrl: string;
  requiresNetwork: boolean;
  requiresSecret: boolean;
  secretRequirement: SecretRequirement;
  status: ProviderStatus;
  detail?: string;
  models: ModelInventoryEntry[];
  apiKeyEnv?: string;
  userEditable?: boolean;
  lastFailure?: ProviderFailure;
}

export interface RuntimeProfile {
  id: string;
  label: string;
  providerId: string;
  modelId: string;
  defaultTemperature: number;
  /** context window in tokens */
  defaultContextWindow: number;
}

export interface RuntimeOverrides {
  temperature?: number;
  contextWindow?: number;
}

export interface RuntimeProvenance {
  providerId: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  executionClass: ExecutionClass;
  requestStartedAt: number;
  requestCompletedAt?: number;
  outcome: RuntimeOutcome;
}

export interface RuntimeRequestSnapshot extends RuntimeProvenance {
  temperature: number;
  contextWindow: number;
  providerBaseUrl: string;
  providerKind: ProviderKind;
}

/* Compatibility names for older imports while the runtime UI uses the
 * canonical provider/profile shapes above. */
export type Endpoint = ProviderConnection;
export type ConfigProfile = RuntimeProfile;
export type EndpointKind = ProviderKind | 'openai' | 'a2a';
export type EndpointStatus = ProviderStatus;
export type EndpointNetworkClass = 'local-only' | 'cloud' | 'cloud-capable' | 'unknown';

/* ------------------------------------------------------------------ */
/* Capability governance                                               */
/* ------------------------------------------------------------------ */

export interface SecurityGates {
  filesystem: boolean;
  network: boolean;
  tools: boolean;
}

export interface EffectiveGateState extends SecurityGates {
  changedByPolicy: boolean;
  lockedGates: { gate: string; reason: string }[];
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
  runtime?: RuntimeProvenance;
  failure?: ProviderFailure;
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
  runtimeOverrides?: RuntimeOverrides;
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
  clusterWhenCommunityGt: number; // community size that collapses to a cluster node
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
