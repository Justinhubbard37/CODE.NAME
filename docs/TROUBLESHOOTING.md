# CODE NAME — Troubleshooting

Fixes for the most common issues, grouped by symptom. For diagnostics, open your log
folder from **Settings → Logs** (desktop only).

---

## The model won't answer

**Local model (Ollama / LM Studio):**
- Make sure the server is running and the model is pulled, e.g. `ollama pull llama3.1`.
- In Settings → Models, click **Detect installed models** to confirm the app sees it.
- If the endpoint shows `error`, check the base URL (Ollama defaults to
  `http://localhost:11434`, LM Studio `http://localhost:1234`).

**"Model mismatch" notice after a reply:**
- The server ran a different model than you selected. With **LM Studio**, enable
  "Just‑In‑Time model loading" or load the exact model. **Ollama** loads the requested
  model automatically.

**Cloud model does nothing / "[BLOCKED] Network gate is closed":**
- Open the **Network** gate (Settings → Gates), or switch to a local endpoint.
- If the gate toggle is disabled with a lock, an **admin policy** has forced it closed
  (see Admin Guide → policy ceiling).
- Confirm the API key is set (Settings → Secrets) for that endpoint.

**No model at all:** the app still responds using a synthetic offline fallback so it's
never completely dead — but configure a real local or cloud model for useful answers.

---

## Ingestion isn't working

- **Drops are rejected / "Filesystem gate closed":** open the **Filesystem** gate.
- **File shows CONFLICT:** it matches existing content by hash or name — choose
  **Overwrite**, **Skip**, or **Keep both**.
- **Nothing happens on drop:** drop onto the **left** pane (Mission Control). The right
  pane is not a drop target.
- **OCR fails:** OCR needs the Filesystem gate open; very large or low‑contrast images
  may not recognize well.

---

## Tools don't run

- **"[blocked] tools gate/scope closed":** open the **Tools** gate, or check that the
  current task tab hasn't revoked the tools capability.
- **"viewer role — tools not permitted":** sign in as an **admin** or **editor**;
  viewers can't run tools.
- **browser.open blocked:** the tab lacks the BROWSER capability, or Chrome isn't
  running with `--remote-debugging-port=9222` for the CDP harness.

---

## The agent sidecar is offline

Symptoms: the **A2A** endpoint shows offline, or chat returns "[SIDECAR OFFLINE]".

- The sidecar runs only in the **desktop app** (`npm run desktop` / installed build),
  not the browser preview (`npm run dev`).
- It needs **Python on the host**. Confirm `python`/`python3` is on PATH.
- Check the log folder for `sidecar.log`. The shell auto‑restarts the sidecar with
  backoff; three failed health probes also trigger a restart.
- Everything else (local retrieval, offline model fallback) keeps working without it.

---

## Audit chain reports "broken"

- The tamper‑evident chain detected a record that was altered or removed out of band.
- Re‑run **Verify**. If it persists, the local audit store was modified outside the
  app. Restore from a backup/workspace copy if you have one; new writes will start a
  fresh, valid chain segment.

---

## Keys / keychain

- "Save key" only works in the **desktop app** (the browser preview has no keychain).
- If a saved key isn't picked up, confirm the endpoint's key name matches what you
  stored (e.g. `GEMINI_API_KEY`, `OLLAMA_API_KEY`).

---

## Installation & "unknown publisher" warnings

- Until installers are code‑signed/notarized, the OS may warn about an unknown
  publisher. On Windows choose **More info → Run anyway**; on macOS right‑click the app
  → **Open** the first time. (Signed builds remove these prompts — see the packaging
  notes / Admin Guide.)
- The app needs the platform WebView (WebView2 on Windows; WebKit on macOS) and Python
  on the host for the sidecar.

---

## First‑run wizard

- It appears once and is remembered via a local flag (`codename:onboarded:v1`).
- To see it again, clear that key from the app's local storage (or your browser
  profile's storage in preview mode), then reload.
- Every step is skippable — skipping leaves safe, offline defaults in place.

---

## Developer / build issues

- **`npm test` fails with `Cannot find module @rollup/rollup-linux-x64-gnu`** (or the
  matching `@esbuild/...` binary): this is a known npm optional‑dependency bug, usually
  after installing on one OS and running on another. Fix by removing **both**
  `node_modules` and `package-lock.json` and running `npm install` again on the target
  OS.
- **`npm run build` / dev server fails to remove `dist` or `.vite` (EPERM):** delete
  the stale `dist/` (or `node_modules/.vite`) folder and rebuild; a clean checkout
  doesn't hit this.
- **Rust won't compile:** ensure the Rust toolchain plus the platform Tauri
  prerequisites are installed (on Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`,
  `librsvg2-dev`, and friends — see the CI workflow for the full list).

---

## Where things live

- **Logs / crash reports:** platform app‑log directory (Settings → Logs → open folder).
- **API keys:** OS keychain (not files).
- **Knowledge graph / vectors / audit:** local per‑workspace database, on your machine.
- **Onboarding flag & language:** local storage for the current profile.

Still stuck? Capture the log folder contents and the exact on‑screen message — both
make diagnosis much faster.
