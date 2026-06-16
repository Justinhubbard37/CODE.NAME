import { getActiveWorkspace } from '../auth/workspace';

export interface KbInitResult {
  initialized: boolean;
  schemaVersion: number;
  databasePath: string;
  ftsAvailable: boolean;
}

export interface KbStats {
  initialized: boolean;
  schemaVersion: number;
  documentCount: number;
  deletedDocumentCount: number;
  chunkCount: number;
  entityCount: number;
  relationshipCount: number;
  retrievalEventCount: number;
  ftsAvailable: boolean;
}

export type KbRetrievalKind = 'lexical' | 'semantic';
export type KbRetrievalMode = KbRetrievalKind;

export interface KbEmbeddingStatus {
  provider: string;
  model: string;
  activeChunkCount: number;
  embeddedActiveChunkCount: number;
  missingActiveChunkCount: number;
  dimension?: number;
  ready: boolean;
  state: 'empty' | 'not-ready' | 'ready' | 'unavailable' | string;
  lastError?: string;
}

export interface KbEmbedMissingResult {
  provider: string;
  model: string;
  embeddedCount: number;
  skippedCount: number;
  failedCount: number;
  dimension?: number;
  error?: string;
}

export interface KbIngestResult {
  documentId: string;
  chunkCount: number;
  contentHash: string;
}

export interface KbChunk {
  id: string;
  documentId: string;
  workspaceId: string;
  ordinal: number;
  text: string;
  charStart: number;
  charEnd: number;
  tokenEstimate: number;
  contentHash: string;
}

export interface KbDocument {
  id: string;
  workspaceId: string;
  title: string;
  sourceUri?: string;
  sourceKind: string;
  mimeType: string;
  contentHash: string;
  byteLength: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  chunkCount: number;
  chunks?: KbChunk[];
}

export interface KbDeleteResult {
  documentId: string;
  deleted: boolean;
  deletedAt: number;
}

export interface KbSearchResult {
  chunk: KbChunk;
  documentTitle: string;
  sourceUri?: string;
  score: number;
  retrievalKind?: KbRetrievalKind;
}

export interface KbGraphNode {
  id: string;
  nodeType: 'document' | 'chunk' | 'entity';
  label: string;
  title?: string;
  description?: string;
  kind?: string;
  ordinal?: number;
}

export interface KbGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string;
}

export interface KbGraphProjection {
  nodes: KbGraphNode[];
  edges: KbGraphEdge[];
}

export const emptyKbStats: KbStats = {
  initialized: false,
  schemaVersion: 0,
  documentCount: 0,
  deletedDocumentCount: 0,
  chunkCount: 0,
  entityCount: 0,
  relationshipCount: 0,
  retrievalEventCount: 0,
  ftsAvailable: false,
};

export const defaultEmbeddingProvider = 'ollama';
export const defaultEmbeddingModel = 'nomic-embed-text';
export const defaultEmbeddingBaseUrl = 'http://127.0.0.1:11434';

export const emptyKbEmbeddingStatus: KbEmbeddingStatus = {
  provider: defaultEmbeddingProvider,
  model: defaultEmbeddingModel,
  activeChunkCount: 0,
  embeddedActiveChunkCount: 0,
  missingActiveChunkCount: 0,
  ready: false,
  state: 'unavailable',
  lastError: 'desktop-app-only',
};

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('SQLite KB is available in the desktop app');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export function activeKbWorkspaceId(): string {
  return getActiveWorkspace().id;
}

export async function kbInit(): Promise<KbInitResult> {
  if (!isTauri()) {
    return {
      initialized: false,
      schemaVersion: 0,
      databasePath: 'desktop-app-only',
      ftsAvailable: false,
    };
  }
  return invokeTauri<KbInitResult>('kb_init');
}

export async function kbStats(): Promise<KbStats> {
  if (!isTauri()) return emptyKbStats;
  try {
    return await invokeTauri<KbStats>('kb_stats');
  } catch {
    return emptyKbStats;
  }
}

