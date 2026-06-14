# CODE NAME — Release, Signing & Auto-Update Playbook

This is the operator playbook for shipping CODE NAME as a trusted, installable,
self-updating product. It covers Phase 12 slices **12.1 (installers)**,
**12.2 (signing & notarization)**, and **12.3 (auto-update)**.

> Status: the **release CI** (`.github/workflows/release.yml`) and the installer
> **metadata** in `src-tauri/tauri.conf.json` are in place. Code signing,
> notarization, and the updater require real certificates, secrets, and a release
> host — those steps are documented here and activate when you add the secrets.
> Nothing below changes the app at runtime until you opt in.

---

## 0. Prerequisites

- A machine (or CI runner) per target OS — installers are **not** cross-compiled:
  Windows installers build on Windows, macOS on macOS, Linux on Linux.
- Rust toolchain + the platform Tauri prerequisites (Linux deps are listed in the
  release workflow; Windows needs the WebView2 runtime; macOS needs Xcode CLT).
- Node 20 and `npm ci`.

---

## 1. Slice 12.1 — Produce installers

### Build locally

```bash
npm run tauri build
```

Outputs land in `src-tauri/target/release/bundle/`:

| OS      | Artifacts                                   | Folder                         |
|---------|---------------------------------------------|--------------------------------|
| Windows | `*-setup.exe` (NSIS), `*.msi` (WiX)         | `bundle/nsis`, `bundle/msi`    |
| macOS   | `*.app`, `*.dmg`                            | `bundle/macos`, `bundle/dmg`   |
| Linux   | `*.AppImage`, `*.deb`, `*.rpm`              | `bundle/appimage|deb|rpm`      |

`tauri.conf.json` already sets `bundle.targets: "all"` and now carries installer
metadata (`publisher`, `copyright`, `category`, short/long descriptions) so the
installers show proper product info.

### Build in CI

`.github/workflows/release.yml` builds all three platforms on a `v*` tag (or via
**Run workflow**) and attaches the installers to a **draft GitHub Release**. With no
signing secrets set it still produces working **unsigned** installers — good for
internal testing and to confirm 12.1's "install and launch from the built file".

### The Python sidecar as a bundled resource

The agent sidecar ships via `bundle.resources` in `tauri.conf.json`:

```json
"resources": { "../sidecar/agent_sidecar.py": "sidecar/agent_sidecar.py" }
```

It is copied into the app bundle and resolved at runtime by `script_path()` in
`src-tauri/src/sidecar.rs`. **Caveat:** this ships the `.py` source and therefore
**requires Python on the host**. The app degrades gracefully without it (local
retrieval, offline model fallback). For a zero-dependency install, the roadmap
option is to compile the sidecar (e.g. PyInstaller) and ship it as a Tauri
`externalBin` sidecar binary instead of a script resource.

**Done when:** you can install from the built file and the app launches.

---

## 2. Slice 12.2 — Code signing & notarization

Signing removes the "unknown publisher" (Windows SmartScreen) and "unidentified
developer" (macOS Gatekeeper) warnings. The release workflow already references the
needed env vars; you only add the secrets.

### Windows

Choose one:

- **Azure Trusted Signing** (recommended — no cert files to manage). Configure the
  account/endpoint and sign in CI; see Tauri's Windows signing docs.
- **OV/EV code-signing certificate (PFX).** Add `bundle.windows` to `tauri.conf.json`:

  ```json
  "windows": {
    "certificateThumbprint": "<THUMBPRINT>",
    "digestAlgorithm": "sha256",
    "timestampUrl": "http://timestamp.digicert.com"
  }
  ```

  In CI, import the PFX (from a base64 secret) into the machine store before the
  build step so the thumbprint resolves. EV certs give immediate SmartScreen
  reputation; OV certs build reputation over time.

### macOS (sign + notarize)

Requires an Apple Developer account and a **Developer ID Application** certificate.
Set these repository secrets (already wired in `release.yml`):

| Secret                        | What it is                                                   |
|-------------------------------|-------------------------------------------------------------|
| `APPLE_CERTIFICATE`           | base64 of the `.p12` Developer ID Application cert           |
| `APPLE_CERTIFICATE_PASSWORD`  | password for that `.p12`                                     |
| `APPLE_SIGNING_IDENTITY`      | e.g. `Developer ID Application: Acme (TEAMID)`               |
| `APPLE_ID`                    | Apple ID email (for notarization)                           |
| `APPLE_PASSWORD`              | an **app-specific password** for that Apple ID              |
| `APPLE_TEAM_ID`               | your 10-char Apple Team ID                                  |

With these present, `tauri-action` signs, submits for **notarization**, and staples
the ticket automatically. Optionally pin a floor in `tauri.conf.json`:

```json
"macOS": { "minimumSystemVersion": "10.15" }
```

**Done when:** downloaded installers open with no security warnings (verify on a
clean machine: `spctl -a -vv YourApp.app` on macOS; SmartScreen shows your
publisher on Windows).

---

## 3. Slice 12.3 — Auto-update

Tauri's updater checks a signed manifest, verifies the artifact signature against a
**public key baked into the app**, and only then installs. An unsigned or tampered
update fails verification and is **never applied** — a failed update cannot brick the
app (the installed version keeps running).

### 3.1 Add the plugins

```bash
# JS
npm i @tauri-apps/plugin-updater @tauri-apps/plugin-process
# Rust (from src-tauri/)
cargo add tauri-plugin-updater
cargo add tauri-plugin-process
```

### 3.2 Register the plugins (`src-tauri/src/lib.rs`)

