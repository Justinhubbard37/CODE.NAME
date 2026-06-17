import type {
  KbEmbeddingStatus,
  KbResolvedRetrievalMode,
  KbRetrievalKind,
  KbRetrievalMode,
  KbStats,
} from './kb';
import type { RetrievalRouteTrace } from './retrievalContext';

const LEXICAL_REASON = 'Exact token or filename-style query; lexical retrieval is safest.';
const GRAPH_READY_REASON = 'Relationship-style query with ready semantic index.';
const CONCEPTUAL_READY_REASON = 'Conceptual query with ready semantic index.';
const DEFAULT_REASON = 'No semantic or graph signal detected.';
const GRAPH_FALLBACK_REASON = 'Graph retrieval needs a ready semantic index; using lexical retrieval only.';
const SEMANTIC_FALLBACK_REASON = 'Semantic index not ready; using lexical retrieval only.';
const NO_DOCUMENTS_REASON = 'No active documents.';

const FILE_TOKEN_RE = /\b[\w.-]+\.(txt|md|json|csv|pdf|docx?|tsx?|jsx?|py|rs|html|css)\b/i;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const HASH_RE = /\b(?:fnv1a64:)?[0-9a-f]{16,}\b/i;
const SNAKE_CASE_RE = /\b[a-z][a-z0-9]*_[a-z0-9_]{2,}\b/;
const CAMEL_CASE_RE = /\b[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b/;
const LONG_DIGIT_TOKEN_RE = /\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{10,}\b/;
const CITATION_RE = /\bKB\d+\b/i;

const GRAPH_PATTERNS = [
  /\brelated\b/i,
  /\bconnected\b/i,
  /\brelationship\b/i,
  /\blink\b/i,
  /\boverlap\b/i,
  /\bthrough\b/i,
  /\bassociated\b/i,
  /\bdepends on\b/i,
  /\bconnects\b/i,
  /\bgraph\b/i,
  /\btied to\b/i,
  /\bwhat else is tied to\b/i,
  /\bwhat is connected to\b/i,
  /\brelationship between\b/i,
];

export interface RouteRetrievalInput {
  requestedMode: KbRetrievalMode;
  query: string;
  kbStats: Pick<KbStats, 'documentCount' | 'chunkCount'>;
  semanticStatus: KbEmbeddingStatus;
}

function traceBase(input: RouteRetrievalInput): Omit<RetrievalRouteTrace, 'resolvedMode' | 'routeReason'> {
  return {
    requestedMode: input.requestedMode,
    semanticIndexState: input.semanticStatus.state,
    semanticReady: input.semanticStatus.ready,
    activeChunkCount: input.semanticStatus.activeChunkCount,
    embeddedActiveChunkCount: input.semanticStatus.embeddedActiveChunkCount,
    missingActiveChunkCount: input.semanticStatus.missingActiveChunkCount,
    graphExpansionAttempted: false,
    localOnly: true,
    attachEnabled: false,
    selectedResultCount: 0,
    resultCount: 0,
  };
}

function completeTrace(
  input: RouteRetrievalInput,
  resolvedMode: KbResolvedRetrievalMode,
  routeReason: string,
  extra: Partial<RetrievalRouteTrace> = {},
): RetrievalRouteTrace {
  return {
    ...traceBase(input),
    resolvedMode,
    routeReason,
    ...extra,
  };
}

export function isStrongLexicalIntent(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  return (
    /"[^"]+"/.test(trimmed) ||
    /'[^']+'/.test(trimmed) ||
    FILE_TOKEN_RE.test(trimmed) ||
    UUID_RE.test(trimmed) ||
    HASH_RE.test(trimmed) ||
    SNAKE_CASE_RE.test(trimmed) ||
    CITATION_RE.test(trimmed) ||
    trimmed.split(/\s+/).some((token) => {
      const stripped = token.replace(/[^\w]/g, '');
      return (
        stripped.length >= 12 &&
        (CAMEL_CASE_RE.test(stripped) || LONG_DIGIT_TOKEN_RE.test(stripped))
      );
    })
  );
}

export function isStrongGraphIntent(query: string): boolean {
  return GRAPH_PATTERNS.some((pattern) => pattern.test(query));
}

export function isConceptualQuery(query: string): boolean {
  const words = query
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return query.includes('?') || words.length >= 3;
}

export function routeRetrieval(input: RouteRetrievalInput): RetrievalRouteTrace {
  const query = input.query.trim();
  if (!query) {
    return completeTrace(input, 'none', 'Empty query.');
  }

  if (input.kbStats.documentCount <= 0 || input.kbStats.chunkCount <= 0) {
    return completeTrace(input, 'none', NO_DOCUMENTS_REASON, {
      warningMessage: NO_DOCUMENTS_REASON,
    });
  }

  if (input.requestedMode !== 'auto') {
    const requested = input.requestedMode as KbRetrievalKind;
    return completeTrace(input, requested, `Manual ${requested} retrieval selected.`, {
      graphExpansionAttempted: requested === 'graph',
    });
  }

  if (isStrongLexicalIntent(query)) {
    return completeTrace(input, 'lexical', LEXICAL_REASON);
  }

  if (isStrongGraphIntent(query)) {
    if (input.semanticStatus.ready) {
      return completeTrace(input, 'graph', GRAPH_READY_REASON, {
        graphExpansionAttempted: true,
      });
    }
    return completeTrace(input, 'lexical', GRAPH_FALLBACK_REASON, {
      graphExpansionAttempted: false,
      fallbackFrom: 'graph',
      fallbackReason: GRAPH_FALLBACK_REASON,
      warningMessage: GRAPH_FALLBACK_REASON,
    });
  }

  if (isConceptualQuery(query)) {
    if (input.semanticStatus.ready) {
      return completeTrace(input, 'hybrid', CONCEPTUAL_READY_REASON);
    }
    return completeTrace(input, 'lexical', SEMANTIC_FALLBACK_REASON, {
      fallbackFrom: 'hybrid',
      fallbackReason: SEMANTIC_FALLBACK_REASON,
      warningMessage: SEMANTIC_FALLBACK_REASON,
    });
  }

  return completeTrace(input, 'lexical', DEFAULT_REASON);
}

