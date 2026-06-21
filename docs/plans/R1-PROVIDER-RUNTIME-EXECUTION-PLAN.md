# R1 Provider Runtime Execution Plan

Status: locked for implementation

This document is the R1 implementation contract. It locks the provider runtime repair that moves provider execution authority, endpoint resolution, credential binding, network classification, readiness, model inventory, and chat eligibility into Rust/Tauri. Phase 3B documentation may be updated only to `implemented - pending owner review` after implementation and validation. It must not be marked accepted, closed, complete, or owner-approved.

## 1. Verified Baseline

- Verified current behavior: mandatory preflight on `master` showed no tracked or staged changes. The only untracked entries were protected owner artifacts: `ChatGPT Image Jun 6, 2026, 06_22_24 AM.png`, `assets/`, `briefing.txt`, and `codename_harness_ux_blueprint.pdf`.
- Verified current behavior: recent history contains R0 containment at `f4c2561 fix: contain unsafe sidecar execution paths` and Phase 3A closure at `c8f520f docs: accept phase 3a runtime controls`.
- Verified current behavior: Tauri command registration currently exposes `secret_get`, `secret_present`, `secret_set`, `secret_delete`, `gemini_model_list`, `model_list`, and `model_stream` from the WebView command surface (`src-tauri/src/lib.rs:17-36`).
- Verified current behavior: Tauri setup says Sidecar launch is explicit-only from Agent Sidecar Setup and does not auto-start Sidecar (`src-tauri/src/lib.rs:60-68`).
- Verified current behavior: Sidecar is contained as setup-only; `sidecar_send` and `sidecar_stream` return containment errors (`src-tauri/src/sidecar.rs:632-660`), and unexpected Sidecar exit records error state without automatic restart (`src-tauri/src/sidecar.rs:368-465`).
- Verified current behavior: CSP is disabled with `"csp": null` (`src-tauri/tauri.conf.json:28-30`), while development uses `http://localhost:3000` (`src-tauri/tauri.conf.json:6-10`).
- Verified current behavior: Phase 3A is documented as accepted and closed (`docs/plans/ACTIVE-BUILD-CHECKLIST.md:3-8`), and the accepted commit list is recorded (`docs/plans/ACTIVE-BUILD-CHECKLIST.md:39-45`).
- Verified current behavior: the canonical provider menu is built from Ollama, LM Studio, Custom OpenAI-compatible, Gemini, one divider, Set Up Agent Sidecar, and Provider Manager (`src/config/runtimeProviders.ts:249-268`).
- Verified current behavior: Sidecar aliases normalize to a setup-only Sidecar action and are excluded from normal provider connections (`src/config/runtimeProviders.ts:19-36`, `src/config/runtimeProviders.ts:218-239`).

## 2. Reconciled Findings