```rust
tauri::Builder::default()
    // updater + relaunch are desktop-only
    .setup(|app| {
        #[cfg(desktop)]
        {
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            app.handle().plugin(tauri_plugin_process::init())?;
        }
        Ok(())
    })
    // ...existing .plugin/.manage/.invoke_handler calls...
```

### 3.3 Generate the signing keypair

```bash
npm run tauri signer generate -- -w ~/.tauri/codename_updater.key
```

This prints/saves a **private key** (+ a password you choose) and a **public key**.
- Private key → CI secret `TAURI_SIGNING_PRIVATE_KEY`; its password →
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (both already referenced in `release.yml`).
- Public key → `tauri.conf.json` (below). **Never commit the private key.**

### 3.4 Configure (`src-tauri/tauri.conf.json`)

```json
"bundle": { "createUpdaterArtifacts": true },
"plugins": {
  "updater": {
    "endpoints": [
      "https://releases.YOURDOMAIN.com/{{target}}/{{arch}}/{{current_version}}"
    ],
    "pubkey": "<CONTENTS OF THE GENERATED .pub FILE>",
    "windows": { "installMode": "passive" }
  }
}
```

> Enable `createUpdaterArtifacts` only after the plugin is added — it makes the
> build emit the `.sig` files and per-target update manifests.

### 3.5 Grant the capability (`src-tauri/capabilities/default.json`)

Add `"updater:default"` (and `"process:default"` if you relaunch) to `permissions`.

### 3.6 In-app "update available" prompt (paste-ready)

Create `src/components/update/UpdatePrompt.tsx` and render it in the App shell
(alongside the onboarding wizard). It no-ops outside the desktop app.

```tsx
import { useEffect, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function UpdatePrompt() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isTauri) return;
    check().then((u) => { if (u) setUpdate(u); }).catch(() => {});
  }, []);

  if (!update) return null;

  const install = async () => {
    setBusy(true);
    try {
      await update.downloadAndInstall(); // signature verified before applying
      await relaunch();
    } catch {
      setBusy(false); // failed update is discarded; current version keeps running
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[95] w-80 bg-neutral-950 border border-emerald-500/40 p-3 text-[11px] font-mono text-neutral-300">
      <div className="text-neutral-100 mb-1">Update available — v{update.version}</div>
      <p className="text-neutral-500 mb-2">A newer signed version is ready to install.</p>
      <div className="flex gap-2">
        <button onClick={install} disabled={busy}
          className="border border-emerald-500/50 text-emerald-300 px-2 py-1 disabled:opacity-40">
          {busy ? 'Installing…' : 'Install & restart'}
        </button>
        <button onClick={() => setUpdate(null)} className="border border-neutral-700 text-neutral-400 px-2 py-1">
          Later
        </button>
      </div>
    </div>
  );
}
```

### 3.7 Release + host the manifest

On a `v*` tag, `release.yml` (with the `TAURI_SIGNING_*` secrets set) produces the
installers, their `.sig` signatures, and a `latest.json` per artifact. Host the
artifacts and a combined `latest.json` at your `endpoints` URL:

```json
{
  "version": "0.2.0",
  "notes": "What changed…",
  "pub_date": "2026-01-01T00:00:00Z",
  "platforms": {
    "windows-x86_64": { "signature": "<.sig contents>", "url": "https://releases.YOURDOMAIN.com/CODE-NAME_0.2.0_x64-setup.exe" },
    "darwin-universal": { "signature": "<.sig contents>", "url": "https://releases.YOURDOMAIN.com/CODE-NAME_0.2.0_universal.app.tar.gz" },
    "linux-x86_64": { "signature": "<.sig contents>", "url": "https://releases.YOURDOMAIN.com/CODE-NAME_0.2.0_amd64.AppImage" }
  }
}
```

(You can also point `endpoints` directly at the GitHub Release `latest.json` if you
publish it as a release asset.)

**Done when:** an older installed build finds the newer signed version, installs it,
and relaunches; an invalid/unsigned update is rejected.

---

## 4. Secrets checklist (GitHub → Settings → Secrets and variables → Actions)

| Secret | Slice | Required for |
|--------|:-----:|--------------|
| `GITHUB_TOKEN` | 12.1 | Auto-provided; lets the release be created. |
| `APPLE_CERTIFICATE` | 12.2 | macOS signing (base64 `.p12`). |
| `APPLE_CERTIFICATE_PASSWORD` | 12.2 | macOS signing. |
| `APPLE_SIGNING_IDENTITY` | 12.2 | macOS signing identity string. |
| `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | 12.2 | macOS notarization. |
| Windows cert (Azure Trusted Signing creds **or** PFX + thumbprint) | 12.2 | Windows signing. |
| `TAURI_SIGNING_PRIVATE_KEY` | 12.3 | Signing update artifacts. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 12.3 | Signing update artifacts. |

Without the optional secrets the release workflow still builds installers (12.1);
each capability switches on as you add its secrets.

---

## 5. Release runbook (once secrets are set)

1. Bump `version` in `src-tauri/tauri.conf.json` (and `package.json` if you mirror it).
2. Commit, then tag: `git tag v0.2.0 && git push origin v0.2.0`.
3. Watch the **Release** workflow build/sign all three platforms.
4. Review the **draft** GitHub Release; verify installers open cleanly on a clean VM.
5. If using the updater, update/publish `latest.json` and the `.sig` files at your endpoint.
6. Publish the release.

## 6. Safety notes

- Updates are **signed**; the app verifies the signature against its embedded public
  key before applying. A failed or tampered update is discarded and the current
  version keeps running — updates never brick the app.
- Keep the updater **private key** out of the repo (CI secret only). Rotating it
  requires shipping a new app version with the new public key.
- Signing/notarization secrets are scoped to the release workflow only.
