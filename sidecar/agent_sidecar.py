#!/usr/bin/env python3
"""
CODE NAME agent sidecar (Phase 3 / Slice 3.4).

A local-first, loopback A2A-shaped server.
Wire shape: JSON-RPC 2.0 + SSE, A2A spec 0.3.

Dependencies:
  stdlib only      - required; server starts with zero pip installs.
  google-adk 2.x   - optional; pip install google-adk  (Python 3.11+ required)

Model config (Slice 3.3 wires this from the app at call time):
  CODENAME_MODEL   env var - model string for ADK  (default: gemini-2.5-flash)
  CODENAME_TEMP    env var - sampling temperature  (default: 0.7)

Tool calling (Slice 3.4):
  ADK tools proxy to the app WebMCP layer via Rust shell.
  Tool functions block on a result queue; app POSTs results to /a2a/tool_result.

Contract: docs/contracts/sidecar.md
"""
import asyncio
import json
import os
import queue as qmod
import secrets
import sys
import threading
import time
import uuid
import logging
import logging.handlers
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SPEC_VERSION = "0.3"
TOKEN = secrets.token_urlsafe(24)

# ---------------------------------------------------------------------------
# Phase 9, Slice 9.1 — Structured logging
# ---------------------------------------------------------------------------
_log_dir = os.environ.get("CODENAME_LOG_DIR", "")
if _log_dir:
    os.makedirs(_log_dir, exist_ok=True)
    _log_path = os.path.join(_log_dir, "sidecar.log")
    _handler: logging.Handler = logging.handlers.RotatingFileHandler(
        _log_path, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
else:
    # Dev fallback: log to stderr so the Rust shell can capture it.
    _handler = logging.StreamHandler(sys.stderr)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[_handler],
)
log = logging.getLogger("codename.sidecar")
log.info("sidecar logging initialised (log_dir=%r)", _log_dir or "<stderr>")

TOOL_CALL_TIMEOUT = 30  # seconds to wait for app to return a tool result

# Sandbox directory for any files the Browser Harness writes (Phase 5, Slice 5.5).
# All harness file I/O is confined here; path-escape attempts raise ValueError.
HARNESS_DIR = os.path.join(os.path.expanduser("~"), ".codename", "harness")
_harness_manifest: list = []
_harness_manifest_lock = threading.Lock()

# Pool context registry (Phase 6, Slice 6.1).
# Maps opaque handle → context metadata dict. Each sidecar-side context is an
# isolated slot with lifecycle tracking; the browser tab or ADK runner is
# associated with the context and torn down on /a2a/pool/release.
_pool_contexts: dict = {}
_pool_contexts_lock = threading.Lock()

# ---------------------------------------------------------------------------
# ADK runtime state  (Slice 3.2)
# ---------------------------------------------------------------------------

_ADK_DEFAULT_MODEL = os.environ.get("CODENAME_MODEL", "gemini-2.5-flash")
_ADK_DEFAULT_TEMP = float(os.environ.get("CODENAME_TEMP", "0.7"))

_adk_lock = threading.Lock()
_adk_runner = None
_adk_svc = None
_adk_active_model = ""

# ---------------------------------------------------------------------------
# Tool call infrastructure  (Slice 3.4)
# ---------------------------------------------------------------------------

# Per-call result queues: call_id -> Queue(1)
_tool_result_queues = {}
_tool_result_lock = threading.Lock()

# Output queue for the currently-active SSE stream.
# Set by _stream(), read by tool proxy functions running inside ADK threads.
_stream_state_lock = threading.Lock()
_stream_output_q = None