- Verified current behavior: Rust model commands accept frontend-supplied execution authority. `ModelReq` contains `kind`, `base_url`, `model`, `key_name`, `network_class`, `runs_local_only`, and `uses_cloud` (`src-tauri/src/model.rs:29-39`).
- Verified current behavior: Rust currently classifies provider/network/locality from frontend-provided fields, including `base_url`, cloud model suffixes, `uses_cloud`, `network_class`, `runs_local_only`, and `key_name` (`src-tauri/src/model.rs:118-209`).
- Verified current behavior: Rust retrieves secure-storage secrets by a frontend-supplied name through `read_key` (`src-tauri/src/model.rs:91-104`), `gemini_key` (`src-tauri/src/model.rs:222-224`), and `gemini_model_list` (`src-tauri/src/model.rs:442-458`).
- Verified current behavior: Rust builds provider request URLs from frontend `base_url` and attaches `Authorization: Bearer` for model listing (`src-tauri/src/model.rs:488-503`) and chat streaming (`src-tauri/src/model.rs:552-570`, `src-tauri/src/model.rs:610-615`).
- Verified current behavior: renderer-side provider transport still directly fetches Ollama at `${provider.baseUrl}/api/chat` (`src/lib/llm.ts:519-560`) and OpenAI-compatible endpoints at `${provider.baseUrl}/v1/chat/completions` (`src/lib/llm.ts:562-606`).
- Verified current behavior: renderer model discovery invokes Rust with frontend `baseUrl`, `keyName`, `networkClass`, `runsLocalOnly`, and `usesCloud` (`src/lib/llm.ts:197-207`), and has direct renderer fetch discovery paths (`src/lib/llm.ts:210-312`).
- Verified current behavior: provider persistence stores frontend-owned endpoint and model metadata, including `baseUrl`, `networkClass`, `runsLocalOnly`, `requiresNetwork`, `requiresSecret`, `apiKeyEnv`, and `models` in the legacy endpoint shape (`src/config/persist.ts:31-46`).
- Verified current behavior: `saveConfig` writes provider connections to browser storage (`src/config/persist.ts:341-362`), and `loadConfig` reads them from browser storage (`src/config/persist.ts:301-323`).
- Verified current behavior: provider selection triggers automatic refresh; `setActiveProvider` awaits `refreshProviderModels` after selecting a profile (`src/state/AppState.tsx:922-931`).
- Verified current behavior: current status vocabulary lacks the required R1 readiness states. `ProviderStatus` does not contain `stale`, `checking`, `endpoint_unavailable`, `authentication_failed`, `permission_denied`, `quota_exhausted`, `model_unavailable`, `connection_check_failed`, `refresh_failed`, `configuration_disabled`, `policy_denied`, or `network_denied` (`src/types.ts:50-132`), and renderer labels mirror the smaller set (`src/lib/llm.ts:62-87`).
- Verified current behavior: generic secret commands allow frontend-selected names for set, presence, and delete (`src-tauri/src/secrets.rs:24-60`), while raw secret read is already denied (`src-tauri/src/secrets.rs:31-37`).
- Verified current behavior: the secret UI exposes `GEMINI_API_KEY` and inactive Ollama cloud-key affordance `OLLAMA_API_KEY` (`src/components/config/SecretsPanel.tsx:4-8`).
- Verified current behavior: policy registry treats model commands as conditional network operations (`src-tauri/src/policy.rs:447-468`) and registers generic secret command policies (`src-tauri/src/policy.rs:575-604`).
- Verified current behavior: KB already contains a loopback URL validator that accepts `localhost`, `127.0.0.1`, and `::1` and rejects remote, https, example.com, and path cases (`src-tauri/src/kb.rs:915-946`, `src-tauri/src/kb.rs:3205-3217`).
- Verified current behavior: current tests preserve canonical provider order and Sidecar exclusion (`src/config/runtimeProviders.test.ts:39-102`), current direct transport behavior (`src/lib/llm.test.ts:195-252`), current secret bridge behavior (`src/lib/secrets.test.ts:21-51`), Sidecar containment (`src/state/sidecarContainment.test.ts:13-64`), model selector scroll and tray sizing (`src/components/runtimeControlLayout.test.ts:29-98`), and current provider persistence migration (`src/config/persist.test.ts:36-376`).

## 3. Locked Scope Boundary

- Required implementation: R1 repairs only the normal text provider runtime for Ollama, LM Studio, Custom OpenAI-compatible, and Gemini.
- Required implementation: R1 preserves the normal provider menu order as Ollama, LM Studio, Custom OpenAI-compatible, Gemini, one divider, Set Up Agent Sidecar, and Provider Manager.
- Required implementation: Sidecar remains setup-only and excluded from normal provider records, readiness, model inventory, chat routing, and fallback.
- Required implementation: R1 does not restore or activate Agent Sidecar execution, ADK, A2A, A2UI, WebMCP, Browser Harness, real tool binding, workspace/repository tools, autonomous edits, graph-layout work, or Sidecar feature restoration.
- Required implementation: automated validation uses fake transports, fixtures, and controlled local test servers only. It does not use live cloud providers, paid inference, real credentials, or real user secrets.
- Required implementation: no provider operation may accept WebView-supplied endpoint URL, host, port, protocol, authorization header, secret name, credential reference, network classification, locality override, cloud-use override, fallback provider, or fallback model.

## 4. Provider Runtime Threat Model

- Verified current behavior: a compromised WebView can currently influence runtime endpoint, model, secret name, provider kind, and network classification by invoking `model_stream` or `model_list` with the fields in `ModelReq` (`src-tauri/src/model.rs:29-39`, `src-tauri/src/model.rs:462-471`, `src-tauri/src/model.rs:533-548`).
- Required implementation: treat the WebView as untrusted for provider execution. WebView input is limited to canonical provider ID, approved connection ID, selected model ID, message payload, approved tuning values, and explicit operation intent.
- Required implementation: Rust/Tauri is the sole authority for endpoint resolution, transport, credential binding, network classification, network gate selection, model inventory, provider routing, and chat eligibility.
- Required implementation: persisted frontend state and legacy localStorage are untrusted migration input only. They cannot regain execution authority after migration.
- Required implementation: a compromised WebView cannot select a secret by name, attach an authorization header, substitute a provider, substitute a model, downgrade a remote endpoint to local, bypass network policy, or trigger hidden readiness/model refresh.

## 5. Locked Target Architecture

