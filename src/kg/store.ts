/**
 * KnowledgeStore — persistent local store for the knowledge graph (Phase 1).
 * IndexedDB-backed (works in the Tauri webview and the browser), with an
 * in-memory fallback. Designed so a Tauri-SQLite adapter can replace the
 * backend later behind this same interface.
 *
 * DB_VERSION 2 (Phase 4, Slice 4.2): adds `chunks` and `vectors` stores for
 * per-node embedding vectors and text chunks used by VectorRetriever.
 */
import type { AppNode, Edge, AuditRecord } from '../types';
import { hashAuditRecord } from './commit';
import { forwardToSiem } from '../lib/siem';

/** Mutable DB name — overridden at startup by initWorkspaceStore() (Phase 8.3). */
let _dbName = 'codename-kg';
const DB_VERSION = 2;

/**
 * Set the IndexedDB name for the active workspace.
 * Must be called before any store operation.  Resets the connection if the
 * name changes (so a page reload after workspace switch starts fresh).
 */
export function initWorkspaceStore(dbName: string): void {
  if (_dbName !== dbName) {
    _dbName = dbName;
    dbp = null; // reset pending connection so next open() uses new name
  }
}
type StoreName = 'nodes' | 'edges' | 'audit' | 'chunks' | 'vectors';

const hasIDB = typeof indexedDB !== 'undefined';

