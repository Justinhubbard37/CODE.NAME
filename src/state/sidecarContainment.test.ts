import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

describe('sidecar containment source guards', () => {
  it('does not start the sidecar from Tauri setup', () => {
    const libRs = readWorkspaceFile('src-tauri/src/lib.rs');

    expect(libRs).not.toContain('mgr.start(&handle)');
    expect(libRs).toContain('Sidecar launch is explicit-only');
  });

  it('does not poll or restart the sidecar from AppState startup', () => {
    const appState = readWorkspaceFile('src/state/AppState.tsx');

    expect(appState).not.toContain('sidecar_health');
    expect(appState).not.toContain('sidecar_restart');
    expect(appState).not.toContain('setInterval(poll');
  });

  it('does not run sidecar community processing after ingestion', () => {
    const appState = readWorkspaceFile('src/state/AppState.tsx');

    expect(appState).not.toContain('sidecarCommunities');
    expect(appState).not.toContain('communitySummary: comm.summary');
    expect(appState).not.toContain('communities.length');
  });

  it('does not wire browser or pool execution to the sidecar from AppState', () => {
    const appState = readWorkspaceFile('src/state/AppState.tsx');

    expect(appState).not.toContain('sidecarBrowserOpen');
    expect(appState).not.toContain('sidecarPoolCreate');
    expect(appState).not.toContain('sidecarPoolRelease');
    expect(appState).toContain('Browser execution is not connected or bound');
  });

  it('does not passively check sidecar status from self-check', () => {
    const selfcheck = readWorkspaceFile('src/lib/selfcheck.ts');

    expect(selfcheck).not.toContain('getSidecarInfo');
    expect(selfcheck).toContain('no passive startup check');
  });

  it('derives tool display from AppState runtime capability state', () => {
    const appState = readWorkspaceFile('src/state/AppState.tsx');
    const toolsBar = readWorkspaceFile('src/components/right/AgentToolsBar.tsx');
    const chatInput = readWorkspaceFile('src/components/right/ChatInput.tsx');

    expect(appState).toContain('runtimeCapabilities');
    expect(appState).toContain('buildRuntimeCapabilityState');
    expect(toolsBar).toContain('runtimeCapabilities.toolBindings');
    expect(chatInput).toContain('runtimeCapabilities.toolSummary');
    expect(toolsBar).not.toContain('hasActiveToolBindings: false');
    expect(toolsBar).not.toContain('explicitlyAuthorized: false');
    expect(chatInput).not.toContain('activeRequestToolSummary([])');
  });
});