- Required implementation: add a Rust provider runtime domain layer in `src-tauri/src/provider/` with registry, store, validation, credential binding, adapters, operations, migration, and tests.
- Required implementation: register only safe provider commands in Tauri: create connection, edit connection, disable connection, delete connection, approve connection, check connection, refresh models, list provider runtime state, store provider credential, clear provider credential, query credential presence, stream chat, cancel stream, and migrate legacy provider config.
- Required implementation: retain legacy `model_list`, `gemini_model_list`, `model_stream`, and generic provider-secret command names only as denied compatibility shims or remove their provider-runtime call sites after frontend migration. Any retained shim returns a structured retired-command failure and never performs provider network activity.
- Required implementation: renderer transport in `src/lib/llm.ts` becomes a command bridge only. Direct normal-provider `fetch()` paths are removed or constrained to non-provider UI assets.
- Required implementation: Rust writes provider runtime state into a versioned file under the Tauri app config directory with atomic writes and migration backups.
- Required implementation: frontend state renders safe DTOs returned by Rust. It does not persist runtime endpoints, secret names, credential references, readiness eligibility, or current-session readiness in localStorage.

## 6. Provider, Connection, and Credential Data Model

- Required implementation: create Rust types equivalent to `ProviderId`, `ConnectionId`, `ConnectionRecord`, `ConnectionApprovalState`, `TransportClass`, `LocalityClassification`, `CredentialBindingRef`, `ReadinessState`, `ModelInventoryState`, `ChatEligibility`, and `ProviderOperationResult`.
- Required implementation: `ProviderId` is the canonical closed set: `ollama`, `lmstudio`, `custom-openai`, and `gemini`. Sidecar is not a `ProviderId`.
- Required implementation: `ConnectionId` is a Rust-generated opaque ID for custom connections and a Rust-owned stable ID for default local Ollama and LM Studio records. WebView-provided IDs are selectors only; they are never authorities.
- Required implementation: `ConnectionRecord` stores provider ID, connection ID, safe display label, normalized endpoint origin/path policy reference, transport class, locality classification, approval state, disabled reason, credential requirement, credential binding reference, created/updated timestamps, and stale inventory metadata.
- Required implementation: Ollama has an approved local default connection with a Rust-owned normalized default endpoint. The endpoint is editable only through explicit Provider Manager configuration.
- Required implementation: LM Studio has an approved local default connection with a Rust-owned normalized default endpoint. The endpoint is editable only through explicit Provider Manager configuration.
- Required implementation: Gemini uses a Rust-owned fixed provider route and fixed Rust credential binding. It does not expose or persist an endpoint URL in the WebView.
- Required implementation: Custom OpenAI-compatible begins with no usable default connection unless a valid connection exists through migration or explicit Provider Manager configuration.
- Required implementation: no fake `custom-openai:local-default` record is created.
- Required implementation: multiple Custom OpenAI-compatible connections are supported, each with an opaque Rust credential-binding reference that is never returned to the WebView.
- Required implementation: safe DTOs include provider ID, connection ID, display label, approval/disabled state, safe locality label, credential configured boolean, readiness state, inventory count, stale inventory metadata, safe failure category, and safe user-facing detail. Safe DTOs exclude endpoint URL unless needed in explicit Provider Manager edit display, and exclude raw secret values, secret names, credential binding refs, auth headers, and policy internals.
- Why necessary / replaces / boundary: these types replace frontend-owned `ProviderConnection` execution fields (`src/types.ts:50-132`) and localStorage endpoint records (`src/config/persist.ts:31-46`) with Rust-owned records that the WebView can select but cannot forge.

## 7. Endpoint Validation and Transport Policy

- Required implementation: endpoint validation occurs only in Rust during explicit connection create/edit/migration, never at chat time from WebView input.
- Required implementation: loopback providers allow only normalized loopback forms: `127.0.0.1`, `::1`, and approved `localhost` normalization. R1 reuses the existing loopback validator behavior proven in `src-tauri/src/kb.rs:915-946` and expands it into the provider validator.
- Required implementation: no remote endpoint is classified as local.
- Required implementation: non-loopback private, link-local, multicast, unspecified, reserved, carrier-grade, and other non-public address ranges are rejected for remote provider use.
- Required implementation: remote Custom OpenAI-compatible connections require HTTPS.
- Required implementation: remote connections require the applicable network policy gate before credentials are retrieved and before any network request.
- Required implementation: embedded username/password, query strings, fragments, and arbitrary paths are rejected.
- Required implementation: path allowance is explicit and provider-specific:
  - Ollama base origin only; adapter appends `/api/tags` for refresh, `/api/version` or equivalent non-generating health route for check, and `/api/chat` for chat.
  - LM Studio base origin only; adapter appends `/v1/models` for refresh and a non-generating route for check.
  - Custom OpenAI-compatible base origin only with optional explicit `/v1` compatibility base after normalization; adapter controls `/models` and `/chat/completions`.
  - Gemini has fixed Rust-owned API routes and no user endpoint.
