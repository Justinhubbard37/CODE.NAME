# CODE NAME 2 Phase 0 Stabilization Plan

## 1. Executive Summary

Phase 0 stabilizes the repository before deeper security hardening or new feature
work. It establishes a Git baseline, marks generated artifacts, makes docs and
visible labels truthful, removes reviewed encoding artifacts, improves Windows 11
script compatibility, and records verification results.

Phase 0 is not GraphRAG implementation, vector embedding implementation, provider
redesign, browser harness expansion, backend gate hardening, SSO, compliance,
auto-update, or new agent behavior.

Expected outcome: the repo is safe to modify, current claims match source reality,
generated/dependency folders are classified but not deleted, and future work can
start from a verifiable baseline.

## 2. Source Evidence Reviewed

- Master blueprint: `docs/audits/master-build-blueprint.md`.
- Root files: `README.md`, `.gitignore`, `package.json`, `package-lock.json`,
  `.env.example`, workflow/config files.
- Source areas: `src/`, `src-tauri/`, `sidecar/`.
- Docs areas: `docs/BLUEPRINT.md`, `docs/USER_GUIDE.md`, `docs/ADMIN_GUIDE.md`,
  `docs/contracts/sidecar.md`, and integration notes.
- Evidence commands: `git status --short --branch`, `rg` searches for mojibake,
  misleading labels, GraphRAG/vector/gate claims, and package script inspection.

Commands intentionally deferred: `npm run clean`, `npm run build`, `npm run e2e`,
`npm audit`, `npm run sbom`, `npm install`, and `npx` commands.

## 3. Phase 0 Boundaries

Allowed:

- Initialize Git if missing and create a baseline commit if identity is configured.
- Update `.gitignore` for generated/dependency/build/cache artifacts.
- Update docs and visible labels for truthfulness.
- Rename misleading Phase 0-only files when behavior does not change.
- Replace Unix-only cleanup script with a cross-platform Node script.
- Create this plan and the implementation log.
- Run safe verification commands.

Forbidden:

- Deleting generated/dependency folders in this run.
- Moving or deleting root one-off artifacts.
- Implementing GraphRAG, real embeddings, backend gate enforcement, secrets
  redesign, provider routing redesign, browser URL policy, audit hash-chain
  redesign, persistence redesign, SSO, compliance, auto-update, or new tools.

Requires later owner approval:

- Removing `node_modules/`, `dist/`, `src-tauri/target/`, sidecar caches, browser
  test output, `sbom.json`, or one-off root artifacts.
- Any security/runtime behavior change.

## 4. Stabilization Workstreams

### 4.1 Git Baseline and Repo Safety

Findings: `git status --short --branch` initially failed because `.git` was
missing. Existing generated folders made cleanup unsafe without a baseline.

Plan: initialize Git, update ignore rules conservatively, stage source/config/docs
only, and create an initial commit if Git identity is already configured.

Risks: staging generated folders, losing original history, or cleaning before
baseline.

Acceptance criteria: Git status runs, baseline exists, generated/dependency
folders are not staged or deleted.

### 4.2 Generated Artifact and Dependency Hygiene

Findings: root contains generated/dependency artifacts including `node_modules/`,
`dist/`, likely `src-tauri/target/`, sidecar caches, and local one-off files.

Plan: ignore generated outputs, classify them in the implementation log, and do
not delete them in this run.

Risks: removing local demo artifacts or source-adjacent references before owner
review.

Acceptance criteria: artifacts are classified and ignored where appropriate; no
approved-deferred item is deleted or moved.

### 4.3 Documentation Truthfulness Pass

Findings: docs and README overstated GraphRAG, vector store, hard gates, secret
isolation, WebMCP/browser harness readiness, and production status.

Plan: rewrite current-state docs to mark GraphRAG/vector/security claims as
scaffolded, partial, planned, or deferred. Keep roadmap language when clearly
labeled as future work.

Risks: deleting useful roadmap intent or leaving current-state claims misleading.

Acceptance criteria: README/user/admin/sidecar docs distinguish current reality
from roadmap.

### 4.4 Encoding and Mojibake Cleanup

Findings: several docs/source comments display mojibake such as corrupted dashes,
arrows, bullets, and checkmarks.

Plan: search targeted docs/source and replace reviewed mojibake with readable
ASCII in touched files. Do not edit generated/dependency folders.

Risks: blind replacement can corrupt intentional Unicode or historical audit text.

Acceptance criteria: no unreviewed mojibake remains in the touched current-state
docs/source; remaining audit/history matches are documented.

