import type { SystemConfig } from '../types';

/**
 * Central, tunable runtime config (Phase 0, P0.4). Defaults are sane starting
 * points — tune by eye/perf later without touching component code.
 */
export const systemConfig: SystemConfig = {
  // Screen-space LOD ladder (projected pixels):
  //   >= 140px        -> full readable card
  //   40px .. 140px   -> small typed label
  //   < 40px          -> dot / icon
  //   community > 24  -> collapse to a GraphRAG cluster node
  lod: {
    fullCardMinPx: 140,
    labelMinPx: 40,
    clusterWhenCommunityGt: 24,
  },
  // Shared supervised pools (Phase 5) — protect a laptop.
  pools: {
    maxBrowserContexts: 4,
    maxAgents: 3,
    idleEvictMs: 5 * 60_000,
  },
  // Python sidecar transport/supervision (Phase 3).
  sidecar: {
    host: '127.0.0.1',
    bind: 'ephemeral',
    warmStart: true,
    healthIntervalMs: 5_000,
    restartBackoffMs: 2_000,
  },
};