- Required implementation: redirects are disabled for all provider requests.
- Required implementation: hostname resolution remains under Rust control at request time. Remote hostname requests are rejected when resolution yields any non-public address. One-time DNS checks are not used as a lasting authorization.
- Required implementation: literal public-IP remote endpoints are rejected. Remote custom endpoints require DNS hostnames that resolve to public addresses.
- Required implementation: provider HTTP clients use documented timeouts, response-size limits, and error-body truncation. Locked limits are 10 seconds for check, 20 seconds for model refresh, 120 seconds idle/overall stream guard for chat streaming, 1 MiB max check/refresh body, 8 KiB max provider error body, and 256 KiB max buffered non-stream JSON frame.
- Required implementation: provider errors are sanitized before reaching the WebView. Sanitization strips authorization headers, query values, request bodies, raw secrets, credential binding refs, and full upstream error bodies.
- Why necessary / replaces / boundary: this replaces renderer `fetch()` endpoint construction (`src/lib/llm.ts:519-606`) and Rust `base_url` request construction (`src-tauri/src/model.rs:488-503`, `src-tauri/src/model.rs:552-570`, `src-tauri/src/model.rs:610-615`) with Rust-owned validation and request assembly.

## 8. Rust Command, Policy, and Stream Design

- Required implementation: add explicit configuration commands:
  - `provider_create_connection`
  - `provider_edit_connection`
  - `provider_disable_connection`
  - `provider_delete_connection`
  - `provider_approve_connection`
- Required implementation: these configuration commands may receive a user-entered endpoint only in explicit Provider Manager flows. They validate, normalize, classify, generate/select Rust-owned connection IDs, write Rust-owned records, and return safe DTOs.
- Required implementation: do not add an ambiguous generic `provider_upsert_connection` command.
- Required implementation: add explicit runtime commands:
  - `provider_list_runtime_state`
  - `provider_check_connection`
  - `provider_refresh_models`
  - `provider_stream_chat`
  - `provider_cancel_stream`
  - `provider_migrate_legacy_config`
- Required implementation: `provider_stream_chat` accepts only provider ID, connection ID, selected model ID, messages, tuning values, and operation intent. It rejects any payload containing endpoint, base URL, host, port, protocol, auth header, secret name, credential reference, network/locality override, fallback provider, or fallback model.
- Required implementation: Rust command policy entries are added for every new command. Runtime commands are critical and network-gated based on Rust-resolved provider records, not WebView flags. Configuration commands are explicit user configuration operations.
- Required implementation: cancellation is Rust-owned through operation IDs tracked in session state. Cancellation stops the active stream and clears operation state.
- Required implementation: legacy model commands are retired before final validation. They either are unregistered or return structured retired-command failures with no provider network activity.
- Why necessary / replaces / boundary: these commands replace the unsafe `model_list` and `model_stream` surfaces that accept frontend endpoint/key/classification fields (`src-tauri/src/model.rs:462-471`, `src-tauri/src/model.rs:533-548`) and the frontend shell wrapper that sends them (`src/lib/llm.ts:197-207`, `src/lib/llm.ts:608-638`).

## 9. Provider Adapter Contracts

- Required implementation: implement explicit Rust adapters for Ollama, LM Studio, Custom OpenAI-compatible, and Gemini.
- Required implementation: every adapter implements:
  - non-generating connection check;
  - non-generating model refresh;
  - chat stream;
  - required policy gates;
  - credential requirements;
  - endpoint origin resolution;
  - timeout behavior;
  - cancellation behavior;
  - normalized failure mapping;
  - safe user-facing details.
- Required implementation: Check Connection never generates assistant text.
- Required implementation: Refresh Models never generates assistant text.
- Required implementation: where a provider lacks a dedicated health endpoint, a non-generating request may be used solely as a probe. Returned model data from a check is discarded and cannot update inventory.
- Required implementation: Refresh Models is the only operation that updates current-session inventory.
- Required implementation: no automatic retries, provider fallback, model substitution, or synthetic answer after failure.
- Required implementation: Gemini discovery and generation use Rust/Tauri secure commands and secure desktop storage. The renderer cannot send Gemini key names or endpoint routes.
- Why necessary / replaces / boundary: adapters replace provider-specific branching in `src/lib/llm.ts:210-312`, `src/lib/llm.ts:519-664`, and `src-tauri/src/model.rs:442-638` with a Rust-only provider authority.

## 10. Readiness, Inventory, and Chat Eligibility State Machine

- Required implementation: central readiness states are exactly:
  - `unknown`
  - `checking`
  - `ready`
  - `stale`
  - `requires_api_key`
  - `requires_sign_in`
  - `endpoint_unavailable`
  - `authentication_failed`
  - `permission_denied`
  - `quota_exhausted`
  - `model_unavailable`
  - `connection_check_failed`
  - `refresh_failed`
  - `configuration_disabled`
  - `policy_denied`
  - `network_denied`
