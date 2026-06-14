/**
 * SIEM audit forwarding (Phase 8, Slice 8.6).
 *
 * Forwards every AuditRecord to an HTTP endpoint via fire-and-forget POST.
 * Off by default.  Respects the Network gate — no traffic when gate is closed.
 *
 * Injection pattern (mirrors pools.ts / configurePoolBackend):
 *   • configureSiem(config, isNetworkOpen) — called from AppState startup
 *   • forwardToSiem(record)               — called from KnowledgeStore.appendAudit
 *
 * Storage key: codename:siem:v1  — { url: string; enabled: boolean }
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AuditRecord } from '../types';

// ---------------------------------------------------------------------------
// Config type + persistence
// ---------------------------------------------------------------------------

export interface SiemConfig {
  /** HTTP(S) endpoint to POST audit events to. */
  url: string;
  /** Master on/off switch independent of URL presence. */
  enabled: boolean;
}

const SIEM_KEY = 'codename:siem:v1';

export function loadSiemConfig(): SiemConfig | null {
  try {
    const raw = localStorage.getItem(SIEM_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SiemConfig;
  } catch {
    return null;
  }
}

export function saveSiemConfig(cfg: SiemConfig | null): void {
  if (cfg === null) {
    localStorage.removeItem(SIEM_KEY);
  } else {
    localStorage.setItem(SIEM_KEY, JSON.stringify(cfg));
  }
}

// ---------------------------------------------------------------------------
// Runtime state (injected at startup)
// ---------------------------------------------------------------------------

let _config: SiemConfig | null = null;
/** Injected gate check — returns true when network is open. */
let _isNetworkOpen: () => boolean = () => false;

/**
 * Wire the SIEM forwarder.  Called once from AppStateProvider startup effect.
 *
 * @param config       Persisted config (url + enabled flag); null = off.
 * @param isNetworkOpen Thunk returning the live network-gate state.
 */
export function configureSiem(
  config: SiemConfig | null,
  isNetworkOpen: () => boolean,
): void {
  _config = config;
  _isNetworkOpen = isNetworkOpen;
}

// ---------------------------------------------------------------------------
// Forwarder
// ---------------------------------------------------------------------------

/**
 * Forward an AuditRecord to the configured SIEM endpoint.
 * Fire-and-forget: errors are logged to console.warn but never thrown.
 * No-op when SIEM is not configured, disabled, or the network gate is closed.
 */
export function forwardToSiem(record: AuditRecord): void {
  if (!_config?.enabled || !_config.url) return;
  if (!_isNetworkOpen()) return;

  void fetch(_config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Codename-Source': 'audit',
    },
    body: JSON.stringify(record),
  }).catch((err: unknown) =>
    console.warn('[siem] forward failed:', err instanceof Error ? err.message : err),
  );
}
