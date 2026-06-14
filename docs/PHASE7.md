# Phase 7 — Data Safety

## Slice 7.1 — Encrypt data at rest — DEFERRED

The spec targets "SQLite encryption (SQLCipher-style) with a key from the OS keychain." The app currently stores its knowledge graph in **IndexedDB** (Tauri webview), not SQLite. Slice 4.6 (SQLite storage backend) was explicitly deferred; without a SQLite layer there is no SQLCipher integration point.

7.1 is blocked by 4.6. It will be implemented in the same pass that delivers the SQLite backend — the OS keychain infrastructure (`secret_get`/`secret_set` via the `keyring` crate) is already in place.

---

## Slice 7.2 — Tamper-evident hash chain audit log

**Done when:** editing any past record breaks the chain and the verify button catches it.

### Design

Each `AuditRecord` now carries an optional `prevHash` field. When a record is appended:
1. `KnowledgeStore.getLastAuditRecord()` fetches the most-recently-stored record.
2. `hashAuditRecord(prev)` computes a deterministic SHA-256 over canonical JSON (keys sorted alphabetically) of that record.
3. The new record is stored as `{ ...r, prevHash: hash }`. The first (genesis) record has no `prevHash`.

To verify: `verifyAuditChain(records[])` sorts by `(ts, id)`, then for each consecutive pair asserts that `hashAuditRecord(prev) === curr.prevHash`. The first broken link is reported with the offending record's id.

### Changes

| File | What changed |
|------|-------------|
| `src/types.ts` | Added `prevHash?: string` to `AuditRecord`. |
| `src/kg/commit.ts` | Added `hashAuditRecord(r)` (SubtleCrypto SHA-256, sorted-key canonical JSON → 64-char hex). Added `verifyAuditChain(records[])` (sort chronologically, check consecutive prevHash links). |
| `src/kg/store.ts` | Added `getLastAuditRecord()`. Enhanced `appendAudit()` to compute and attach `prevHash` before writing. Added `clearAll()` for workspace import. |
| `src/components/right/AuditLedger.tsx` | Added "verify" button (ShieldCheck icon). Shows result banner: ✓ chain intact / ✗ chain broken at `<id>`. Each row now shows the short hash prefix (`#xxxxxxxx`). |
| `src/kg/commit.test.ts` | 10 new tests: hash determinism, field sensitivity, chain verification for 2-record and 3-record ledgers, tampered-record detection (both first and second record tampered), early-stop at first broken link. |

---

## Slice 7.3 — Backup and restore

**Done when:** you can export, wipe, import, and get your graph back.  
**Stays safe:** import requires passphrase, shows item counts, demands `window.confirm` before overwriting. App reloads after import to guarantee a clean state.

### Encryption scheme

```
passphrase → PBKDF2(SHA-256, 200 000 rounds, 16-byte random salt) → AES-GCM-256 key
workspace JSON → AES-GCM encrypt(key, 12-byte random IV) → ciphertext
```

File format (`.codename`):
```json
{
  "version": 1,
  "algorithm": "AES-GCM-256",
  "salt": "<base64-16-bytes>",
  "iv":   "<base64-12-bytes>",
  "data": "<base64-ciphertext>"
}
```

Workspace bundle (plaintext inside the ciphertext):
```json
{ "version": 1, "exportedAt": 1234567890000,
  "nodes": [...], "edges": [...], "audit": [...], "config": "..." }
```

`config` is the raw `localStorage` JSON for endpoints, profiles, and gates.

### Changes

| File | What changed |
|------|-------------|
| `src/lib/backup.ts` | New file. `exportWorkspace(passphrase)` — collect + encrypt + download. `importWorkspace(file, passphrase)` — decrypt + parse + return bundle (throws human-readable errors). `applyWorkspace(bundle)` — `clearAll()` + re-import all records + restore config. |
| `src/components/config/StealthDrawer.tsx` | Added "Data" section with Export / Import buttons, inline passphrase inputs, status messages, and hidden `<input type="file">` for file picking. |

No new Tauri plugins or Rust commands needed — all file I/O uses browser `<a download>` and `<input type="file">`.

---

## Slice 7.4 — Export data in open formats

**Done when:** users can export the graph and audit to standard files.  
**Stays safe:** export is read-only.

### Added to `src/lib/backup.ts`

| Function | Output |
|----------|--------|
| `exportGraphJSON()` | `codename-graph.json` — `{exportedAt, nodes[], edges[]}` |
| `exportGraphCSV()` | `codename-graph.csv` — two sections: `# NODES` (id,type,label,title,description,date,status) and `# EDGES` (id,source,target) |
| `exportAuditJSON()` | `codename-audit.json` — `{exportedAt, count, audit[]}` sorted by ts |
| `exportAuditCSV()` | `codename-audit.csv` — id,ts,isoTime,action,actorKind,actorId,targetKind,targetId,allowed,diff,prevHash |

All four buttons appear in the StealthDrawer "Open export" sub-section.

---

## Test run

```
Test Files  5 passed (5)
     Tests  38 passed (38)      (+10 hash chain tests)
  Duration  ~2s
```

---

## Architecture summary

```
AuditLedger.tsx ──[verify]──► verifyAuditChain(all records)
                                    │
                             sort by (ts, id)
                             for each pair: hashAuditRecord(prev) === curr.prevHash?
                                    │
                             ✓ intact / ✗ broken at <id>

KgStore.appendAudit(r)
  └─ getLastAuditRecord() → prev
  └─ hashAuditRecord(prev) → prevHash
  └─ store { ...r, prevHash }

StealthDrawer [Data section]
  ├─ Export Workspace ──► exportWorkspace(passphrase) ──► PBKDF2+AES-GCM ──► .codename download
  ├─ Import Workspace ──► importWorkspace(file, passphrase) ──► confirm ──► applyWorkspace ──► reload
  ├─ Graph JSON / CSV  ──► exportGraphJSON / exportGraphCSV
  └─ Audit JSON / CSV  ──► exportAuditJSON / exportAuditCSV
```
