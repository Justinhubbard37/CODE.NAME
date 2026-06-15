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
  chunkCount: number;
  entityCount: number;
  relationshipCount: number;
  retrievalEventCount: number;
  ftsAvailable: boolean;
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
  chunkCount: number;
  chunks?: KbChunk[];
}

export interface KbSearchResult {
  chunk: KbChunk;
  documentTitle: string;
  sourceUri?: string;
  score: number;
}

export const emptyKbStats: KbStats = {
  initialized: false,
  schemaVersion: 0,
  documentCount: 0,
  chunkCount: 0,
  entityCount: 0,
  relationshipCount: 0,
  retrievalEventCount: 0,
  ftsAvailable: false,
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

export async function kbGetDocument(
  documentId: string,
  includeChunks = false,
): Promise<KbDocument> {
  return invokeTauri<KbDocument>('kb_get_document', {
    documentId,
    includeChunks,
  });
}
