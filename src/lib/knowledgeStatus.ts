import type { KbEmbeddingStatus, KbStats } from './kb';

export type KnowledgeStatusTone = 'ready' | 'working' | 'warning' | 'empty' | 'unavailable';

export interface KnowledgeStatusSummary {
  label: string;
  detail: string;
  tone: KnowledgeStatusTone;
}

function looksLikeOllamaIssue(message: string): boolean {
  return /ollama|embed|connection|fetch|refused|unavailable|model/i.test(message);
}

export function knowledgeStatusSummary(input: {
  kbStats: Pick<KbStats, 'documentCount' | 'chunkCount'>;
  semanticStatus: KbEmbeddingStatus;
  semanticIndexing: boolean;
  semanticError?: string;
}): KnowledgeStatusSummary {
  const { kbStats, semanticStatus, semanticIndexing } = input;
  const semanticError = input.semanticError?.trim() || semanticStatus.lastError?.trim() || '';

  if (kbStats.documentCount <= 0 || kbStats.chunkCount <= 0) {
    return {
      label: 'No active documents',
      detail: 'Ingest documents before searching the knowledge base.',
      tone: 'empty',
    };
  }

  if (semanticIndexing) {
    return {
      label: 'Indexing',
      detail: `${semanticStatus.embeddedActiveChunkCount}/${semanticStatus.activeChunkCount} chunks embedded.`,
      tone: 'working',
    };
  }

  if (semanticStatus.ready) {
    return {
      label: 'Knowledge Ready',
      detail: 'Auto can use lexical, hybrid, and graph retrieval.',
      tone: 'ready',
    };
  }

  if (semanticError) {
    return {
      label: looksLikeOllamaIssue(semanticError) ? 'Needs Ollama' : 'Semantic unavailable',
      detail: semanticError,
      tone: 'unavailable',
    };
  }

  if (semanticStatus.missingActiveChunkCount > 0 || semanticStatus.state === 'not-ready') {
    return {
      label: 'Semantic index needed',
      detail: `${semanticStatus.missingActiveChunkCount} chunk${semanticStatus.missingActiveChunkCount === 1 ? '' : 's'} missing embeddings.`,
      tone: 'warning',
    };
  }

  if (semanticStatus.state === 'empty') {
    return {
      label: 'Semantic index needed',
      detail: 'Build the semantic index to enable Hybrid and Graph routes.',
      tone: 'warning',
    };
  }

  return {
    label: 'Semantic unavailable',
    detail: semanticStatus.state,
    tone: 'unavailable',
  };
}