def _make_tool_proxy(adk_name, webmcp_name, description):
    """Create a blocking ADK-compatible tool function that proxies to app WebMCP.

    The function:
      1. Puts a tool_call notification on the active stream's output queue.
      2. Blocks until the app POSTs a result to /a2a/tool_result (or times out).
    ADK wraps sync tool functions in a thread executor, so blocking is safe.
    """
    def tool_fn(**kwargs):
        call_id = uuid.uuid4().hex
        result_q = qmod.Queue(1)
        with _tool_result_lock:
            _tool_result_queues[call_id] = result_q
        # Notify the SSE stream loop in the HTTP handler thread.
        with _stream_state_lock:
            q = _stream_output_q
        if q is not None:
            q.put(("tool_call", {"id": call_id, "name": webmcp_name, "args": kwargs}))
        # Block until the app returns a result or timeout.
        try:
            return result_q.get(timeout=TOOL_CALL_TIMEOUT)
        except qmod.Empty:
            return "[timeout] {} did not return within {}s".format(
                webmcp_name, TOOL_CALL_TIMEOUT
            )
        finally:
            with _tool_result_lock:
                _tool_result_queues.pop(call_id, None)

    tool_fn.__name__ = adk_name
    tool_fn.__doc__ = description
    return tool_fn


# WebMCP <-> ADK tool mapping (Slice 3.4)
_TOOL_PROXIES = [
    _make_tool_proxy(
        "graph_search",
        "graph.search",
        "Search the knowledge graph for nodes matching the query. "
        "Args: query (str).",
    ),
    _make_tool_proxy(
        "graph_note",
        "graph.note",
        "Create a note node in the knowledge graph. "
        "Args: title (str), text (str, optional).",
    ),
]


def _ensure_adk_runner(model, temperature):
    """Lazy-init the ADK Runner. Returns (runner, session_service).
    Raises ImportError if google-adk is not installed."""
    global _adk_runner, _adk_svc, _adk_active_model

    with _adk_lock:
        if _adk_runner is not None and model == _adk_active_model:
            return _adk_runner, _adk_svc

        from google.adk.agents import LlmAgent          # type: ignore
        from google.adk.sessions import InMemorySessionService  # type: ignore
        from google.adk.runners import Runner           # type: ignore

        agent = LlmAgent(
            name="codename_agent",
            model=model,
            instruction=(
                "You are a helpful, concise AI assistant inside CODE NAME, "
                "a local-first knowledge workspace. Answer clearly and directly. "
                "Use graph_search to look up relevant knowledge before answering "
                "when the user asks about information that may be in their graph. "
                "Use graph_note to save important facts or summaries."
            ),
            tools=_TOOL_PROXIES,
        )
        svc = InMemorySessionService()
        runner = Runner(agent=agent, app_name="codename", session_service=svc)

        _adk_runner = runner
        _adk_svc = svc
        _adk_active_model = model
        return runner, svc


async def _adk_chat_async(text, runner, svc):
    """One chat turn through ADK. Returns response text.
    Tool calls are handled by ADK internally via the registered proxies."""
    from google.genai import types as gtypes  # type: ignore

    session = await svc.create_session(app_name="codename", user_id="local_user")
    msg = gtypes.Content(role="user", parts=[gtypes.Part(text=text)])

    parts = []
    async for event in runner.run_async(
        user_id="local_user", session_id=session.id, new_message=msg
    ):
        if hasattr(event, "is_final_response") and event.is_final_response():
            if event.content and event.content.parts:
                parts.extend(
                    p.text for p in event.content.parts
                    if getattr(p, "text", None)
                )

    return "".join(parts) or "[agent returned no text]"


def run_agent(text, model=None, temperature=None):
    """Run the agent and return a reply string.

    Uses google-adk 2.x (with WebMCP tool proxies) when installed; falls back
    to an echo stub otherwise so the app always works offline / without ADK.
    """
    active_model = model or _ADK_DEFAULT_MODEL
    active_temp = temperature if temperature is not None else _ADK_DEFAULT_TEMP

    try:
        runner, svc = _ensure_adk_runner(active_model, active_temp)
        return asyncio.run(_adk_chat_async(text, runner, svc))

    except ImportError:
        return (
            "[SIDECAR:STUB] google-adk not installed. "
            "Install with: pip install google-adk\n\n"
            "Echo: " + text
        )

    except Exception as exc:
        return (
            "[SIDECAR:ADK-ERROR] " + repr(exc) + "\n\n"
            "Echo: " + text
        )