- Required implementation: readiness records include `checkedThisSession`, `lastExplicitCheckAt`, `checkInProgress`, `refreshInProgress`, model inventory state/count, safe failure category, and safe user-facing detail.
- Required implementation: provider existence begins as `unknown`.
- Required implementation: persisted prior success displays after restart only as `stale`.
- Required implementation: `stale` never authorizes chat.
- Required implementation: Rust returns the authoritative `ChatEligibility`.
- Required implementation: a chat request is eligible only when provider ID is recognized, connection exists, connection is approved, policy permits the operation, required credential is present, an explicit current-session connection check succeeded, current-session model inventory exists, selected model exists in that current-session inventory, no check or refresh is in progress, and no terminal provider/connection failure blocks use.
- Required implementation: selecting a provider never checks, refreshes, retries, generates, falls back, or substitutes a model.
- Required implementation: duplicate check and refresh operations are blocked per provider connection.
- Required implementation: ineligible chat returns a truthful structured failure with safe category and safe detail.
- Why necessary / replaces / boundary: this replaces frontend-only `canSendWithRuntime` (`src/lib/llm.ts:131-150`), selection-triggered refresh (`src/state/AppState.tsx:922-931`), and smaller current status vocabularies (`src/types.ts:50-132`, `src/lib/llm.ts:62-87`) with Rust-owned eligibility.

## 11. Secret Boundary and Compatibility Transition

- Verified current behavior: provider secret usage currently flows through frontend-selected names in `src/lib/secrets.ts:10-41`, `src/components/config/SecretsPanel.tsx:4-87`, `src-tauri/src/secrets.rs:24-60`, `src-tauri/src/model.rs:91-104`, and `src-tauri/src/model.rs:222-224`.
- Required implementation: provider credentials use one-way write-only entry. A user types a credential into Provider Manager, the value is sent immediately to Rust for secure storage, the WebView clears temporary state after command completion, and the value is never stored in localStorage or returned to the WebView.
- Required implementation: add provider-scoped credential commands:
  - `provider_store_credential`
  - `provider_clear_credential`
  - `provider_credential_status`
- Required implementation: these commands accept provider ID and connection ID only. They do not accept a frontend secret name.
- Required implementation: Rust maps provider credentials to fixed internal bindings. Gemini maps to the fixed Gemini binding. Each Custom OpenAI-compatible connection maps to a Rust-generated opaque binding. Ollama and LM Studio do not expose inactive cloud key affordances in normal R1 UI.
- Required implementation: arbitrary legacy `apiKeyEnv` values are treated as disabled and unapproved. Only fixed legacy mappings verified in source are migrated internally, and raw keychain values are never read through the frontend.
- Required implementation: generic `secret_get` remains denied or is removed. `secret_present`, `secret_set`, and `secret_delete` are removed from provider-secret flows. Any retained generic commands return denied compatibility responses or remain only for non-provider fixed-purpose callers proven by source inventory.
- Required implementation: existing OS keychain entries are never deleted automatically.
- Why necessary / replaces / boundary: this removes WebView-selected secret names from provider execution and replaces the generic secret UI that exposes `GEMINI_API_KEY` and `OLLAMA_API_KEY` (`src/components/config/SecretsPanel.tsx:4-8`) with provider-scoped, Rust-bound credentials.

## 12. Migration, Recovery, and Rollback Plan

- Required implementation: add a Rust-owned versioned provider store under the Tauri app config directory.
- Required implementation: writes are atomic using temp-file write, sync, and rename semantics supported by the platform.
- Required implementation: before migration, Rust creates a versioned backup of the previous provider store or migration input snapshot. Backups do not contain raw secrets.
- Required implementation: migration has a Rust-side version marker and is idempotent.
- Required implementation: WebView sends legacy localStorage provider configuration only as untrusted migration input. Rust does not read browser localStorage directly.
- Required implementation: once migration completes, legacy frontend values cannot regain execution authority.
- Required implementation: valid normalized loopback endpoints for Ollama and LM Studio migrate to approved local records.
- Required implementation: valid HTTPS remote Custom OpenAI-compatible endpoints migrate as disabled/pending approval, never chat-eligible.
- Required implementation: invalid or ambiguous endpoints become disabled and unapproved.
- Required implementation: arbitrary legacy `apiKeyEnv` values disable credential binding and require explicit re-entry through Provider Manager. Fixed Gemini legacy mapping becomes a Rust-owned Gemini credential-status check without exposing the key.
- Required implementation: Sidecar aliases migrate to no normal provider/model selection.
- Required implementation: migrated model inventories are stale display-only metadata and do not satisfy current-session eligibility.
- Required implementation: corrupt input loads safe defaults, disables affected records, and returns recovery guidance.
- Required implementation: partial migration is recoverable by re-running idempotent migration.
- Required implementation: rollback preserves a versioned backup but never reactivates legacy frontend execution authority.
- Why necessary / replaces / boundary: this replaces browser localStorage persistence of `providerConnections` (`src/config/persist.ts:301-362`) and legacy endpoint migration that preserves `baseUrl` and `apiKeyEnv` in frontend state (`src/config/persist.ts:155-240`).

## 13. Frontend Integration Plan