### 4.5 Misleading Names, Labels, and UI Claims

Findings: `src/components/config/SlidersStub.tsx` is a real tuning control.
`GraphRAG Query`, `Vector store`, `hard gates`, and synthetic model readiness
wording overstated current capability.

Plan: rename the tuning file without behavior changes, update imports, and change
visible labels to truthful graph-search/retrieval-scaffold wording.

Risks: import churn or accidental behavior change.

Acceptance criteria: `rg -n "SlidersStub" src` returns no matches and UI labels do
not claim production GraphRAG/vector readiness.

### 4.6 Windows 11 Script Compatibility

Findings: `package.json` used `rm -rf dist server.js`, which is not PowerShell
friendly.

Plan: replace the clean script with `node scripts/clean.mjs` using Node built-ins
and explicit targets only. Do not run it in this execution pass.

Risks: cleanup scripts delete files by design; verification is deferred unless
explicitly approved.

Acceptance criteria: package script is cross-platform and no package dependency is
added.

### 4.7 Verification Baseline

Plan: run Git status, targeted `rg` checks, `npm run lint`, `npm test`, and
`cargo test --all-features --locked` if acceptable. Defer build/e2e/audit/sbom and
install/network commands.

Acceptance criteria: failures are recorded exactly; no Phase 1+ work is mixed in.

## 5. Proposed Phase 0 Task List

1. Establish Git baseline.
   - Purpose: make edits reviewable.
   - Files/folders: `.git/`, `.gitignore`.
   - Approach: initialize if missing, commit source/config/docs if identity exists.
   - Verification: `git status --short --branch`.

2. Update generated-artifact ignore rules.
   - Purpose: keep dependency/build/cache outputs out of source control.
   - Files/folders: `.gitignore`.
   - Approach: add only conservative generated/cache patterns.
   - Verification: `git status --short --branch`.

3. Classify, but do not delete, generated and local artifacts.
   - Purpose: make future cleanup reviewable.
   - Files/folders: `node_modules/`, `dist/`, `src-tauri/target/`,
     sidecar caches, Playwright output, `sbom.json`, root one-off files.
   - Approach: record classification in the implementation log.
   - Verification: implementation log contains every required item.

4. Update current-state docs.
   - Purpose: remove false-complete claims.
   - Files: `README.md`, `docs/USER_GUIDE.md`, `docs/ADMIN_GUIDE.md`,
     `docs/BLUEPRINT.md`, `docs/contracts/sidecar.md`, selected phase/strategy docs.
   - Approach: mark roadmap items as planned and current controls as partial.
   - Verification: targeted misleading-claim `rg`.

5. Clean reviewed mojibake.
   - Purpose: improve readability and avoid encoding noise in future audits.
   - Files: current-state docs and touched source comments/strings.
   - Approach: manual review, ASCII replacements, no generated folders.
   - Verification: targeted mojibake `rg`.

6. Rename misleading tuning component.
   - Purpose: align filename with actual behavior.
   - Files: `src/components/config/ModelTuningControls.tsx` and import sites.
   - Approach: rename only and update symbol/import names.
   - Verification: `rg -n "SlidersStub" src`.

7. Correct visible capability labels.
   - Purpose: avoid UI claims of production GraphRAG/vector readiness.
   - Files: graph query/archive UI and docs.
   - Approach: use graph-search/retrieval-scaffold wording.
   - Verification: misleading-label `rg`.

8. Replace Unix-only clean script.
   - Purpose: Windows 11 compatibility.
   - Files: `package.json`, `scripts/clean.mjs`.
   - Approach: Node built-in cleanup script, no dependency install.
   - Verification: inspect script; do not run in this pass.

9. Run verification baseline.
   - Purpose: prove stabilization did not break the repo.
   - Commands: Git status, `rg` checks, `npm run lint`, `npm test`,
     optional `cargo test --all-features --locked`.
   - Verification: implementation log records results.

## 6. Files and Folders Likely Touched

Documentation:

- `README.md`
- `docs/BLUEPRINT.md`
- `docs/USER_GUIDE.md`
- `docs/ADMIN_GUIDE.md`
- `docs/contracts/sidecar.md`
- selected docs with current-state wording
- `docs/plans/phase-0-stabilization-plan.md`
- `docs/plans/phase-0-implementation-log.md`

Source/config:

