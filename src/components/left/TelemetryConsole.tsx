/**
 * TelemetryConsole — real-time metrics panel (Phase 9, Slice 9.4).
 *
 * Shows true counts from the KG store (nodes, edges, chunks, legacy hash vectors)
 * and derived counts from the active task log (tool calls, estimated tokens).
 * Polls the store every 15 s so the numbers reflect reality without flooding IDB.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../state/AppState';
import { kgStore } from '../../kg/store';

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function fmtK(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

interface StoreCounts {
  nodes: number;
  edges: number;
  chunks: number;
  vectors: number;
  audit: number;
}

export function TelemetryConsole() {
  const { tasks, endpoints, bootTs, watchdogHealth } = useApp();
  const [, tick] = useState(0);
  const [counts, setCounts] = useState<StoreCounts>({
    nodes: 0, edges: 0, chunks: 0, vectors: 0, audit: 0,
  });

  // Uptime ticker (1 s)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Real store counts (every 15 s + on mount)
  useEffect(() => {
    const fetch = () => kgStore.counts().then(setCounts).catch(() => {});
    fetch();
    const t = setInterval(fetch, 15_000);
    return () => clearInterval(t);
  }, []);

  // Tool call count — messages with role === 'tool' across all tasks
  const toolCalls = useMemo(
    () => tasks.flatMap((t) => t.messages).filter((m) => m.role === 'tool').length,
    [tasks],
  );

  // Token estimate — total message characters ÷ 4 (rough approximation)
  const tokenEst = useMemo(() => {
    const chars = tasks
      .flatMap((t) => t.messages)
      .reduce((s, m) => s + (m.content?.length ?? 0), 0);
    return Math.floor(chars / 4);
  }, [tasks]);

  const ready = endpoints.filter((e) => e.status === 'ready').length;

  // Watchdog health colouring (9.2)
  const healthColour =
    watchdogHealth === 'ok'
      ? 'text-emerald-400/80'
      : watchdogHealth === 'degraded'
        ? 'text-amber-400/80'
        : watchdogHealth === 'offline'
          ? 'text-red-400/80'
          : 'text-neutral-400';
  const healthLabel =
    watchdogHealth === 'ok'
      ? 'OK'
      : watchdogHealth === 'degraded'
        ? 'WARN'
        : watchdogHealth === 'offline'
          ? 'DOWN'
          : '···';

  const rows: [string, string, string?][] = [
    ['UPTIME',   fmtUptime(Date.now() - bootTs)],
    ['KG NODES', fmtK(counts.nodes)],
    ['KG EDGES', fmtK(counts.edges)],
    ['CHUNKS',   fmtK(counts.chunks)],
    ['HASH VECS',  fmtK(counts.vectors)],
    ['TOOLS',    fmtK(toolCalls)],
    ['~TOKENS',  fmtK(tokenEst)],
    ['DB LOOPS', `${ready}/${endpoints.length}`],
    ['SIDECAR',  healthLabel, healthColour],
  ];

  return (
    <div className="absolute bottom-10 left-2 z-20 w-44 pointer-events-auto type-meta font-mono">
      <div className="type-label text-neutral-400 uppercase tracking-wider mb-1">Telemetry</div>
      <div className="bg-neutral-950/80 border border-neutral-800 backdrop-blur-sm p-2 grid grid-cols-2 gap-y-1">
        {rows.map(([k, v, colour]) => (
          <div key={k} className="contents">
            <span className="text-neutral-400">{k}</span>
            <span className={`text-right ${colour ?? 'text-emerald-400/80'}`}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
