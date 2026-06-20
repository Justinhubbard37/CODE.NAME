#!/usr/bin/env python3
"""
CODE NAME contained Agent Sidecar.

This process exists only for explicit lifecycle/status setup during R0
containment. It does not run ADK, browser control, embeddings, community
processing, pool allocation, tool callbacks, or model inference.
"""

import json
import os
import secrets
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


SPEC_VERSION = "0.3"
TOKEN = secrets.token_urlsafe(24)
_ADK_DEFAULT_MODEL = ""
_ADK_DEFAULT_TEMP = float(os.environ.get("CODENAME_TEMP", "0.7"))


class SidecarUnavailable(RuntimeError):
    """Raised when sidecar execution is requested during containment."""


def _containment_message(capability="Agent Sidecar execution"):
    return (
        f"{capability} unavailable: no approved local sidecar runtime is "
        "configured during containment remediation."
    )


def _unavailable_payload(capability, ok=False):
    return {
        "ok": ok,
        "status": "unavailable",
        "capability": capability,
        "reason": _containment_message(capability),
    }


def _jsonrpc_unavailable(rid, capability):
    return {
        "jsonrpc": "2.0",
        "id": rid,
        "error": {
            "code": -32000,
            "message": _containment_message(capability),
            "data": _unavailable_payload(capability),
        },
    }


def run_agent(text, model=None, temperature=None):
    """Sidecar agent execution is disabled until an approved runtime exists."""
    raise SidecarUnavailable(_containment_message())


def _summarize_community(member_texts, model=None, temperature=None):
    """Community summaries are disabled during containment."""
    return ""


AGENT_CARD = {
    "name": "CODE NAME Agent Sidecar",
    "description": "Contained legacy sidecar scaffold for CODE NAME.",
    "protocolVersion": "0.3.0",
    "version": "0.3.0",
    "url": "",
    "skills": [
        {
            "id": "contained",
            "name": "Containment Status",
            "description": "Execution unavailable pending remediation",
            "tags": ["unavailable"],
        },
    ],
    "capabilities": {"streaming": False, "pushNotifications": False},
    "defaultInputModes": ["text"],
    "defaultOutputModes": ["text"],
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        return

    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True

    def _authed(self):
        return self.headers.get("Authorization", "") == "Bearer " + TOKEN

    def _discard_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length > 0:
            self.rfile.read(length)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length) or b"{}")

    def _send_sse(self, obj):
        self.wfile.write(("data: " + json.dumps(obj) + "\n\n").encode("utf-8"))
        self.wfile.flush()

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True, "status": "contained", "ts": time.time()})
        if self.path == "/.well-known/agent-card.json":
            return self._json(200, AGENT_CARD)
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/a2a/tool_result":
            if not self._authed():
                return self._json(401, {"error": "unauthorized"})
            self._discard_body()
            return self._json(503, _unavailable_payload("Sidecar tool callback"))

        if self.path == "/a2a/embed":
            if not self._authed():
                return self._json(401, {"error": "unauthorized"})
            self._discard_body()
            return self._json(503, {**_unavailable_payload("Sidecar embeddings"), "embeddings": []})

        if self.path == "/a2a/communities":
            if not self._authed():
                return self._json(401, {"error": "unauthorized"})
            self._discard_body()
            return self._json(503, {**_unavailable_payload("Sidecar communities"), "communities": []})

        if self.path == "/a2a/browser_open":
            if not self._authed():
                return self._json(401, {"error": "unauthorized"})
            payload = _unavailable_payload("Sidecar browser")
            self._discard_body()
            return self._json(
                503,
                {**payload, "error": payload["reason"], "text": "", "harness_files": []},
            )

        if self.path == "/a2a/pool/create":
            if not self._authed():
                return self._json(401, {"error": "unauthorized"})
            self._discard_body()
            return self._json(503, _unavailable_payload("Sidecar pool create"))

        if self.path == "/a2a/pool/release":
            if not self._authed():
                return self._json(401, {"error": "unauthorized"})
            self._discard_body()
            return self._json(
                200,
                {
                    **_unavailable_payload("Sidecar pool release", ok=True),
                    "released": False,
                },
            )

        if self.path != "/a2a":
            return self._json(404, {"error": "not found"})
        if not self._authed():
            return self._json(401, {"error": "unauthorized"})

        try:
            req = self._read_json_body()
        except Exception:
            return self._json(400, {"error": "bad json"})

        method = req.get("method")
        rid = req.get("id")

        if method == "message/send":
            return self._json(200, _jsonrpc_unavailable(rid, "Sidecar chat"))

        if method == "message/stream":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.end_headers()
            self._send_sse(_jsonrpc_unavailable(rid, "Sidecar stream"))
            self._send_sse({
                "jsonrpc": "2.0",
                "id": rid,
                "result": {
                    "kind": "status-update",
                    "contextId": "",
                    "status": {"state": "failed"},
                    "final": True,
                },
            })
            self.close_connection = True
            return

        return self._json(200, {
            "jsonrpc": "2.0",
            "id": rid,
            "error": {"code": -32601, "message": "method not found"},
        })


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
        "status": "contained",
    }
    sys.stdout.write(json.dumps(handshake) + "\n")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