- Required implementation: replace provider execution functions in `src/lib/llm.ts` with safe Tauri command calls. Direct normal-provider `fetch()` execution is removed.
- Required implementation: replace `discoverProviderModels` with explicit `provider_check_connection` and `provider_refresh_models` calls exposed as separate actions.
- Required implementation: `setActiveProvider` updates selection only. It does not refresh models (`src/state/AppState.tsx:922-931` is replaced).
- Required implementation: `sendMessage` requests Rust `ChatEligibility` through `provider_stream_chat` and uses the structured rejection when ineligible. It no longer uses frontend `canSendWithRuntime` as the authority (`src/lib/llm.ts:131-150` and `src/state/AppState.tsx:1329-1358` are replaced).
- Required implementation: Provider Manager supports explicit create, edit, disable, delete, approve, check connection, refresh models, store credential, clear credential, and credential status operations.
- Required implementation: Provider Manager endpoint entry appears only inside explicit connection configuration. Runtime header and chat send flows never include endpoint or credential fields.
- Required implementation: remove or quarantine `SecretsPanel` provider-secret entries, including inactive Ollama cloud-key presentation (`src/components/config/SecretsPanel.tsx:4-87`).
- Required implementation: runtime header/status, model selector, Provider Manager, chat eligibility, and provider-specific failure display consume one shared readiness DTO.
- Required implementation: model selector remains scrollable and Parameter Tray remains tuning-only, preserving existing layout guarantees in `src/components/runtimeControlLayout.ts:21-104` and tests in `src/components/runtimeControlLayout.test.ts:29-98`.
- Required implementation: canonical provider menu order and Sidecar setup separation remain protected by tests (`src/config/runtimeProviders.test.ts:39-102`, `src/config/runtimeProviders.test.ts:166-179`).

## 14. CSP Feasibility Gate

- Verified current behavior: CSP is disabled (`src-tauri/tauri.conf.json:28-30`).
- Required implementation: CSP hardening is attempted only after renderer provider fetch paths are removed and tests prove no provider endpoint origin is required in renderer `connect-src`.
- Required implementation: inspect installed Tauri and Vite behavior through the current config before changing CSP. Production requirements are limited to the Tauri IPC/custom protocol and packaged assets. Development requirements include the Vite dev server at `http://localhost:3000` from `src-tauri/tauri.conf.json:6-10`.
- Required implementation: candidate production CSP must not allow arbitrary provider origins. Candidate development CSP may include localhost dev/HMR allowances required by Vite but not provider endpoint origins.
- Required implementation: create a bounded smoke procedure: `npm run build`, Tauri config validation through Rust tests/build, and a manual desktop smoke checklist for owner execution after implementation.
- Required implementation: implement CSP in R1 only if the smoke procedure succeeds without adding provider origins to renderer `connect-src`.
- Required implementation: if installed Tauri/Vite behavior prevents safe validation in this task, leave CSP unchanged, document the exact blocking source fact in the R1 docs update, and add a narrowly scoped deferred hardening item. This is not permission to leave `csp: null` indefinitely.

## 15. Test Strategy and Negative Security Cases

- Required implementation: Rust trust-boundary tests prove frontend input cannot alter execution endpoint, secret binding, locality classification, network gate outcome, fallback provider, or fallback model.
- Required implementation: Rust tests prove rejection of unknown provider IDs, unknown connection IDs, disabled connections, unapproved connections, runtime raw URLs, raw secret names, auth headers, locality/network overrides, model IDs outside current-session inventory, stale-only readiness, and retired legacy command paths.
- Required implementation: Rust tests prove raw secrets never appear in safe DTOs, persistence, logs, error text, migration backups, or frontend state.
- Required implementation: adapter tests use fake transports or controlled local test servers only. They prove Check Connection does not generate text, Refresh Models does not generate text, Check does not update inventory, Refresh is the only inventory-update path, provider-specific failures map to distinct safe states, redirects are rejected, disallowed endpoint classes are rejected, policy is evaluated before credentials and network activity, cancellation clears request state, no automatic retry occurs, and no fallback occurs.
- Required implementation: frontend tests prove provider selection does not check or refresh automatically, Check and Refresh are explicit separate actions, duplicate check/refresh operations are blocked, `stale` is visible but does not authorize chat, only Rust eligibility allows send, provider menu order remains exact, Agent Sidecar remains setup-only, model selector remains scrollable, Parameter Tray remains tuning-only, and no executable renderer `fetch()` remains for normal provider transport.
- Required implementation: migration tests prove clean install, valid local migration, valid remote custom migration as disabled/pending approval, invalid endpoint migration, arbitrary `apiKeyEnv` migration, Sidecar alias migration, repeated migration, partial migration recovery, corrupt input recovery, and rollback behavior.
- Required implementation: CI remains aligned with frontend lint/test/build and Rust tests already defined in `.github/workflows/ci.yml:24-110`.

## 16. Chronological Workstreams