export async function kbIngestText(input: {
  workspaceId?: string;
  title: string;
  text: string;
  sourceUri?: string;
  sourceKind?: string;
  mimeType?: string;
}): Promise<KbIngestResult> {
  return invokeTauri<KbIngestResult>('kb_ingest_text', {
    workspaceId: input.workspaceId ?? activeKbWorkspaceId(),
    title: input.title,
    text: input.text,
    sourceUri: input.sourceUri,
    sourceKind: input.sourceKind,
    mimeType: input.mimeType,
  });
}

export async function kbSearch(input: {
  workspaceId?: string;
  query: string;
  limit?: number;
}): Promise<KbSearchResult[]> {
  if (!isTauri()) return [];
  return invokeTauri<KbSearchResult[]>('kb_search', {
    workspaceId: input.workspaceId ?? activeKbWorkspaceId(),
    query: input.query,
    limit: input.limit ?? 8,
  });
}

export async function kbEmbeddingStatus(input: {
  workspaceId?: string;
  provider?: string;
  model?: string;
} = {}): Promise<KbEmbeddingStatus> {
  if (!isTauri()) return emptyKbEmbeddingStatus;
  try {
    return await invokeTauri<KbEmbeddingStatus>('kb_embedding_status', {
      workspaceId: input.workspaceId ?? activeKbWorkspaceId(),
      provider: input.provider ?? defaultEmbeddingProvider,
      model: input.model ?? defaultEmbeddingModel,
    });
  } catch (err) {
    return {
      ...emptyKbEmbeddingStatus,
      provider: input.provider ?? defaultEmbeddingProvider,
      model: input.model ?? defaultEmbeddingModel,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function kbEmbedMissing(input: {
  workspaceId?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
} = {}): Promise<KbEmbedMissingResult> {
  if (!isTauri()) {
    return {
      provider: input.provider ?? defaultEmbeddingProvider,
      model: input.model ?? defaultEmbeddingModel,
      embeddedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      error: 'desktop-app-only',
    };
  }
  return invokeTauri<KbEmbedMissingResult>('kb_embed_missing', {
    workspaceId: input.workspaceId ?? activeKbWorkspaceId(),
    provider: input.provider ?? defaultEmbeddingProvider,
    model: input.model ?? defaultEmbeddingModel,
    baseUrl: input.baseUrl ?? defaultEmbeddingBaseUrl,
  });
}

export async function kbSemanticSearch(input: {
  workspaceId?: string;
  query: string;
  limit?: number;
  provider?: string;
  model?: string;
  baseUrl?: string;
}): Promise<KbSearchResult[]> {
  if (!isTauri()) return [];
  return invokeTauri<KbSearchResult[]>('kb_semantic_search', {
    workspaceId: input.workspaceId ?? activeKbWorkspaceId(),
    query: input.query,
    limit: input.limit ?? 8,
    provider: input.provider ?? defaultEmbeddingProvider,
    model: input.model ?? defaultEmbeddingModel,
    baseUrl: input.baseUrl ?? defaultEmbeddingBaseUrl,
  });
}

export async function kbGetDocument(
  documentId: string,
  includeChunks = false,
): Promise<KbDocument> {
  return invokeTauri<KbDocument>('kb_get_document', {
    documentId,
    includeChunks,
  });
}

export async function kbListDocuments(input: {
  workspaceId?: string;
} = {}): Promise<KbDocument[]> {
  if (!isTauri()) return [];
  return invokeTauri<KbDocument[]>('kb_list_documents', {
    workspaceId: input.workspaceId ?? activeKbWorkspaceId(),
  });
}

export async function kbDeleteDocument(input: {
  documentId: string;
  mode?: 'soft';
}): Promise<KbDeleteResult> {
  return invokeTauri<KbDeleteResult>('kb_delete_document', {
    documentId: input.documentId,
    mode: input.mode ?? 'soft',
  });
}

export async function kbGraphProjection(input: {
  workspaceId?: string;
  documentId?: string;
} = {}): Promise<KbGraphProjection> {
  if (!isTauri()) return { nodes: [], edges: [] };
  return invokeTauri<KbGraphProjection>('kb_graph_projection', {
    workspaceId: input.workspaceId ?? activeKbWorkspaceId(),
    documentId: input.documentId,
  });
}
