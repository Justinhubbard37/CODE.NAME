import importlib.util
import json
import pathlib
import threading
import unittest
import urllib.error
import urllib.request


MODULE_PATH = pathlib.Path(__file__).with_name("agent_sidecar.py")
SPEC = importlib.util.spec_from_file_location("agent_sidecar", MODULE_PATH)
agent_sidecar = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(agent_sidecar)


class AgentSidecarContainmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = agent_sidecar.ThreadingHTTPServer(("127.0.0.1", 0), agent_sidecar.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def post_json(self, path, payload, auth=True):
        headers = {"Content-Type": "application/json"}
        if auth:
            headers["Authorization"] = "Bearer " + agent_sidecar.TOKEN
        req = urllib.request.Request(
            self.base_url + path,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=3) as resp:
                return resp.status, resp.read().decode("utf-8"), resp.headers.get("Content-Type", "")
        except urllib.error.HTTPError as exc:
            try:
                return exc.code, exc.read().decode("utf-8"), exc.headers.get("Content-Type", "")
            finally:
                exc.close()

    def assert_safe_failure_body(self, body, prompt="do not echo this prompt"):
        self.assertNotIn(prompt, body)
        self.assertNotIn("[SIDECAR:STUB]", body)
        self.assertNotIn("[SIDECAR:ADK-ERROR]", body)
        self.assertNotIn("Echo:", body)

    def test_sidecar_has_no_default_cloud_model(self):
        self.assertEqual(agent_sidecar._ADK_DEFAULT_MODEL, "")

    def test_sidecar_does_not_import_adk_or_default_gemini(self):
        source = MODULE_PATH.read_text(encoding="utf-8")

        self.assertNotIn("google.adk", source)
        self.assertNotIn("gemini-2.5-flash", source)

    def test_run_agent_returns_no_stub_or_echo_success(self):
        prompt = "do not echo this prompt"
        with self.assertRaises(agent_sidecar.SidecarUnavailable) as raised:
            agent_sidecar.run_agent(prompt)

        message = str(raised.exception)
        self.assertIn("unavailable", message.lower())
        self.assert_safe_failure_body(message, prompt)

    def test_community_summary_is_empty_during_containment(self):
        self.assertEqual(agent_sidecar._summarize_community(["alpha", "beta"]), "")

    def test_unavailable_payload_is_structured_and_safe(self):
        payload = agent_sidecar._unavailable_payload("Sidecar browser")

        self.assertEqual(payload["ok"], False)
        self.assertEqual(payload["status"], "unavailable")
        self.assertIn("reason", payload)
        self.assertNotIn("[SIDECAR:STUB]", payload["reason"])
        self.assertNotIn("[SIDECAR:ADK-ERROR]", payload["reason"])

    def test_agent_card_does_not_advertise_chat_or_tools(self):
        skills = {skill["id"] for skill in agent_sidecar.AGENT_CARD["skills"]}

        self.assertEqual(agent_sidecar.AGENT_CARD["capabilities"]["streaming"], False)
        self.assertNotIn("chat", skills)
        self.assertNotIn("graph.search", skills)
        self.assertIn("contained", skills)

    def test_remaining_post_endpoints_preserve_bearer_auth(self):
        status, body, _ = self.post_json("/a2a/embed", {"texts": ["x"]}, auth=False)

        self.assertEqual(status, 401)
        self.assertEqual(json.loads(body)["error"], "unauthorized")

    def test_unavailable_execution_endpoints_return_structured_failures(self):
        cases = [
            ("/a2a/tool_result", {"call_id": "c1", "result": "ok"}, "Sidecar tool callback"),
            ("/a2a/embed", {"texts": ["alpha"]}, "Sidecar embeddings"),
            ("/a2a/communities", {"nodes": [], "edges": []}, "Sidecar communities"),
            ("/a2a/pool/create", {"kind": "agent"}, "Sidecar pool create"),
        ]

        for path, request_body, capability in cases:
            with self.subTest(path=path):
                status, body, _ = self.post_json(path, request_body)
                payload = json.loads(body)

                self.assertEqual(status, 503)
                self.assertEqual(payload["ok"], False)
                self.assertEqual(payload["status"], "unavailable")
                self.assertEqual(payload["capability"], capability)
                self.assertIn("reason", payload)
                self.assert_safe_failure_body(body)

        status, body, _ = self.post_json("/a2a/embed", {"texts": ["alpha"]})
        self.assertEqual(json.loads(body)["embeddings"], [])

        status, body, _ = self.post_json("/a2a/communities", {"nodes": [], "edges": []})
        self.assertEqual(json.loads(body)["communities"], [])

    def test_browser_endpoint_is_unavailable_without_text_or_harness_output(self):
        status, body, _ = self.post_json("/a2a/browser_open", {"url": "https://example.test"})
        payload = json.loads(body)

        self.assertEqual(status, 503)
        self.assertEqual(payload["ok"], False)
        self.assertEqual(payload["status"], "unavailable")
        self.assertEqual(payload["text"], "")
        self.assertEqual(payload["harness_files"], [])
        self.assertIn("unavailable", payload["error"].lower())
        self.assert_safe_failure_body(body)

    def test_pool_release_is_safe_idempotent_cleanup(self):
        status, body, _ = self.post_json("/a2a/pool/release", {"handle": "missing"})
        payload = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(payload["ok"], True)
        self.assertEqual(payload["status"], "unavailable")
        self.assertEqual(payload["released"], False)
        self.assert_safe_failure_body(body)

    def test_message_send_returns_jsonrpc_failure_without_echo(self):
        prompt = "do not echo this prompt"
        status, body, _ = self.post_json(
            "/a2a",
            {"jsonrpc": "2.0", "id": "m1", "method": "message/send", "params": {"text": prompt}},
        )
        payload = json.loads(body)

        self.assertEqual(status, 200)
        self.assertEqual(payload["id"], "m1")
        self.assertIn("error", payload)
        self.assertNotIn("result", payload)
        self.assertEqual(payload["error"]["data"]["status"], "unavailable")
        self.assert_safe_failure_body(body, prompt)

    def test_message_stream_returns_failed_status_without_echo(self):
        prompt = "do not echo this prompt"
        status, body, content_type = self.post_json(
            "/a2a",
            {"jsonrpc": "2.0", "id": "s1", "method": "message/stream", "params": {"text": prompt}},
        )

        self.assertEqual(status, 200)
        self.assertIn("text/event-stream", content_type)
        self.assertIn('"status": "unavailable"', body)
        self.assertIn('"state": "failed"', body)
        self.assert_safe_failure_body(body, prompt)


if __name__ == "__main__":
    unittest.main()