1. Required implementation: Rust provider domain, registry, store, endpoint validator, safe DTOs, and unit tests.
2. Required implementation: provider-scoped credential binding, provider credential commands, generic secret caller inventory conversion, and tests.
3. Required implementation: versioned provider migration, recovery, rollback, atomic store writes, and migration tests.
4. Required implementation: provider adapters, Rust policy integration, model operations, chat stream, cancellation, fake transport tests, and retired legacy command tests.
5. Required implementation: React state/UI adoption, explicit check/refresh, removal of normal-provider renderer transport, readiness/eligibility tests, and regression tests for provider menu, Sidecar setup, model selector, Parameter Tray, and runtime profile behavior.
6. Required implementation: CSP hardening commit only if the feasibility gate passes.
7. Required implementation: documentation truth update that marks Phase 3B/R1 only as `implemented - pending owner review`.

## 17. Exact File-Level Change Map

- Required implementation: `src-tauri/src/provider/mod.rs` - Rust provider module entrypoint; replaces scattered frontend authority with Rust-owned provider authority and exports safe commands.
- Required implementation: `src-tauri/src/provider/domain.rs` - provider IDs, connection IDs, connection records, approval state, transport class, locality classification, credential binding ref, readiness state, inventory state, chat eligibility, and operation result.
- Required implementation: `src-tauri/src/provider/validation.rs` - endpoint validation and transport policy; replaces runtime `base_url` trust in `src-tauri/src/model.rs:488-503` and `src-tauri/src/model.rs:552-570`.
- Required implementation: `src-tauri/src/provider/store.rs` - versioned provider store, atomic writes, backup, recovery, rollback marker, and safe DTO conversion; replaces frontend provider persistence authority in `src/config/persist.ts:301-362`.
- Required implementation: `src-tauri/src/provider/credentials.rs` - fixed provider credential bindings and secure storage adapter; replaces frontend-selected secret names in `src-tauri/src/secrets.rs:24-60` for provider use.
- Required implementation: `src-tauri/src/provider/adapters.rs` plus provider-specific adapter files - Ollama, LM Studio, Custom OpenAI-compatible, and Gemini operations.
- Required implementation: `src-tauri/src/provider/migration.rs` - Rust-owned migration from legacy localStorage DTOs treated as untrusted input.
- Required implementation: `src-tauri/src/provider/tests.rs` or module-local tests - Rust unit tests and fake transport tests for R1 boundary behavior.
- Required implementation: `src-tauri/src/lib.rs` - manage provider runtime state and register new commands; remove or retire unsafe command registration from `src-tauri/src/lib.rs:17-36` before final validation.
- Required implementation: `src-tauri/src/model.rs` - retire or narrow legacy model commands so they cannot perform provider operations from frontend endpoint/key fields.
- Required implementation: `src-tauri/src/secrets.rs` - remove provider use of generic secret commands and keep denied compatibility behavior only when required by non-provider tests.
- Required implementation: `src-tauri/src/policy.rs` - add policies for new provider commands and retire legacy model/secret provider policies.
- Required implementation: `src-tauri/tauri.conf.json` - CSP update only if feasibility gate passes.
- Required implementation: `src/lib/llm.ts` - replace provider fetch and unsafe invoke payloads with safe provider command bridge.
- Required implementation: `src/lib/secrets.ts` - remove provider-secret generic helpers or convert to provider-scoped bridge.
- Required implementation: `src/config/defaults.ts` - remove execution endpoints and `apiKeyEnv` from frontend authority; keep display defaults only.
- Required implementation: `src/config/persist.ts` - migrate from authoritative provider persistence to untrusted legacy migration handoff and frontend UI preference persistence only.
- Required implementation: `src/config/runtimeProviders.ts` - preserve canonical menu and Sidecar exclusion while consuming Rust safe DTOs.
- Required implementation: `src/types.ts` - add R1 safe DTOs/readiness types and remove runtime request endpoint/key fields.
- Required implementation: `src/state/AppState.tsx` - adopt Rust runtime state, explicit check/refresh, Rust eligibility, and no selection-triggered refresh.
- Required implementation: `src/components/settings/SettingsScreen.tsx` - Provider Manager explicit connection and credential actions.
- Required implementation: `src/components/config/SecretsPanel.tsx` - remove/quarantine provider generic secret UI.
- Required implementation: `src/components/right/StatusModule.tsx` - consume centralized readiness and keep provider menu/model selector behavior.
- Required implementation: `src/components/config/StealthDrawer.tsx`, `src/components/config/ModelTuningControls.tsx`, and `src/components/runtimeControlLayout.ts` - preserve tuning-only Parameter Tray and selector sizing when integrating new readiness state.
- Required implementation: `src/**/*.test.ts`, `src/**/*.test.tsx`, `src-tauri/src/**` tests, `e2e/**`, and `.github/workflows/ci.yml` - expand automated coverage without live providers or real secrets.
- Required implementation: `docs/plans/ACTIVE-BUILD-CHECKLIST.md` - final documentation truth update only after implementation validation.

