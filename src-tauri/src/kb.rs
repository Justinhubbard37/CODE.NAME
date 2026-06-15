//! Rust-owned SQLite knowledge base foundation.
//!
//! This module is intentionally small and deterministic: local text ingestion,
//! schema migration, chunk storage, simple SQLite search, and live stats. It is
//! not GraphRAG and does not perform embeddings.

use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager};

const SCHEMA_VERSION: i64 = 1;
const DB_FILE: &str = "knowledge-base.sqlite3";
const MAX_INPUT_CHARS: usize = 2_000_000;
const TARGET_CHARS: usize = 1_000;
const MAX_CHARS: usize = 1_200;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbInitResult {
    pub initialized: bool,
    pub schema_version: i64,
    pub database_path: String,
    pub fts_available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbStats {
    pub initialized: bool,
    pub schema_version: i64,
    pub document_count: i64,
    pub chunk_count: i64,
    pub entity_count: i64,
    pub relationship_count: i64,
    pub retrieval_event_count: i64,
    pub fts_available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbIngestResult {
    pub document_id: String,
    pub chunk_count: usize,
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbChunk {
    pub id: String,
    pub document_id: String,
    pub workspace_id: String,
    pub ordinal: i64,
    pub text: String,
    pub char_start: i64,
    pub char_end: i64,
    pub token_estimate: i64,
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbDocument {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    pub source_uri: Option<String>,
    pub source_kind: String,
    pub mime_type: String,
    pub content_hash: String,
    pub byte_length: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub chunk_count: i64,
    pub chunks: Option<Vec<KbChunk>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbSearchResult {
    pub chunk: KbChunk,
    pub document_title: String,
    pub source_uri: Option<String>,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbEntity {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub kind: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbRelationship {
    pub id: String,
    pub workspace_id: String,
    pub source_entity_id: String,
    pub target_entity_id: String,
    pub kind: String,
    pub evidence_chunk_id: Option<String>,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbGraphNode {
    pub id: String,
    pub node_type: String,
    pub label: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub kind: Option<String>,
    pub ordinal: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbGraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub kind: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbGraphProjection {
    pub nodes: Vec<KbGraphNode>,
    pub edges: Vec<KbGraphEdge>,
}

#[derive(Debug, Clone)]
struct ChunkDraft {
    ordinal: usize,
    text: String,
    char_start: usize,
    char_end: usize,
    token_estimate: usize,
    content_hash: String,
}

#[derive(Debug, Clone, PartialEq)]
struct EntityDraft {
    name: String,
    kind: String,
    confidence: f64,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(DB_FILE))
}

fn open_app_db(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    init_schema(&conn).map_err(|e| e.to_string())?;
    Ok(conn)
}

fn content_hash(text: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in text.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("fnv1a64:{hash:016x}")
}

fn sanitize_fragment(input: &str) -> String {
    let mut out = String::new();
    for ch in input.chars().take(48) {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if !out.ends_with('_') {
            out.push('_');
        }
    }
    let out = out.trim_matches('_').to_string();
    if out.is_empty() {
        "default".to_string()
    } else {
        out
    }
}

fn normalize_entity_name(input: &str) -> String {
    input
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches(|ch: char| !ch.is_ascii_alphanumeric())
        .to_string()
}

fn entity_id(workspace_id: &str, kind: &str, name: &str) -> String {
    let key = format!(
        "{}:{}:{}",
        workspace_id.trim().to_lowercase(),
        kind.trim().to_lowercase(),
        normalize_entity_name(name).to_lowercase()
    );
    format!(
        "ent_{}_{}",
        sanitize_fragment(workspace_id),
        content_hash(&key).trim_start_matches("fnv1a64:")
    )
}

fn is_stop_word(term: &str) -> bool {
    matches!(
        term,
        "about"
            | "after"
            | "again"
            | "also"
            | "and"
            | "another"
            | "are"
            | "because"
            | "been"
            | "before"
            | "being"
            | "between"
            | "but"
            | "can"
            | "could"
            | "for"
            | "from"
            | "had"
            | "has"
            | "have"
            | "into"
            | "its"
            | "not"
            | "our"
            | "over"
            | "that"
            | "the"
            | "their"
            | "then"
            | "there"
            | "these"
            | "this"
            | "those"
            | "through"
            | "under"
            | "was"
            | "were"
            | "with"
            | "without"
            | "would"
            | "you"
            | "your"
    )
}

fn ascii_words(text: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
            current.push(ch);
        } else if !current.is_empty() {
            words.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    words
}

fn is_capitalized_token(token: &str) -> bool {
    let mut chars = token.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_ascii_uppercase()
        && token
            .chars()
            .any(|ch| ch.is_ascii_alphabetic() || ch.is_ascii_digit())
}

fn is_phrase_continuation(token: &str) -> bool {
    token.chars().all(|ch| ch.is_ascii_digit()) || is_capitalized_token(token)
}

fn is_code_like(token: &str) -> bool {
    if token.len() < 4 || is_stop_word(&token.to_lowercase()) {
        return false;
    }
    let has_upper = token.chars().any(|ch| ch.is_ascii_uppercase());
    let has_lower = token.chars().any(|ch| ch.is_ascii_lowercase());
    let has_digit = token.chars().any(|ch| ch.is_ascii_digit());
    token.contains('_')
        || token.contains('-')
        || (has_upper && has_lower)
        || (has_digit && (has_upper || has_lower))
}

fn push_entity(
    entities: &mut Vec<EntityDraft>,
    seen: &mut BTreeSet<(String, String)>,
    name: &str,
    kind: &str,
    confidence: f64,
) {
    let normalized = normalize_entity_name(name);
    if normalized.len() < 3 {
        return;
    }
    let key = (kind.to_string(), normalized.to_lowercase());
    if seen.insert(key) {
        entities.push(EntityDraft {
            name: normalized,
            kind: kind.to_string(),
            confidence,
        });
    }
}

fn extract_entities(title: &str, text: &str) -> Vec<EntityDraft> {
    let mut entities = Vec::new();
    let mut seen = BTreeSet::new();
    push_entity(&mut entities, &mut seen, title, "document_title", 1.0);

    let words = ascii_words(text);
    let mut idx = 0usize;
    while idx < words.len() {
        if !is_capitalized_token(&words[idx]) {
            idx += 1;
            continue;
        }
        let mut phrase = vec![words[idx].clone()];
        let mut j = idx + 1;
        while j < words.len() && phrase.len() < 4 && is_phrase_continuation(&words[j]) {
            phrase.push(words[j].clone());
            j += 1;
        }
        let joined = phrase.join(" ");
        if joined.len() >= 4 && !is_stop_word(&joined.to_lowercase()) {
            push_entity(&mut entities, &mut seen, &joined, "phrase", 0.82);
        }
        idx = j.max(idx + 1);
    }

    for token in &words {
        if is_code_like(token) {
            push_entity(&mut entities, &mut seen, token, "identifier", 0.88);
        }
    }

    let mut counts = BTreeMap::<String, usize>::new();
    for word in &words {
        let term = word.to_lowercase();
        if term.len() >= 4 && !is_stop_word(&term) && term.chars().any(|ch| ch.is_ascii_alphabetic()) {
            *counts.entry(term).or_default() += 1;
        }
    }
    let mut repeated = counts
        .into_iter()
        .filter(|(_, count)| *count >= 2)
        .collect::<Vec<_>>();
    repeated.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    for (term, _) in repeated.into_iter().take(8) {
        push_entity(&mut entities, &mut seen, &term, "keyword", 0.68);
    }

    entities.truncate(16);
    entities
}

fn estimate_tokens(text: &str) -> usize {
    (text.chars().count().max(1) + 3) / 4
}

fn normalize_newlines(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

fn paragraph_blocks(text: &str) -> Vec<(String, usize, usize)> {
    let normalized = normalize_newlines(text);
    let mut blocks = Vec::new();
    let mut buf = String::new();
    let mut paragraph_start = 0usize;
    let mut cursor = 0usize;

    for line in normalized.split_inclusive('\n') {
        let len = line.chars().count();
        if line.trim().is_empty() {
            push_paragraph(&mut blocks, &buf, paragraph_start);
            buf.clear();
            paragraph_start = cursor + len;
        } else {
            buf.push_str(line);
        }
        cursor += len;
    }
    if !buf.is_empty() {
        push_paragraph(&mut blocks, &buf, paragraph_start);
    }
    if blocks.is_empty() && !normalized.trim().is_empty() {
        push_paragraph(&mut blocks, &normalized, 0);
    }
    blocks
}

fn push_paragraph(out: &mut Vec<(String, usize, usize)>, raw: &str, start: usize) {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return;
    }
    let leading = raw.chars().take_while(|ch| ch.is_whitespace()).count();
    let trailing = raw
        .chars()
        .rev()
        .take_while(|ch| ch.is_whitespace())
        .count();
    let raw_len = raw.chars().count();
    out.push((
        trimmed.to_string(),
        start + leading,
        start + raw_len - trailing,
    ));
}

fn hard_split_block(text: &str, start: usize, chunks: &mut Vec<ChunkDraft>) {
    let chars: Vec<char> = text.chars().collect();
    let mut offset = 0usize;
    while offset < chars.len() {
        let end = (offset + TARGET_CHARS).min(chars.len());
        let part: String = chars[offset..end].iter().collect();
        let trimmed = part.trim().to_string();
        if !trimmed.is_empty() {
            let leading = part.chars().take_while(|ch| ch.is_whitespace()).count();
            let trailing = part
                .chars()
                .rev()
                .take_while(|ch| ch.is_whitespace())
                .count();
            let char_start = start + offset + leading;
            let char_end = start + end - trailing;
            chunks.push(ChunkDraft {
                ordinal: chunks.len(),
                token_estimate: estimate_tokens(&trimmed),
                content_hash: content_hash(&trimmed),
                text: trimmed,
                char_start,
                char_end,
            });
        }
        offset = end;
    }
}

fn chunk_text(text: &str) -> Vec<ChunkDraft> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut current_start = 0usize;
    let mut current_end = 0usize;

    let flush = |chunks: &mut Vec<ChunkDraft>,
                 current: &mut String,
                 current_start: usize,
                 current_end: usize| {
        let trimmed = current.trim().to_string();
        if !trimmed.is_empty() {
            chunks.push(ChunkDraft {
                ordinal: chunks.len(),
                token_estimate: estimate_tokens(&trimmed),
                content_hash: content_hash(&trimmed),
                text: trimmed,
                char_start: current_start,
                char_end: current_end,
            });
        }
        current.clear();
    };

    for (paragraph, start, end) in paragraph_blocks(text) {
        let paragraph_len = paragraph.chars().count();
        if paragraph_len > MAX_CHARS {
            if !current.trim().is_empty() {
                flush(&mut chunks, &mut current, current_start, current_end);
            }
            hard_split_block(&paragraph, start, &mut chunks);
            continue;
        }

        if current.trim().is_empty() {
            current_start = start;
            current_end = end;
            current.push_str(&paragraph);
            continue;
        }

        let candidate_len = current.chars().count() + 2 + paragraph_len;
        if candidate_len <= MAX_CHARS {
            current.push_str("\n\n");
            current.push_str(&paragraph);
            current_end = end;
        } else {
            flush(&mut chunks, &mut current, current_start, current_end);
            current_start = start;
            current_end = end;
            current.push_str(&paragraph);
        }
    }

    if !current.trim().is_empty() {
        flush(&mut chunks, &mut current, current_start, current_end);
    }
    chunks
}

fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        );
        ",
    )?;

    let current = current_schema_version(conn)?;
    if current < SCHEMA_VERSION {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                title TEXT NOT NULL,
                source_uri TEXT,
                source_kind TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                byte_length INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(workspace_id, content_hash)
            );

            CREATE TABLE IF NOT EXISTS chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                workspace_id TEXT NOT NULL,
                ordinal INTEGER NOT NULL,
                text TEXT NOT NULL,
                char_start INTEGER NOT NULL,
                char_end INTEGER NOT NULL,
                token_estimate INTEGER NOT NULL,
                content_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(document_id, ordinal),
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS entities (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                confidence REAL NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS relationships (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                source_entity_id TEXT NOT NULL,
                target_entity_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                evidence_chunk_id TEXT,
                confidence REAL NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(source_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
                FOREIGN KEY(target_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
                FOREIGN KEY(evidence_chunk_id) REFERENCES chunks(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS chunk_entities (
                chunk_id TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                role TEXT NOT NULL,
                PRIMARY KEY(chunk_id, entity_id, role),
                FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
                FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS retrieval_events (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                query TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                result_count INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON chunks(workspace_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id, ordinal);
            CREATE INDEX IF NOT EXISTS idx_entities_workspace ON entities(workspace_id);
            CREATE INDEX IF NOT EXISTS idx_relationships_workspace ON relationships(workspace_id);
            CREATE INDEX IF NOT EXISTS idx_retrieval_events_workspace ON retrieval_events(workspace_id);
            INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, strftime('%s','now'));
            ",
        )?;
    }

    let _ = conn.execute_batch(
        "
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts
        USING fts5(chunk_id UNINDEXED, workspace_id UNINDEXED, text);
        ",
    );

    Ok(())
}

fn current_schema_version(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )
}

fn fts_available(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'chunks_fts' LIMIT 1",
        [],
        |_| Ok(()),
    )
    .is_ok()
}

fn count_table(conn: &Connection, table: &str) -> rusqlite::Result<i64> {
    let sql = format!("SELECT COUNT(*) FROM {table}");
    conn.query_row(&sql, [], |row| row.get(0))
}

fn stats_conn(conn: &Connection) -> rusqlite::Result<KbStats> {
    init_schema(conn)?;
    Ok(KbStats {
        initialized: true,
        schema_version: current_schema_version(conn)?,
        document_count: count_table(conn, "documents")?,
        chunk_count: count_table(conn, "chunks")?,
        entity_count: count_table(conn, "entities")?,
        relationship_count: count_table(conn, "relationships")?,
        retrieval_event_count: count_table(conn, "retrieval_events")?,
        fts_available: fts_available(conn),
    })
}

#[allow(clippy::too_many_arguments)]
fn ingest_text_conn(
    conn: &mut Connection,
    workspace_id: &str,
    title: &str,
    text: &str,
    source_uri: Option<&str>,
    source_kind: Option<&str>,
    mime_type: Option<&str>,
) -> Result<KbIngestResult, String> {
    let workspace_id = workspace_id.trim();
    let title = title.trim();
    if workspace_id.is_empty() {
        return Err("workspace_id is required".to_string());
    }
    if title.is_empty() {
        return Err("title is required".to_string());
    }
    if text.trim().is_empty() {
        return Err("text is required".to_string());
    }
    if text.chars().count() > MAX_INPUT_CHARS {
        return Err("text is too large for this ingestion slice".to_string());
    }

    init_schema(conn).map_err(|e| e.to_string())?;
    let normalized = normalize_newlines(text);
    let doc_hash = content_hash(&normalized);
    let doc_id = format!(
        "doc_{}_{}",
        sanitize_fragment(workspace_id),
        doc_hash.trim_start_matches("fnv1a64:"),
    );
    let chunks = chunk_text(&normalized);
    if chunks.is_empty() {
        return Err("text produced no chunks".to_string());
    }

    let now = now_ms();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "
        INSERT INTO documents(
            id, workspace_id, title, source_uri, source_kind, mime_type,
            content_hash, byte_length, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            source_uri = excluded.source_uri,
            source_kind = excluded.source_kind,
            mime_type = excluded.mime_type,
            byte_length = excluded.byte_length,
            updated_at = excluded.updated_at
        ",
        params![
            doc_id,
            workspace_id,
            title,
            source_uri,
            source_kind.unwrap_or("text"),
            mime_type.unwrap_or("text/plain"),
            doc_hash,
            normalized.len() as i64,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    let old_chunk_ids: Vec<String> = {
        let mut stmt = tx
            .prepare("SELECT id FROM chunks WHERE document_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![doc_id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };
    if fts_available(&tx) {
        for chunk_id in &old_chunk_ids {
            tx.execute(
                "DELETE FROM chunks_fts WHERE chunk_id = ?1",
                params![chunk_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    for chunk_id in &old_chunk_ids {
        tx.execute(
            "DELETE FROM relationships WHERE evidence_chunk_id = ?1",
            params![chunk_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM chunk_entities WHERE chunk_id = ?1",
            params![chunk_id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.execute("DELETE FROM chunks WHERE document_id = ?1", params![doc_id])
        .map_err(|e| e.to_string())?;
    tx.execute(
        "
        DELETE FROM entities
        WHERE workspace_id = ?1
          AND NOT EXISTS (
            SELECT 1 FROM chunk_entities ce WHERE ce.entity_id = entities.id
          )
        ",
        params![workspace_id],
    )
    .map_err(|e| e.to_string())?;

    for chunk in &chunks {
        let chunk_id = format!("chunk_{}_{}", doc_id, chunk.ordinal);
        tx.execute(
            "
            INSERT INTO chunks(
                id, document_id, workspace_id, ordinal, text, char_start,
                char_end, token_estimate, content_hash, created_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ",
            params![
                chunk_id,
                doc_id,
                workspace_id,
                chunk.ordinal as i64,
                chunk.text,
                chunk.char_start as i64,
                chunk.char_end as i64,
                chunk.token_estimate as i64,
                chunk.content_hash,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;
        if fts_available(&tx) {
            tx.execute(
                "INSERT INTO chunks_fts(chunk_id, workspace_id, text) VALUES (?1, ?2, ?3)",
                params![chunk_id, workspace_id, chunk.text],
            )
            .map_err(|e| e.to_string())?;
        }

        let extracted = extract_entities(title, &chunk.text);
        let mut chunk_entity_ids = BTreeSet::new();
        for entity in extracted {
            let entity_id = entity_id(workspace_id, &entity.kind, &entity.name);
            tx.execute(
                "
                INSERT INTO entities(id, workspace_id, name, kind, confidence, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    kind = excluded.kind,
                    confidence = MAX(entities.confidence, excluded.confidence),
                    updated_at = excluded.updated_at
                ",
                params![
                    entity_id,
                    workspace_id,
                    entity.name,
                    entity.kind,
                    entity.confidence,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT OR IGNORE INTO chunk_entities(chunk_id, entity_id, role) VALUES (?1, ?2, ?3)",
                params![
                    chunk_id,
                    entity_id,
                    if entity.kind == "document_title" { "document_title" } else { "mentions" },
                ],
            )
            .map_err(|e| e.to_string())?;
            chunk_entity_ids.insert(entity_id);
        }

        let entity_ids = chunk_entity_ids.into_iter().collect::<Vec<_>>();
        for i in 0..entity_ids.len() {
            for j in (i + 1)..entity_ids.len() {
                let source = &entity_ids[i];
                let target = &entity_ids[j];
                let rel_key = format!("{workspace_id}:{chunk_id}:{source}:{target}:co_occurrence");
                let rel_id = format!(
                    "rel_{}_{}",
                    sanitize_fragment(workspace_id),
                    content_hash(&rel_key).trim_start_matches("fnv1a64:")
                );
                tx.execute(
                    "
                    INSERT OR IGNORE INTO relationships(
                        id, workspace_id, source_entity_id, target_entity_id,
                        kind, evidence_chunk_id, confidence, created_at
                    )
                    VALUES (?1, ?2, ?3, ?4, 'co_occurrence', ?5, 0.72, ?6)
                    ",
                    params![rel_id, workspace_id, source, target, chunk_id, now],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    Ok(KbIngestResult {
        document_id: doc_id,
        chunk_count: chunks.len(),
        content_hash: doc_hash,
    })
}

fn sanitize_fts_query(query: &str) -> String {
    query
        .to_lowercase()
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter(|part| part.len() > 1)
        .take(16)
        .collect::<Vec<_>>()
        .join(" ")
}

fn row_to_search_result(row: &rusqlite::Row<'_>) -> rusqlite::Result<KbSearchResult> {
    Ok(KbSearchResult {
        chunk: KbChunk {
            id: row.get(0)?,
            document_id: row.get(1)?,
            workspace_id: row.get(2)?,
            ordinal: row.get(3)?,
            text: row.get(4)?,
            char_start: row.get(5)?,
            char_end: row.get(6)?,
            token_estimate: row.get(7)?,
            content_hash: row.get(8)?,
        },
        document_title: row.get(9)?,
        source_uri: row.get(10)?,
        score: row.get(11)?,
    })
}

fn insert_retrieval_event(
    conn: &Connection,
    workspace_id: &str,
    query: &str,
    result_count: usize,
) -> rusqlite::Result<()> {
    let now = now_ms();
    let event_id = format!(
        "ret_{}_{}_{}",
        sanitize_fragment(workspace_id),
        now,
        content_hash(query).trim_start_matches("fnv1a64:")
    );
    conn.execute(
        "INSERT INTO retrieval_events(id, workspace_id, query, created_at, result_count)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![event_id, workspace_id, query, now, result_count as i64],
    )?;
    Ok(())
}

fn search_conn(
    conn: &Connection,
    workspace_id: &str,
    query: &str,
    limit: i64,
) -> Result<Vec<KbSearchResult>, String> {
    let workspace_id = workspace_id.trim();
    let query = query.trim();
    if workspace_id.is_empty() {
        return Err("workspace_id is required".to_string());
    }
    if query.is_empty() {
        return Err("query is required".to_string());
    }
    init_schema(conn).map_err(|e| e.to_string())?;
    let limit = limit.clamp(1, 50);

    let mut results = Vec::new();
    let fts_query = sanitize_fts_query(query);
    if fts_available(conn) && !fts_query.is_empty() {
        let sql = "
            SELECT c.id, c.document_id, c.workspace_id, c.ordinal, c.text,
                   c.char_start, c.char_end, c.token_estimate, c.content_hash,
                   d.title, d.source_uri, bm25(chunks_fts) AS score
            FROM chunks_fts
            JOIN chunks c ON c.id = chunks_fts.chunk_id
            JOIN documents d ON d.id = c.document_id
            WHERE chunks_fts MATCH ?1 AND chunks_fts.workspace_id = ?2
            ORDER BY score ASC, c.ordinal ASC
            LIMIT ?3
        ";
        let fts_attempt = (|| -> rusqlite::Result<Vec<KbSearchResult>> {
            let mut stmt = conn.prepare(sql)?;
            let rows = stmt
                .query_map(
                    params![fts_query, workspace_id, limit],
                    row_to_search_result,
                )?
                .collect();
            rows
        })();
        if let Ok(rows) = fts_attempt {
            results = rows;
        }
    }

    if results.is_empty() {
        let needle = format!("%{}%", query.to_lowercase());
        let sql = "
            SELECT c.id, c.document_id, c.workspace_id, c.ordinal, c.text,
                   c.char_start, c.char_end, c.token_estimate, c.content_hash,
                   d.title, d.source_uri, 1.0 AS score
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.workspace_id = ?1 AND lower(c.text) LIKE ?2
            ORDER BY c.ordinal ASC
            LIMIT ?3
        ";
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        results = stmt
            .query_map(params![workspace_id, needle, limit], row_to_search_result)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
    }

    insert_retrieval_event(conn, workspace_id, query, results.len()).map_err(|e| e.to_string())?;
    Ok(results)
}

fn chunk_count_for_document(conn: &Connection, document_id: &str) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM chunks WHERE document_id = ?1",
        params![document_id],
        |row| row.get(0),
    )
}

fn chunks_for_document(conn: &Connection, document_id: &str) -> rusqlite::Result<Vec<KbChunk>> {
    let mut stmt = conn.prepare(
        "
        SELECT id, document_id, workspace_id, ordinal, text, char_start,
               char_end, token_estimate, content_hash
        FROM chunks
        WHERE document_id = ?1
        ORDER BY ordinal ASC
        ",
    )?;
    let rows = stmt
        .query_map(params![document_id], |row| {
            Ok(KbChunk {
                id: row.get(0)?,
                document_id: row.get(1)?,
                workspace_id: row.get(2)?,
                ordinal: row.get(3)?,
                text: row.get(4)?,
                char_start: row.get(5)?,
                char_end: row.get(6)?,
                token_estimate: row.get(7)?,
                content_hash: row.get(8)?,
            })
        })?
        .collect();
    rows
}

fn get_document_conn(
    conn: &Connection,
    document_id: &str,
    include_chunks: bool,
) -> Result<KbDocument, String> {
    init_schema(conn).map_err(|e| e.to_string())?;
    let mut doc = conn
        .query_row(
            "
            SELECT id, workspace_id, title, source_uri, source_kind, mime_type,
                   content_hash, byte_length, created_at, updated_at
            FROM documents
            WHERE id = ?1
            ",
            params![document_id],
            |row| {
                Ok(KbDocument {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    title: row.get(2)?,
                    source_uri: row.get(3)?,
                    source_kind: row.get(4)?,
                    mime_type: row.get(5)?,
                    content_hash: row.get(6)?,
                    byte_length: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                    chunk_count: 0,
                    chunks: None,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "document not found".to_string())?;
    doc.chunk_count = chunk_count_for_document(conn, document_id).map_err(|e| e.to_string())?;
    if include_chunks {
        doc.chunks = Some(chunks_for_document(conn, document_id).map_err(|e| e.to_string())?);
    }
    Ok(doc)
}

fn projection_documents(
    conn: &Connection,
    workspace_id: &str,
    document_id: Option<&str>,
) -> rusqlite::Result<Vec<KbDocument>> {
    let mut docs = Vec::new();
    if let Some(document_id) = document_id {
        docs.push(get_document_conn(conn, document_id, false).map_err(|_| rusqlite::Error::QueryReturnedNoRows)?);
        return Ok(docs);
    }

    let mut stmt = conn.prepare(
        "
        SELECT id, workspace_id, title, source_uri, source_kind, mime_type,
               content_hash, byte_length, created_at, updated_at
        FROM documents
        WHERE workspace_id = ?1
        ORDER BY updated_at DESC, title ASC
        LIMIT 25
        ",
    )?;
    let rows = stmt
        .query_map(params![workspace_id], |row| {
            Ok(KbDocument {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                title: row.get(2)?,
                source_uri: row.get(3)?,
                source_kind: row.get(4)?,
                mime_type: row.get(5)?,
                content_hash: row.get(6)?,
                byte_length: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
                chunk_count: 0,
                chunks: None,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for mut doc in rows {
        doc.chunk_count = chunk_count_for_document(conn, &doc.id)?;
        docs.push(doc);
    }
    Ok(docs)
}

fn graph_projection_conn(
    conn: &Connection,
    workspace_id: &str,
    document_id: Option<&str>,
) -> Result<KbGraphProjection, String> {
    let workspace_id = workspace_id.trim();
    if workspace_id.is_empty() {
        return Err("workspace_id is required".to_string());
    }
    init_schema(conn).map_err(|e| e.to_string())?;

    let docs = projection_documents(conn, workspace_id, document_id).map_err(|e| e.to_string())?;
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut entity_ids = BTreeSet::<String>::new();
    let mut chunk_ids = BTreeSet::<String>::new();
    let mut document_entity_edges = BTreeSet::<(String, String)>::new();

    for doc in &docs {
        nodes.push(KbGraphNode {
            id: doc.id.clone(),
            node_type: "document".to_string(),
            label: format!("KB_DOC_{}", sanitize_fragment(&doc.title).to_uppercase()),
            title: Some(doc.title.clone()),
            description: doc.source_uri.clone(),
            kind: Some(doc.source_kind.clone()),
            ordinal: None,
        });

        let chunks = chunks_for_document(conn, &doc.id).map_err(|e| e.to_string())?;
        for chunk in chunks {
            chunk_ids.insert(chunk.id.clone());
            nodes.push(KbGraphNode {
                id: chunk.id.clone(),
                node_type: "chunk".to_string(),
                label: format!("KB_CHUNK_{}", chunk.ordinal + 1),
                title: Some(format!("{} chunk {}", doc.title, chunk.ordinal + 1)),
                description: Some(chunk.text.chars().take(220).collect()),
                kind: Some("chunk".to_string()),
                ordinal: Some(chunk.ordinal),
            });
            edges.push(KbGraphEdge {
                id: format!("kb_edge_doc_chunk_{}_{}", doc.id, chunk.id),
                source: doc.id.clone(),
                target: chunk.id.clone(),
                kind: "document_chunk".to_string(),
                label: "document -> chunk".to_string(),
            });

            let mut stmt = conn
                .prepare(
                    "
                    SELECT e.id
                    FROM chunk_entities ce
                    JOIN entities e ON e.id = ce.entity_id
                    WHERE ce.chunk_id = ?1
                    ORDER BY e.kind ASC, e.name ASC
                    ",
                )
                .map_err(|e| e.to_string())?;
            let linked = stmt
                .query_map(params![chunk.id], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            for entity_id in linked {
                entity_ids.insert(entity_id.clone());
                document_entity_edges.insert((doc.id.clone(), entity_id.clone()));
                edges.push(KbGraphEdge {
                    id: format!("kb_edge_chunk_entity_{}_{}", chunk.id, entity_id),
                    source: chunk.id.clone(),
                    target: entity_id,
                    kind: "chunk_entity".to_string(),
                    label: "chunk -> entity".to_string(),
                });
            }
        }
    }

    for entity_id in &entity_ids {
        let entity = conn
            .query_row(
                "
                SELECT id, workspace_id, name, kind, confidence
                FROM entities
                WHERE id = ?1
                ",
                params![entity_id],
                |row| {
                    Ok(KbEntity {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        name: row.get(2)?,
                        kind: row.get(3)?,
                        confidence: row.get(4)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;
        nodes.push(KbGraphNode {
            id: entity.id,
            node_type: "entity".to_string(),
            label: format!("KB_ENT_{}", sanitize_fragment(&entity.name).to_uppercase()),
            title: Some(entity.name),
            description: Some(format!("{} · confidence {:.2}", entity.kind, entity.confidence)),
            kind: Some(entity.kind),
            ordinal: None,
        });
    }

    for (doc_id, entity_id) in document_entity_edges {
        edges.push(KbGraphEdge {
            id: format!("kb_edge_doc_entity_{}_{}", doc_id, entity_id),
            source: doc_id,
            target: entity_id,
            kind: "document_entity".to_string(),
            label: "document -> entity".to_string(),
        });
    }

    let mut relationship_stmt = conn
        .prepare(
            "
            SELECT id, workspace_id, source_entity_id, target_entity_id,
                   kind, evidence_chunk_id, confidence
            FROM relationships
            WHERE workspace_id = ?1
            ORDER BY created_at ASC, id ASC
            ",
        )
        .map_err(|e| e.to_string())?;
    let relationships = relationship_stmt
        .query_map(params![workspace_id], |row| {
            Ok(KbRelationship {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                source_entity_id: row.get(2)?,
                target_entity_id: row.get(3)?,
                kind: row.get(4)?,
                evidence_chunk_id: row.get(5)?,
                confidence: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for relationship in relationships {
        if !entity_ids.contains(&relationship.source_entity_id)
            || !entity_ids.contains(&relationship.target_entity_id)
        {
            continue;
        }
        if let Some(evidence_chunk_id) = &relationship.evidence_chunk_id {
            if !chunk_ids.contains(evidence_chunk_id) {
                continue;
            }
        }
        edges.push(KbGraphEdge {
            id: relationship.id,
            source: relationship.source_entity_id,
            target: relationship.target_entity_id,
            kind: relationship.kind.clone(),
            label: relationship.kind,
        });
    }

    Ok(KbGraphProjection { nodes, edges })
}

#[tauri::command]
pub fn kb_init(app: AppHandle) -> Result<KbInitResult, String> {
    let path = db_path(&app)?;
    let conn = open_app_db(&app)?;
    Ok(KbInitResult {
        initialized: true,
        schema_version: current_schema_version(&conn).map_err(|e| e.to_string())?,
        database_path: path.to_string_lossy().into_owned(),
        fts_available: fts_available(&conn),
    })
}

#[tauri::command]
pub fn kb_stats(app: AppHandle) -> Result<KbStats, String> {
    let conn = open_app_db(&app)?;
    stats_conn(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kb_ingest_text(
    app: AppHandle,
    workspace_id: String,
    title: String,
    text: String,
    source_uri: Option<String>,
    source_kind: Option<String>,
    mime_type: Option<String>,
) -> Result<KbIngestResult, String> {
    let mut conn = open_app_db(&app)?;
    ingest_text_conn(
        &mut conn,
        &workspace_id,
        &title,
        &text,
        source_uri.as_deref(),
        source_kind.as_deref(),
        mime_type.as_deref(),
    )
}

#[tauri::command]
pub fn kb_search(
    app: AppHandle,
    workspace_id: String,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<KbSearchResult>, String> {
    let conn = open_app_db(&app)?;
    search_conn(&conn, &workspace_id, &query, limit.unwrap_or(10))
}

#[tauri::command]
pub fn kb_get_document(
    app: AppHandle,
    document_id: String,
    include_chunks: Option<bool>,
) -> Result<KbDocument, String> {
    let conn = open_app_db(&app)?;
    get_document_conn(&conn, &document_id, include_chunks.unwrap_or(false))
}

#[tauri::command]
pub fn kb_graph_projection(
    app: AppHandle,
    workspace_id: String,
    document_id: Option<String>,
) -> Result<KbGraphProjection, String> {
    let conn = open_app_db(&app)?;
    graph_projection_conn(&conn, &workspace_id, document_id.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory sqlite");
        init_schema(&conn).expect("init schema");
        conn
    }

    #[test]
    fn db_initializes_and_migrations_run() {
        let conn = memory_db();
        assert_eq!(
            current_schema_version(&conn).expect("schema version"),
            SCHEMA_VERSION
        );
        let stats = stats_conn(&conn).expect("stats");
        assert!(stats.initialized);
        assert_eq!(stats.document_count, 0);
    }

    #[test]
    fn required_tables_exist() {
        let conn = memory_db();
        for table in [
            "schema_migrations",
            "documents",
            "chunks",
            "entities",
            "relationships",
            "chunk_entities",
            "retrieval_events",
        ] {
            let found: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type IN ('table','virtual') AND name = ?1",
                    params![table],
                    |row| row.get(0),
                )
                .expect("table lookup");
            assert_eq!(found, 1, "{table} should exist");
        }
    }

    #[test]
    fn entity_extraction_is_deterministic() {
        let text = "CODE NAME 2 tracks Project Atlas and Project Atlas with UniqueSearchTerm7391.";
        let first = extract_entities("kb-smoke-test.txt", text);
        let second = extract_entities("kb-smoke-test.txt", text);
        assert_eq!(first, second);
        assert!(first.iter().any(|e| e.name == "CODE NAME 2"));
        assert!(first.iter().any(|e| e.name == "UniqueSearchTerm7391"));
    }

    #[test]
    fn entity_extraction_ignores_stop_words() {
        let entities = extract_entities("Note", "the the and with that that stable stable");
        assert!(!entities
            .iter()
            .any(|e| matches!(e.name.as_str(), "the" | "and" | "with" | "that")));
        assert!(entities.iter().any(|e| e.name == "stable"));
    }

    #[test]
    fn document_title_becomes_entity() {
        let entities = extract_entities("kb-smoke-test.txt", "plain body");
        assert!(entities.iter().any(|e| e.name == "kb-smoke-test.txt"
            && e.kind == "document_title"));
    }

    #[test]
    fn ingest_creates_document_and_chunks() {
        let mut conn = memory_db();
        let result = ingest_text_conn(
            &mut conn,
            "default",
            "Alpha Note",
            "Alpha beta gamma.\n\nDelta epsilon.",
            Some("alpha.txt"),
            Some("file"),
            Some("text/plain"),
        )
        .expect("ingest");
        assert_eq!(result.chunk_count, 1);
        let stats = stats_conn(&conn).expect("stats");
        assert_eq!(stats.document_count, 1);
        assert_eq!(stats.chunk_count, 1);
        assert!(stats.entity_count >= 1);
    }

    #[test]
    fn chunk_order_is_deterministic() {
        let text = format!(
            "{}\n\n{}\n\n{}",
            "a ".repeat(700),
            "b ".repeat(700),
            "c ".repeat(700)
        );
        let first = chunk_text(&text);
        let second = chunk_text(&text);
        assert_eq!(first.len(), second.len());
        assert_eq!(
            first
                .iter()
                .map(|c| (&c.text, c.ordinal))
                .collect::<Vec<_>>(),
            second
                .iter()
                .map(|c| (&c.text, c.ordinal))
                .collect::<Vec<_>>()
        );
        assert!(first
            .windows(2)
            .all(|pair| pair[0].ordinal < pair[1].ordinal));
    }

    #[test]
    fn search_returns_expected_chunk_and_records_event() {
        let mut conn = memory_db();
        ingest_text_conn(
            &mut conn,
            "default",
            "Searchable",
            "The durable sqlite knowledge base stores zebra facts.",
            None,
            None,
            None,
        )
        .expect("ingest");
        let results = search_conn(&conn, "default", "zebra", 5).expect("search");
        assert_eq!(results.len(), 1);
        assert!(results[0].chunk.text.contains("zebra"));
        let stats = stats_conn(&conn).expect("stats");
        assert_eq!(stats.retrieval_event_count, 1);
    }

    #[test]
    fn ingest_stores_entities_chunk_links_and_relationships() {
        let mut conn = memory_db();
        ingest_text_conn(
            &mut conn,
            "default",
            "Project Atlas Notes",
            "CODE NAME 2 connects Project Atlas to UniqueSearchTerm7391. Project Atlas repeats.",
            None,
            None,
            None,
        )
        .expect("ingest");
        let stats = stats_conn(&conn).expect("stats");
        assert!(stats.entity_count >= 3);
        assert!(stats.relationship_count >= 1);
        assert!(count_table(&conn, "chunk_entities").expect("chunk_entities") >= 3);
    }

    #[test]
    fn graph_projection_returns_connected_nodes_and_edges() {
        let mut conn = memory_db();
        let result = ingest_text_conn(
            &mut conn,
            "default",
            "Project Atlas Notes",
            "CODE NAME 2 connects Project Atlas to UniqueSearchTerm7391. Project Atlas repeats.",
            None,
            None,
            None,
        )
        .expect("ingest");
        let projection =
            graph_projection_conn(&conn, "default", Some(&result.document_id)).expect("projection");
        assert!(projection
            .nodes
            .iter()
            .any(|node| node.node_type == "document"));
        assert!(projection.nodes.iter().any(|node| node.node_type == "chunk"));
        assert!(projection.nodes.iter().any(|node| node.node_type == "entity"));
        assert!(projection
            .edges
            .iter()
            .any(|edge| edge.label == "document -> chunk"));
        assert!(projection
            .edges
            .iter()
            .any(|edge| edge.label == "chunk -> entity"));
        assert!(projection
            .edges
            .iter()
            .any(|edge| edge.label == "document -> entity"));
        assert!(projection
            .edges
            .iter()
            .any(|edge| edge.kind == "co_occurrence"));
    }

    #[test]
    fn stats_reflect_ingested_content() {
        let mut conn = memory_db();
        ingest_text_conn(
            &mut conn,
            "default",
            "Stats",
            "one two three\n\nfour five six",
            None,
            None,
            None,
        )
        .expect("ingest");
        let stats = stats_conn(&conn).expect("stats");
        assert_eq!(stats.document_count, 1);
        assert!(stats.chunk_count >= 1);
        assert!(stats.entity_count >= 1);
    }

    #[test]
    fn duplicate_content_hash_behavior_is_deterministic() {
        let mut conn = memory_db();
        let first = ingest_text_conn(
            &mut conn,
            "default",
            "First",
            "same content",
            None,
            None,
            None,
        )
        .expect("first ingest");
        let second = ingest_text_conn(
            &mut conn,
            "default",
            "Second",
            "same content",
            None,
            None,
            None,
        )
        .expect("second ingest");
        assert_eq!(first.document_id, second.document_id);
        assert_eq!(first.content_hash, second.content_hash);
        let stats = stats_conn(&conn).expect("stats");
        assert_eq!(stats.document_count, 1);
        assert_eq!(stats.chunk_count, first.chunk_count as i64);
        let entity_count = stats.entity_count;
        let relationship_count = stats.relationship_count;
        ingest_text_conn(
            &mut conn,
            "default",
            "Third",
            "same content",
            None,
            None,
            None,
        )
        .expect("third ingest");
        let after = stats_conn(&conn).expect("stats after duplicate");
        assert_eq!(after.entity_count, entity_count);
        assert_eq!(after.relationship_count, relationship_count);
    }

    #[test]
    fn fts5_or_fallback_search_works() {
        let mut conn = memory_db();
        ingest_text_conn(
            &mut conn,
            "default",
            "Fallback",
            "needle appears in this local sqlite chunk",
            None,
            None,
            None,
        )
        .expect("ingest");
        let stats = stats_conn(&conn).expect("stats");
        let results = search_conn(&conn, "default", "needle", 5).expect("search");
        assert_eq!(results.len(), 1);
        assert!(
            stats.fts_available || results[0].chunk.text.contains("needle"),
            "FTS5 should be available or LIKE fallback should return the chunk"
        );
    }

    #[test]
    fn get_document_returns_metadata_and_chunks() {
        let mut conn = memory_db();
        let result = ingest_text_conn(
            &mut conn,
            "default",
            "Document",
            "document chunks are retrievable",
            Some("doc.txt"),
            Some("file"),
            Some("text/plain"),
        )
        .expect("ingest");
        let doc = get_document_conn(&conn, &result.document_id, true).expect("document");
        assert_eq!(doc.title, "Document");
        assert_eq!(doc.chunk_count, result.chunk_count as i64);
        assert_eq!(doc.chunks.expect("chunks").len(), result.chunk_count);
    }
}