const mem = {
  nodes: new Map<string, AppNode>(),
  edges: new Map<string, Edge>(),
  audit: [] as AuditRecord[],
  chunks: new Map<string, { id: string; nodeId: string; text: string }>(),
  vectors: new Map<string, { id: string; vec: number[] }>(),
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_dbName, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Core stores (DB_VERSION 1)
      for (const s of ['nodes', 'edges', 'audit'] as const) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
      // Vector stores (DB_VERSION 2)
      if (!db.objectStoreNames.contains('chunks')) {
        const cs = db.createObjectStore('chunks', { keyPath: 'id' });
        cs.createIndex('nodeId', 'nodeId', { unique: false });
      }
      if (!db.objectStoreNames.contains('vectors')) {
        db.createObjectStore('vectors', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbp: Promise<IDBDatabase> | null = null;
const db = () => (dbp ??= openDB());

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  if (!hasIDB) {
    if (store === 'audit') return mem.audit as unknown as T[];
    return Array.from((mem[store] as Map<string, unknown>).values()) as T[];
  }
  const tx = (await db()).transaction(store, 'readonly');
  const req = tx.objectStore(store).getAll() as IDBRequest<T[]>;
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

/**
 * Read a single page from a store (Phase 10, Slice 10.1 — "load graph data in
 * pages"). IndexedDB path uses a cursor + `advance(offset)` so it never
 * materialises the whole store; the in-memory fallback slices the values array.
 * `offset` must be >= 0; `limit` is the maximum number of records returned.
 */
async function getPage<T>(store: StoreName, offset: number, limit: number): Promise<T[]> {
  const off = Math.max(0, Math.floor(offset));
  const lim = Math.max(0, Math.floor(limit));
  if (lim === 0) return [];
  if (!hasIDB) {
    if (store === 'audit') return mem.audit.slice(off, off + lim) as unknown as T[];
    const values = Array.from((mem[store] as Map<string, unknown>).values());
    return values.slice(off, off + lim) as T[];
  }
  const tx = (await db()).transaction(store, 'readonly');
  const os = tx.objectStore(store);
  return new Promise<T[]>((res, rej) => {
    const out: T[] = [];
    // When off === 0 we are already positioned; otherwise advance once.
    let positioned = off === 0;
    const req = os.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) {
        res(out);
        return;
      }
      if (!positioned) {
        positioned = true;
        cur.advance(off); // off >= 1 here, so this is always valid
        return;
      }
      out.push(cur.value as T);
      if (out.length >= lim) {
        res(out);
        return;
      }
      cur.continue();
    };
    req.onerror = () => rej(req.error);
  });
}

async function countStore(store: StoreName): Promise<number> {
  if (!hasIDB) {
    if (store === 'audit') return mem.audit.length;
    return (mem[store] as Map<string, unknown>).size;
  }
  const tx = (await db()).transaction(store, 'readonly');
  const req = tx.objectStore(store).count();
  return new Promise<number>((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function putAll(store: 'nodes' | 'edges' | 'chunks' | 'vectors', items: { id: string }[]): Promise<void> {
  if (!hasIDB) {
    for (const it of items) (mem[store] as Map<string, unknown>).set(it.id, it);
    return;
  }
  const tx = (await db()).transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const it of items) os.put(it);
  return done(tx);
}

async function remove(store: 'nodes' | 'edges', id: string): Promise<void> {
  if (!hasIDB) {
    (mem[store] as Map<string, unknown>).delete(id);
    return;
  }
  const tx = (await db()).transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  return done(tx);
}

export interface VectorRecord {
  id: string;        // nodeId — one vector per node
  vec: number[];
}

export interface ChunkRecord {
  id: string;        // `${nodeId}-${chunkIndex}`
  nodeId: string;
  text: string;
}

export class KnowledgeStore {
  getAllNodes() { return getAll<AppNode>('nodes'); }
  getAllEdges() { return getAll<Edge>('edges'); }
  getAudit() { return getAll<AuditRecord>('audit'); }
  putNodes(ns: AppNode[]) { return putAll('nodes', ns as { id: string }[]); }
  putEdges(es: Edge[]) { return putAll('edges', es as { id: string }[]); }
  deleteNode(id: string) { return remove('nodes', id); }
  deleteEdge(id: string) { return remove('edges', id); }
  /**
   * Fetch the most-recently-appended audit record (used for hash chaining).
   * Returns undefined when the ledger is empty.
   */
  async getLastAuditRecord(): Promise<AuditRecord | undefined> {
    const all = await this.getAudit();
    if (!all.length) return undefined;
    return all.reduce((latest, r) => (r.ts > latest.ts ? r : latest));
  }

  /**
   * Append an audit record, attaching prevHash to form the tamper-evident
   * hash chain (Phase 7, Slice 7.2). The hash is computed over the previous
   * record in chronological order; the first record has no prevHash (genesis).
   */
  async appendAudit(r: AuditRecord): Promise<void> {
    const prev = await this.getLastAuditRecord();
    const toStore: AuditRecord = prev
      ? { ...r, prevHash: await hashAuditRecord(prev) }
      : r;
    forwardToSiem(toStore); // 8.6: fire-and-forget SIEM forwarding
    if (!hasIDB) { mem.audit.push(toStore); return; }
    const tx = (await db()).transaction('audit', 'readwrite');
    tx.objectStore('audit').put(toStore);
    return done(tx);
  }

  /** Delete all records from every store (used by workspace import). */
  async clearAll(): Promise<void> {
    if (!hasIDB) {
      mem.nodes.clear(); mem.edges.clear(); mem.audit.length = 0;
      mem.chunks.clear(); mem.vectors.clear();
      return;
    }
    const stores: StoreName[] = ['nodes', 'edges', 'audit', 'chunks', 'vectors'];
    const tx = (await db()).transaction(stores, 'readwrite');
    for (const s of stores) tx.objectStore(s).clear();
    return done(tx);
  }

  // ---------- Phase 4 vector / chunk helpers ----------

  getAllVectors() { return getAll<VectorRecord>('vectors'); }
  getAllChunks() { return getAll<ChunkRecord>('chunks'); }

  putVectors(vs: VectorRecord[]) {
    return putAll('vectors', vs);
  }
  putChunks(cs: ChunkRecord[]) {
    return putAll('chunks', cs);
  }

  async getVector(id: string): Promise<VectorRecord | undefined> {
    if (!hasIDB) return mem.vectors.get(id);
    const tx = (await db()).transaction('vectors', 'readonly');
    const req = tx.objectStore('vectors').get(id) as IDBRequest<VectorRecord | undefined>;
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  // ---------- Phase 10 paged reads (Slice 10.1) ----------

  /** Total node count without materialising the store. */
  countNodes(): Promise<number> { return countStore('nodes'); }
  /** Total edge count without materialising the store. */
  countEdges(): Promise<number> { return countStore('edges'); }

  /** Read a page of nodes by insertion/key order. */
  getNodesPage(offset: number, limit: number): Promise<AppNode[]> {
    return getPage<AppNode>('nodes', offset, limit);
  }
  /** Read a page of edges by insertion/key order. */
  getEdgesPage(offset: number, limit: number): Promise<Edge[]> {
    return getPage<Edge>('edges', offset, limit);
  }

  /**
   * Load all nodes progressively, one page at a time, invoking `onPage` with
   * each batch as it arrives. Lets the UI render the first nodes before the
   * whole graph is in memory, so a thousands-node store never blocks boot.
   * Returns the total number of nodes loaded.
   */
  async streamNodes(
    onPage: (page: AppNode[], loaded: number, total: number) => void,
    pageSize = 1000,
  ): Promise<number> {
    const total = await this.countNodes();
    let loaded = 0;
    for (let off = 0; off < total; off += pageSize) {
      const page = await this.getNodesPage(off, pageSize);
      if (!page.length) break;
      loaded += page.length;
      onPage(page, loaded, total);
    }
    return loaded;
  }

  // ---------- diagnostics ----------

  async counts() {
    const [n, e, a, v, c] = await Promise.all([
      this.getAllNodes(), this.getAllEdges(), this.getAudit(),
      this.getAllVectors(), this.getAllChunks(),
    ]);
    return { nodes: n.length, edges: e.length, audit: a.length, vectors: v.length, chunks: c.length };
  }
}

export const kgStore = new KnowledgeStore();
