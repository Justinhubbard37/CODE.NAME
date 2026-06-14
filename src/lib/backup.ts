/**
 * Workspace backup, restore, and open-format export utilities (Phase 7).
 *
 * Slice 7.3 — Encrypted backup/restore:
 *   exportWorkspace(passphrase) — serialises nodes/edges/audit/config to a
 *     JSON bundle, encrypts it with AES-GCM-256 (key derived via PBKDF2),
 *     and triggers a browser download of a `.codename` file.
 *   importWorkspace(file, passphrase) — decrypts and parses the bundle;
 *     returns the raw workspace data so the caller can confirm + apply it.
 *
 * Slice 7.4 — Open-format exports (read-only):
 *   exportGraphJSON / exportGraphCSV — nodes + edges.
 *   exportAuditJSON / exportAuditCSV — the full audit ledger.
 *
 * All exports use the browser's <a download> mechanism — no extra Tauri
 * plugins or Rust commands are required.
 * Encryption relies entirely on SubtleCrypto (Web Crypto API); the passphrase
 * never leaves the process.
 */
import type { AppNode, Edge, AuditRecord } from '../types';
import { kgStore } from '../kg/store';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WorkspaceBundle {
  version: 1;
  exportedAt: number;
  nodes: AppNode[];
  edges: Edge[];
  audit: AuditRecord[];
  /** JSON-serialised localStorage config (endpoints, profiles, gates). */
  config: string;
}