- `.gitignore`
- `package.json`
- `scripts/clean.mjs`
- `src/components/config/ModelTuningControls.tsx`
- `src/components/config/StealthDrawer.tsx`
- `src/components/settings/SettingsScreen.tsx`
- `src/components/left/GraphQueryInput.tsx`
- `src/components/left/ArchiveIndex.tsx`
- `src/App.tsx`

Classified but not deleted:

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `sidecar/**/__pycache__/`
- Playwright output if present
- `sbom.json` if present
- `briefing.txt`
- `codename_harness_ux_blueprint.pdf`
- `ChatGPT Image Jun 6, 2026, 06_22_24 AM.png`
- `assets/New Text Document.txt`

## 7. Owner Decisions Required Before Implementation

Decisions resolved for this run:

- Git baseline: approved to initialize if missing.
- Generated/dependency deletion: explicitly deferred.
- One-off root artifacts: classify only.
- Docs: update blunt current-state truthfulness while preserving roadmap language.
- GraphRAG/vector wording: qualify or rename current-state labels now.
- Misleading filename: rename if behavior does not change.
- Clean script: replace with cross-platform Node script, but do not run it.

Remaining future decisions:

- Whether and when to delete generated/dependency folders.
- Whether root one-off artifacts should be moved, tracked, or removed.
- Which later phase owns backend gate enforcement and secrets redesign.

## 8. Verification Plan

- `git status --short --branch`
  - Purpose: inspect baseline and final diff.
  - Artifacts: no.
  - Windows safe: yes.

- `rg -n "â|Â|�|€|™|œ||" README.md docs src .env.example package.json`
  - Purpose: detect remaining mojibake.
  - Artifacts: no.
  - Windows safe: yes.

- `rg -n "SlidersStub" src`
  - Purpose: verify rename.
  - Artifacts: no.
  - Windows safe: yes.

- `rg -n "GraphRAG Query|Vector store|hard gates|hard capability|model OK|production-ready|production ready" src README.md docs`
  - Purpose: detect remaining misleading current-state wording.
  - Artifacts: no.
  - Windows safe: yes.

- `npm run lint`
  - Purpose: TypeScript no-emit check.
  - Artifacts: no intended artifacts.
  - Windows safe: yes.

- `npm test`
  - Purpose: Vitest suite.
  - Artifacts: possible cache.
  - Windows safe: yes; previous sandbox may require elevated rerun if `spawn EPERM`.

- `cargo test --all-features --locked`
  - Purpose: Rust compile/test check.
  - Artifacts: may write under `src-tauri/target/`.
  - Windows safe: yes; approved only if artifact generation is acceptable.

Deferred:

- `npm run clean`
- `npm run build`
- `npm run e2e`
- `npm audit`
- `npm run sbom`
- `npm install`
- `npx` commands

## 9. Phase 0 Completion Checklist

- [ ] Git status works.
- [ ] Baseline commit exists or commit blocker is logged.
- [ ] Generated/dependency folders are ignored or classified.
- [ ] No generated/dependency folder is deleted in this run.
- [ ] One-off root artifacts are not moved or deleted.
- [ ] README and current-state docs qualify GraphRAG/vector/gate/security claims.
- [ ] Sidecar token docs match the Rust-held token boundary.
- [ ] Reviewed mojibake is removed from touched current-state files.
- [ ] `SlidersStub` is renamed or documented as deferred.
- [ ] `package.json` clean script is Windows-safe.
- [ ] Verification commands are run and logged.
- [ ] No Phase 1+ feature work is included.

## 10. Risks and Non-Goals

Risks if skipped:

- Future work proceeds from a non-reviewable repo.
- Generated folders keep polluting audits.
- Docs and UI keep overstating incomplete security and retrieval behavior.
- Windows users keep hitting Unix-only scripts.

Risks during Phase 0:

- Git metadata writes may require elevated filesystem access.
- Text-only truthfulness changes can still affect tests if UI labels are asserted.
- Rust tests may create target artifacts.

Non-goals:

- Real GraphRAG.
- Real vector embeddings.
- Backend gate enforcement.
- Secrets redesign.
- Provider/model routing redesign.
- Browser harness URL policy.
- Audit hash-chain redesign.
- Workspace persistence redesign.
- Rust security tests beyond documenting need.
- SSO, compliance, auto-update, or new agent/tool/browser capabilities.

## 11. Final Recommendation

Approve and complete Phase 0 as a stabilization-only pass. The safest sequence is
baseline first, ignore/classify second, docs and labels third, Windows script
fourth, verification last. Do not delete generated artifacts or start security/
feature work until the owner reviews the implementation log.