## 18. Commit Plan With Tests Per Commit

1. Documentation gate commit: `docs: lock r1 provider runtime execution plan`
   - Files: `docs/plans/R1-PROVIDER-RUNTIME-EXECUTION-PLAN.md`
   - Tests: `git diff --check`; no code tests required for docs-only.
2. Rust provider foundation commit: provider domain, registry, store skeleton, endpoint validation, safe DTOs, unit tests.
   - Tests: targeted `cargo test --locked provider::`.
3. Credential boundary commit: provider-scoped credential commands, fixed binding mappings, generic secret provider-flow retirement, tests.
   - Tests: targeted credential Rust tests and frontend secret bridge tests updated for provider-scoped behavior.
4. Migration commit: versioned provider store migration, backup/recovery/rollback, legacy DTO handling, tests.
   - Tests: targeted Rust migration tests and updated TypeScript persistence migration tests.
5. Adapter/runtime commit: provider adapters, policy integration, explicit check/refresh, chat stream, cancellation, retired legacy model command tests.
   - Tests: targeted Rust provider adapter tests and policy registration tests.
6. Frontend adoption commit: React state/UI integration, command bridge, removal of executable normal-provider renderer fetch paths, readiness/eligibility tests.
   - Tests: `npm test -- --run` or targeted Vitest suites for llm, AppState, runtimeProviders, runtimeControlLayout, secrets, and sidecar containment.
7. CSP commit: implement bounded CSP only if feasibility gate passes.
   - Tests: `npm run build`, targeted config tests, and CSP smoke checklist recorded for owner desktop validation.
8. Documentation truth commit: update active checklist to `implemented - pending owner review`.
   - Tests: `git diff --check`.

Every commit stages explicit file paths only, runs relevant tests before commit, runs `git diff --cached --check`, confirms protected owner artifacts are not staged, and uses a narrow truthful message.

## 19. Validation Matrix

- Required validation after all implementation commits:
  - `Set-Location "C:\Users\justi\Desktop\Codex\code-name2"; Set-Location src-tauri; cargo test --all-features --locked; Set-Location ..; npm run lint; npm test; npm run build; git diff --check; git status --short --branch`
- Required validation per behavior commit: run the targeted Rust and/or frontend tests listed in the commit plan before staging that commit.
- Required validation: no live provider, cloud quota, real secret, paid inference, or desktop app launch is used for automated tests.
- Required validation: actual desktop validation is left for owner execution after implementation. The final report must not claim desktop validation unless it is performed.

## 20. Stop Conditions

- Stop if tracked or staged changes appear outside the files intentionally changed by the current commit.
- Stop if a protected owner artifact becomes staged or modified.
- Stop if the source does not contain enough information to preserve existing provider behavior safely.
- Stop if safe migration of an existing custom endpoint cannot be verified by source and tests.
- Stop if any proof path requires a live secret, real provider call, cloud quota, or paid inference.
- Stop if R1 would require restoring contained Sidecar behavior.
- Stop if a requested path would expose a raw secret or credential binding reference to the WebView.
- Stop if preserving current provider behavior would require accepting arbitrary frontend execution URLs, secret names, authorization headers, network/locality overrides, fallback providers, or fallback models.
- Stop if CSP validation would require provider endpoint origins in renderer `connect-src`.

## 21. Definition of Done

- Required implementation: Rust/Tauri owns provider execution endpoint resolution, credential binding, network classification, provider routing, readiness, model inventory, and chat eligibility.
- Required implementation: WebView provider execution commands cannot carry endpoint URLs, host/port/protocol, auth headers, secret names, credential refs, network/locality overrides, fallback providers, or fallback models.
- Required implementation: direct renderer normal-provider transport is removed or proven non-executable.
- Required implementation: provider configuration is stored in a Rust-owned versioned provider store with atomic writes, migration backup, recovery, rollback behavior, and safe DTOs.
- Required implementation: provider credentials are write-only from WebView into Rust secure storage and never returned to frontend DTOs, logs, errors, persistence, migration backups, or frontend state.
- Required implementation: explicit Check Connection and Refresh Models operations are separate, non-generating, non-automatic, and duplicate-safe.
- Required implementation: `stale` is visible after restart but never authorizes chat.
- Required implementation: current-session check and current-session inventory are required for chat eligibility.
- Required implementation: no automatic provider checks, automatic refreshes, background provider polling, hidden retries, provider fallback, model substitution, or synthetic fallback responses exist.
- Required implementation: canonical provider menu order, Sidecar setup separation, model selector scrollability, Parameter Tray sizing/tuning-only behavior, and runtime profile behavior remain covered by tests.
- Required implementation: all required validation commands pass, or any failure is reported with exact output and no false acceptance claim.
- Required implementation: final documentation says only `implemented - pending owner review`; R1 and Phase 3B are not marked accepted, closed, complete, or owner-approved.