# ---------------------------------------------------------------------------
# A2A wire-shape helpers
# ---------------------------------------------------------------------------

AGENT_CARD = {
    "name": "CODE NAME Agent",
    "description": "Local-first agent sidecar for CODE NAME.",
    "protocolVersion": "0.3.0",
    "version": "0.3.0",
    "url": "",
    "skills": [
        {
            "id": "chat",
            "name": "Chat",
            "description": "Converse and reason",
            "tags": ["chat"],
        },
        {
            "id": "graph.search",
            "name": "Graph Search",
            "description": "Search the knowledge graph",
            "tags": ["tools"],
        },
        {
            "id": "graph.note",
            "name": "Graph Note",
            "description": "Create a knowledge graph note",
            "tags": ["tools"],
        },
    ],
    "capabilities": {"streaming": True, "pushNotifications": False},
    "defaultInputModes": ["text"],
    "defaultOutputModes": ["text"],
}


def _text_message(text, context_id):
    return {
        "kind": "message",
        "messageId": uuid.uuid4().hex,
        "role": "agent",
        "parts": [{"kind": "text", "text": text}],
        "contextId": context_id,
    }


def _extract_text(params):
    msg = (params or {}).get("message", {})
    parts = msg.get("parts", []) or []
    return " ".join(
        p.get("text", "") for p in parts if p.get("kind") == "text"
    ).strip()


def _extract_settings(params):
    """Extract model settings from params.settings (Slice 3.3).

    Returns (model_or_None, temperature_or_None).  Falls back to module
    defaults when the field is absent so old callers still work.
    """
    s = (params or {}).get("settings") or {}
    model = s.get("model") or None
    temp = s.get("temperature")
    if temp is not None:
        try:
            temp = float(temp)
        except (ValueError, TypeError):
            temp = None
    return model, temp


# ---------------------------------------------------------------------------
# HTTP server
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Phase 4 compatibility helpers: non-semantic hash vectors + community detection.
# Real Phase 2F SQLite KB semantic retrieval uses Rust-owned local Ollama
# embeddings, not this legacy /a2a/embed route.
# ---------------------------------------------------------------------------

def _stub_embed(text, dim=128):
    """Character-bigram hash into a normalised dim-float vector.
    This is deterministic graph compatibility data, not a semantic embedding."""
    v = [0.0] * dim
    s = text.lower()[:512]
    for i in range(len(s) - 1):
        a, b = ord(s[i]), ord(s[i + 1])
        idx = ((a * 31 + b) * 2654435761) % (2 ** 32) % dim
        v[idx] += 1.0
    norm = sum(x * x for x in v) ** 0.5 or 1.0
    return [x / norm for x in v]


def _label_propagation(node_ids, adjacency, max_iter=15):
    """Local label propagation — returns {nodeId: communityKey} dict."""
    import random as _random
    labels = {nid: nid for nid in node_ids}
    for it in range(max_iter):
        order = list(node_ids)
        # Deterministic shuffle using hash seed so results are reproducible
        order.sort(key=lambda x: hash(x + str(it)))
        changed = False
        for nid in order:
            nbrs = adjacency.get(nid, [])
            if not nbrs:
                continue
            freq = {}
            for nb in nbrs:
                lbl = labels.get(nb, nb)
                freq[lbl] = freq.get(lbl, 0) + 1
            best = max(freq, key=lambda k: (freq[k], -hash(k)))
            if best != labels[nid]:
                labels[nid] = best
                changed = True
        if not changed:
            break
    return labels


def _summarize_community(member_texts, model=None, temperature=None):
    """Ask the LLM to summarize a community given its members' texts.
    Returns a string; falls back to 'no summary' if ADK not available."""
    if not member_texts:
        return ""
    joined = "; ".join(member_texts[:20])
    prompt = (
        "Summarize the following knowledge-graph nodes in one concise sentence "
        "(max 20 words). Nodes: " + joined
    )
    try:
        return run_agent(prompt, model=model, temperature=temperature)
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Browser Harness — raw CDP over WebSocket (Phase 5, Slice 5.4)
# ---------------------------------------------------------------------------