interface EncryptedBundle {
  version: 1;
  algorithm: 'AES-GCM-256';
  /** Base64-encoded 16-byte PBKDF2 salt. */
  salt: string;
  /** Base64-encoded 12-byte AES-GCM IV. */
  iv: string;
  /** Base64-encoded AES-GCM ciphertext of JSON.stringify(WorkspaceBundle). */
  data: string;
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 200_000;
const CONFIG_KEY = 'codename:config:v1';

function b64Encode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64Decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ── Download helper ───────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ── Slice 7.3 — Encrypted workspace backup / restore ─────────────────────────

/**
 * Collect all KG data + config, encrypt with the given passphrase, and
 * trigger a `.codename` file download.
 *
 * Encryption: PBKDF2 (SHA-256, 200k rounds) → AES-GCM-256.
 * File format: JSON EncryptedBundle (salt/iv/data are base64).
 */
export async function exportWorkspace(passphrase: string): Promise<void> {
  const [nodes, edges, audit] = await Promise.all([
    kgStore.getAllNodes(),
    kgStore.getAllEdges(),
    kgStore.getAudit(),
  ]);
  const config = (typeof localStorage !== 'undefined' && localStorage.getItem(CONFIG_KEY)) ?? '';

  const bundle: WorkspaceBundle = { version: 1, exportedAt: Date.now(), nodes, edges, audit, config };
  const plaintext = new TextEncoder().encode(JSON.stringify(bundle));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  const encrypted: EncryptedBundle = {
    version: 1,
    algorithm: 'AES-GCM-256',
    salt: b64Encode(salt),
    iv: b64Encode(iv),
    data: b64Encode(ciphertext),
  };

  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  triggerDownload(
    new Blob([JSON.stringify(encrypted, null, 2)], { type: 'application/json' }),
    `codename-workspace-${ts}.codename`,
  );
}

/**
 * Decrypt and parse a `.codename` backup file.
 * Returns the decoded WorkspaceBundle — the caller must confirm before applying.
 *
 * Throws a human-readable error on wrong passphrase or corrupted file.
 */
export async function importWorkspace(
  file: File,
  passphrase: string,
): Promise<WorkspaceBundle> {
  let encrypted: EncryptedBundle;
  try {
    encrypted = JSON.parse(await file.text()) as EncryptedBundle;
  } catch {
    throw new Error('File is not valid JSON — is this a .codename backup?');
  }
  if (encrypted.version !== 1 || encrypted.algorithm !== 'AES-GCM-256') {
    throw new Error('Unrecognised backup format or version.');
  }

  const salt = b64Decode(encrypted.salt);
  const iv = b64Decode(encrypted.iv);
  const ciphertext = b64Decode(encrypted.data);

  let plaintext: ArrayBuffer;
  try {
    const key = await deriveKey(passphrase, salt);
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    throw new Error('Decryption failed — check the passphrase and try again.');
  }

  try {
    return JSON.parse(new TextDecoder().decode(plaintext)) as WorkspaceBundle;
  } catch {
    throw new Error('Backup decrypted but the content is malformed.');
  }
}

/**
 * Apply a decoded WorkspaceBundle to the live store:
 * clears the database, imports all records, and restores the config.
 * Callers MUST show a confirmation dialog before calling this.
 */
export async function applyWorkspace(bundle: WorkspaceBundle): Promise<void> {
  await kgStore.clearAll();
  if (bundle.nodes.length) await kgStore.putNodes(bundle.nodes);
  if (bundle.edges.length) await kgStore.putEdges(bundle.edges);
  for (const r of bundle.audit) {
    // Re-append preserving stored prevHash (don't re-chain — trust the bundle's chain).
    await kgStore.appendAudit(r);
  }
  if (bundle.config && typeof localStorage !== 'undefined') {
    localStorage.setItem(CONFIG_KEY, bundle.config);
  }
}

// ── Slice 7.4 — Open-format exports ─────────────────────────────────────────

/** Export nodes + edges as a single JSON file (open format, read-only). */
export async function exportGraphJSON(): Promise<void> {
  const [nodes, edges] = await Promise.all([kgStore.getAllNodes(), kgStore.getAllEdges()]);
  const payload = { exportedAt: new Date().toISOString(), nodes, edges };
  triggerDownload(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    'codename-graph.json',
  );
}

/** Export nodes + edges as two CSV files concatenated with a section header. */
export async function exportGraphCSV(): Promise<void> {
  const [nodes, edges] = await Promise.all([kgStore.getAllNodes(), kgStore.getAllEdges()]);

  const nodeRows = [
    'id,type,label,title,description,date,status',
    ...nodes.map((n) =>
      [
        n.id,
        n.type ?? '',
        n.data?.label ?? '',
        n.data?.title ?? '',
        n.data?.description ?? '',
        n.data?.date ?? '',
        n.data?.status ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    ),
  ].join('\n');

  const edgeRows = [
    'id,source,target',
    ...edges.map((e) =>
      [e.id, e.source, e.target].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','),
    ),
  ].join('\n');

  const csv = `# NODES\n${nodeRows}\n\n# EDGES\n${edgeRows}\n`;
  triggerDownload(new Blob([csv], { type: 'text/csv' }), 'codename-graph.csv');
}

/** Export the full audit ledger as JSON. */
export async function exportAuditJSON(): Promise<void> {
  const audit = await kgStore.getAudit();
  audit.sort((a, b) => a.ts - b.ts);
  const payload = { exportedAt: new Date().toISOString(), count: audit.length, audit };
  triggerDownload(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    'codename-audit.json',
  );
}

/** Export the full audit ledger as CSV. */
export async function exportAuditCSV(): Promise<void> {
  const audit = await kgStore.getAudit();
  audit.sort((a, b) => a.ts - b.ts);
  const rows = [
    'id,ts,isoTime,action,actorKind,actorId,targetKind,targetId,allowed,diff,prevHash',
    ...audit.map((r) =>
      [
        r.id,
        r.ts,
        new Date(r.ts).toISOString(),
        r.action,
        r.actor.kind,
        r.actor.id,
        r.target.kind,
        r.target.id,
        r.decision.allowed ? 'true' : 'false',
        r.diff ?? '',
        r.prevHash ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    ),
  ].join('\n');
  triggerDownload(new Blob([rows + '\n'], { type: 'text/csv' }), 'codename-audit.csv');
}