def _ws_connect(host: str, port: int, path: str):
    """Open a WebSocket connection using only stdlib (no websockets package)."""
    import socket as _socket
    import base64 as _b64
    s = _socket.create_connection((host, port), timeout=10)
    key = _b64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    s.sendall(req.encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        chunk = s.recv(4096)
        if not chunk:
            raise ConnectionError("WebSocket handshake failed")
        resp += chunk
    return s


def _ws_send(s, msg: str) -> None:
    """Send a single text WebSocket frame (client mask applied)."""
    import struct as _struct
    data = msg.encode()
    n = len(data)
    mask = os.urandom(4)
    if n < 126:
        header = bytes([0x81, 0x80 | n])
    elif n < 65536:
        header = bytes([0x81, 0xFE]) + _struct.pack(">H", n)
    else:
        header = bytes([0x81, 0xFF]) + _struct.pack(">Q", n)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    s.sendall(header + mask + masked)


def _ws_recv(s, timeout: float = 30) -> str:
    """Read one complete WebSocket frame and return its payload as a string."""
    import struct as _struct
    s.settimeout(timeout)

    def _read_exact(n: int) -> bytes:
        buf = b""
        while len(buf) < n:
            chunk = s.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("WebSocket closed mid-frame")
            buf += chunk
        return buf

    b0, b1 = _read_exact(2)
    is_masked = (b1 & 0x80) != 0
    n = b1 & 0x7F
    if n == 126:
        n = _struct.unpack(">H", _read_exact(2))[0]
    elif n == 127:
        n = _struct.unpack(">Q", _read_exact(8))[0]
    mask = _read_exact(4) if is_masked else b""
    payload = _read_exact(n)
    if is_masked:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return payload.decode(errors="replace")


_CDP_HELP = (
    "Chrome is not running with remote debugging enabled.\n"
    "Start Chrome with:\n"
    "  macOS:   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome "
    "--remote-debugging-port=9222 --no-first-run\n"
    "  Windows: chrome.exe --remote-debugging-port=9222\n"
    "  Linux:   google-chrome --remote-debugging-port=9222\n"
    "Then try the browser.open tool again."
)


def _cdp_open(url: str, nav_timeout: float = 20.0) -> dict:
    """
    Navigate to *url* via Chrome DevTools Protocol and return page text.

    Returns {"text": str, "url": str, "title": str} on success.
    Raises RuntimeError with user-friendly guidance if Chrome is unavailable.
    """
    import urllib.request as _req
    import urllib.parse as _parse
    import urllib.error as _uerr

    # 1. Confirm Chrome is listening.
    try:
        with _req.urlopen("http://localhost:9222/json/version", timeout=2) as r:
            json.loads(r.read())
    except (_uerr.URLError, OSError):
        raise RuntimeError(_CDP_HELP)

    # 2. Open a new tab and navigate to the URL.
    encoded = _parse.quote(url, safe="")
    try:
        with _req.urlopen(f"http://localhost:9222/json/new?{encoded}", timeout=5) as r:
            tab = json.loads(r.read())
    except Exception as exc:
        raise RuntimeError(f"Failed to open CDP tab: {exc}")

    ws_url: str = tab.get("webSocketDebuggerUrl", "")
    if not ws_url:
        raise RuntimeError("Chrome did not return a WebSocket URL for the new tab.")

    # Parse ws://host:port/path
    stripped = ws_url.removeprefix("ws://")
    host_port, _, ws_path = stripped.partition("/")
    ws_host, _, ws_port_s = host_port.partition(":")
    ws_port = int(ws_port_s) if ws_port_s else 9222
    ws_path = "/" + ws_path

    s = _ws_connect(ws_host, ws_port, ws_path)
    msg_id = [0]

    def _send(method: str, params: dict | None = None) -> int:
        msg_id[0] += 1
        _ws_send(s, json.dumps({"id": msg_id[0], "method": method, "params": params or {}}))
        return msg_id[0]

    def _recv_until(pred, timeout: float = nav_timeout) -> dict | None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            remaining = max(0.5, deadline - time.monotonic())
            try:
                raw = _ws_recv(s, timeout=remaining)
            except (TimeoutError, OSError):
                break
            try:
                msg = json.loads(raw)
                if pred(msg):
                    return msg
            except Exception:
                pass
        return None

    text = ""
    title = tab.get("title", "")
    try:
        _send("Page.enable")
        _send("Page.navigate", {"url": url})
        _recv_until(lambda m: m.get("method") == "Page.loadEventFired")

        eval_id = _send("Runtime.evaluate", {
            "expression": "document.body ? document.body.innerText.slice(0, 8000) : ''",
            "returnByValue": True,
        })
        res = _recv_until(lambda m: m.get("id") == eval_id, timeout=5)
        if res:
            text = ((res.get("result") or {}).get("result") or {}).get("value", "")
    finally:
        try:
            s.close()
        except Exception:
            pass
        tab_id = tab.get("id", "")
        if tab_id:
            try:
                import urllib.request as _r2
                _r2.urlopen(f"http://localhost:9222/json/close/{tab_id}", timeout=2)
            except Exception:
                pass

    return {"text": text, "url": url, "title": title}


# ---------------------------------------------------------------------------
# Browser Harness — sandboxed file writes (Phase 5, Slice 5.5)
# ---------------------------------------------------------------------------

def _harness_write(relpath: str, content: str) -> str:
    """
    Write *content* to a sandboxed path under HARNESS_DIR.

    Raises ValueError if *relpath* would escape the sandbox.
    Returns the absolute path written and appends to the session manifest.
    """
    os.makedirs(HARNESS_DIR, exist_ok=True)
    target = os.path.normpath(os.path.join(HARNESS_DIR, relpath))
    boundary = os.path.normpath(HARNESS_DIR) + os.sep
    if not target.startswith(boundary):
        raise ValueError(f"harness path escape blocked: {relpath!r}")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w", encoding="utf-8") as fh:
        fh.write(content)
    with _harness_manifest_lock:
        _harness_manifest.append({"path": target, "size": len(content), "ts": time.time()})
    return target


def _flush_harness_manifest() -> list:
    """Return and clear the per-request manifest snapshot."""
    with _harness_manifest_lock:
        snap = list(_harness_manifest)
        _harness_manifest.clear()
    return snap


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        return

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authed(self):
        return self.headers.get("Authorization", "") == "Bearer " + TOKEN

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True, "ts": time.time()})
        if self.path == "/.well-known/agent-card.json":
            return self._json(200, AGENT_CARD)
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        # Tool result callback (Slice 3.4): Rust shell posts result for pending tool call.
        if self.path == "/a2a/tool_result":
            if not self._authed():
                return self._json(401, {"error": "unauthorized"})
            length = int(self.headers.get("Content-Length", 0) or 0)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except Exception:
                return self._json(400, {"error": "bad json"})
            call_id = body.get("callId", "")
            result = body.get("result", "")
            with _tool_result_lock:
                q = _tool_result_queues.get(call_id)
            if q is not None:
                try:
                    q.put_nowait(str(result))
                except qmod.Full:
                    pass  # duplicate delivery — ignore
                return self._json(200, {"ok": True})
            return self._json(404, {"error": "unknown callId"})

        if self.path == "/a2a/embed":
            if not self._authed():
                return self._json(401, {"error": "unauthorized"})
            length = int(self.headers.get("Content-Length", 0) or 0)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except Exception:
                return self._json(400, {"error": "bad json"})
            # Support single text or batch
            texts = body.get("texts") or ([body["text"]] if "text" in body else [])
            embeddings = [_stub_embed(t) for t in texts]
            if len(embeddings) == 1:
                return self._json(200, {"embedding": embeddings[0]})
            return self._json(200, {"embeddings": embeddings})

        if self.path == "/a2a/communities":
            if not self._authed():
                return self._json(401, {"error": "unauthorized"})
            length = int(self.headers.get("Content-Length", 0) or 0)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except Exception:
                return self._json(400, {"error": "bad json"})
            nodes = body.get("nodes", [])   # [{id, text}]
            edges = body.get("edges", [])   # [{source, target}]
            model = body.get("model")
            temperature = body.get("temperature")

            # Build adjacency map
            node_ids = [n["id"] for n in nodes]
            node_text_map = {n["id"]: n.get("text", "") for n in nodes}
            adjacency = {nid: [] for nid in node_ids}
            for e in edges:
                s, t = e.get("source", ""), e.get("target", "")
                if s in adjacency and t in adjacency:
                    adjacency[s].append(t)
                    adjacency[t].append(s)

            # Detect communities via label propagation
            labels = _label_propagation(node_ids, adjacency)

            # Group members by community label
            groups = {}
            for nid, lbl in labels.items():
                groups.setdefault(lbl, []).append(nid)

            # Build result; summarize each community
            communities = []
            for comm_key, member_ids in groups.items():
                member_texts = [node_text_map.get(m, "")[:200] for m in member_ids]
                summary = _summarize_community(
                    member_texts, model=model, temperature=temperature
                )
                communities.append({
                    "id": comm_key,
                    "memberIds": member_ids,
                    "summary": summary,
                })
            return self._json(200, {"communities": communities})

        if self.path == "/a2a/pool/create":
            if not self._authed():
                return self._json(401, {"error": "unauthorized"})
            length = int(self.headers.get("Content-Length", 0) or 0)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except Exception:
                return self._json(400, {"error": "bad json"})
            kind = body.get("kind", "")
            task_id = body.get("taskId", "")
            lease_id = body.get("leaseId", "")
            if kind not in ("browser", "agent"):
                return self._json(400, {"error": f"unknown kind: {kind!r}"})
            handle = uuid.uuid4().hex
            ctx: dict = {
                "kind": kind,
                "taskId": task_id,
                "leaseId": lease_id,
                "createdAt": time.time(),
            }
            if kind == "browser":
                ctx["tabId"] = None   # CDP tab assigned lazily on browser.open
            elif kind == "agent":
                # Record whether ADK is warm so callers can pre-warm if needed.
                ctx["runnerReady"] = bool(_adk_runner)
            with _pool_contexts_lock:
                _pool_contexts[handle] = ctx
            return self._json(200, {"handle": handle, "kind": kind})

        if self.path == "/a2a/pool/release":
            if not self._authed():
                return self._json(401, {"error": "unauthorized"})
            length = int(self.headers.get("Content-Length", 0) or 0)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except Exception:
                return self._json(400, {"error": "bad json"})
            handle = body.get("handle", "")
            with _pool_contexts_lock:
                ctx = _pool_contexts.pop(handle, None)
            if ctx is None:
                # Idempotent — already released or unknown handle; treat as ok.
                return self._json(200, {"ok": True, "note": "unknown handle"})
            # Tear down any associated browser tab.
            tab_id = ctx.get("tabId")
            if tab_id:
                try:
                    import urllib.request as _r
                    _r.urlopen(
                        f"http://localhost:9222/json/close/{tab_id}", timeout=2
                    )
                except Exception:
                    pass  # tab already closed or Chrome not running
            return self._json(200, {"ok": True, "kind": ctx["kind"]})

        if self.path == "/a2a/browser_open":
            if not self._authed():
                return self._json(401, {"error": "unauthorized"})
            length = int(self.headers.get("Content-Length", 0) or 0)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except Exception:
                return self._json(400, {"error": "bad json"})
            url = body.get("url", "").strip()
            if not url:
                return self._json(400, {"error": "url required"})
            try:
                result = _cdp_open(url)
                harness_files = _flush_harness_manifest()
                return self._json(200, {**result, "harness_files": harness_files})
            except RuntimeError as exc:
                harness_files = _flush_harness_manifest()
                return self._json(200, {
                    "error": str(exc),
                    "text": "",
                    "url": url,
                    "title": "",
                    "harness_files": harness_files,
                })

        if self.path != "/a2a":
            return self._json(404, {"error": "not found"})
        if not self._authed():
            return self._json(401, {"error": "unauthorized"})
        length = int(self.headers.get("Content-Length", 0) or 0)
        try:
            req = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._json(400, {"error": "bad json"})

        method = req.get("method")
        rid = req.get("id")
        params = req.get("params", {})
        text = _extract_text(params)
        model, temperature = _extract_settings(params)
        context_id = (
            (params.get("message", {}) or {}).get("contextId") or uuid.uuid4().hex
        )

        if method == "message/send":
            result = _text_message(
                run_agent(text, model=model, temperature=temperature), context_id
            )
            return self._json(200, {"jsonrpc": "2.0", "id": rid, "result": result})

        if method == "message/stream":
            return self._stream(rid, text, context_id, model=model, temperature=temperature)

        return self._json(200, {
            "jsonrpc": "2.0",
            "id": rid,
            "error": {"code": -32601, "message": "method not found"},
        })

    def _stream(self, rid, text, context_id, model=None, temperature=None):
        """Stream the agent reply as SSE.

        Tool calls (Slice 3.4) are emitted as kind='tool_call' events before
        the final text reply. The app executes them via WebMCP and posts
        results back to /a2a/tool_result, unblocking the ADK tool proxy.
        """
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

        # Output queue: ('tool_call', dict) | ('reply', str) | ('error', str)
        output_q = qmod.Queue()

        # Register as the active stream so tool proxies can push events.
        global _stream_output_q
        with _stream_state_lock:
            _stream_output_q = output_q

        def adk_thread():
            global _stream_output_q
            try:
                reply = run_agent(text, model=model, temperature=temperature)
                output_q.put(("reply", reply))
            except Exception as exc:
                output_q.put(("error", str(exc)))
            finally:
                with _stream_state_lock:
                    _stream_output_q = None

        t = threading.Thread(target=adk_thread, daemon=True)
        t.start()

        def send_sse(obj):
            try:
                self.wfile.write(("data: " + json.dumps(obj) + "\n\n").encode())
                self.wfile.flush()
            except Exception:
                pass

        # Drain the output queue until we get the final reply or an error.
        while True:
            try:
                item = output_q.get(timeout=120)
            except qmod.Empty:
                send_sse({
                    "jsonrpc": "2.0",
                    "id": rid,
                    "error": {"code": -32000, "message": "agent timed out"},
                })
                break

            kind, data = item

            if kind == "tool_call":
                # Emit tool call event; app executes and posts result back.
                send_sse({
                    "jsonrpc": "2.0",
                    "id": rid,
                    "result": {
                        "kind": "tool_call",
                        "callId": data["id"],
                        "name": data["name"],
                        "args": data["args"],
                        "contextId": context_id,
                    },
                })
                # Continue — the tool proxy is blocking on its result queue.
                continue

            if kind == "reply":
                # Stream the final reply word-by-word.
                words = data.split(" ")
                for i, w in enumerate(words):
                    chunk = w if i == 0 else " " + w
                    send_sse({
                        "jsonrpc": "2.0",
                        "id": rid,
                        "result": {
                            "kind": "message",
                            "messageId": uuid.uuid4().hex,
                            "role": "agent",
                            "contextId": context_id,
                            "parts": [{"kind": "text", "text": chunk}],
                        },
                    })
                    time.sleep(0.01)

            # 'reply' or 'error' both end the stream.
            send_sse({
                "jsonrpc": "2.0",
                "id": rid,
                "result": {
                    "kind": "status-update",
                    "contextId": context_id,
                    "status": {"state": "completed"},
                    "final": True,
                },
            })
            break


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    AGENT_CARD["url"] = "http://127.0.0.1:" + str(port) + "/a2a"
    handshake = {
        "ready": True,
        "host": "127.0.0.1",
        "port": port,
        "token": TOKEN,
        "protocol": "a2a",
        "specVersion": SPEC_VERSION,
        "pid": os.getpid(),
    }
    sys.stdout.write(json.dumps(handshake) + "\n")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
