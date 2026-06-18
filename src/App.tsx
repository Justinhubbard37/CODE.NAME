/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CODE NAME: Agent harness shell.
 * Two-pane governed workspace over a local-first knowledge ecosystem
 * (knowledge graph, graph search, and retrieval scaffolds) with a model-agnostic
 * execution canvas. Built to the OnTheLLow blueprint.
 */
import { useEffect, useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { AppStateProvider } from './state/AppState';
import { ResizableSplit } from './components/layout/ResizableSplit';
import { MissionControl } from './components/left/MissionControl';
import { ExecutionCanvas } from './components/right/ExecutionCanvas';
import { StealthDrawer } from './components/config/StealthDrawer';
import { SettingsScreen } from './components/settings/SettingsScreen';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { SignInScreen } from './auth/SignInScreen';
import { LanguageProvider, useT } from './i18n';

function Shell() {
  const t = useT();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // First-run setup wizard (Phase 12, Slice 12.4). Shown once per profile until
  // completed or skipped; the flag is persisted to localStorage.
  const [onboarded, setOnboarded] = useState(() => {
    try {
      return localStorage.getItem('codename:onboarded:v1') === '1';
    } catch {
      return true; // storage unavailable — don't trap the user behind the wizard
    }
  });
  const finishOnboarding = () => {
    try {
      localStorage.setItem('codename:onboarded:v1', '1');
    } catch {
      /* ignore persistence failure */
    }
    setOnboarded(true);
  };

  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener('codename:open-settings', open);
    return () => window.removeEventListener('codename:open-settings', open);
  }, []);

  // Global keyboard shortcuts (Slice 10.2). Mod = Ctrl (Win/Linux) or Cmd (mac).
  //   Mod+,  → open Settings
  //   Mod+K  → focus the chat input
  // Both use a modifier so they never interfere with plain typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        document.getElementById('chat-input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-neutral-950 text-neutral-300">
      <ResizableSplit left={<MissionControl />} right={<ExecutionCanvas />} />
      <StealthDrawer />

      {/* Settings entry — sits beside the stealth-drawer tab in the corner. */}
      <button
        onClick={() => setSettingsOpen(true)}
        aria-label={`${t('settings.open')} (Ctrl+,)`}
        title={`${t('settings.open')} · Ctrl+,`}
        className="fixed bottom-0 left-6 z-[60] w-7 h-7 flex items-center justify-center bg-neutral-900 border-t border-r border-neutral-700 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-500"
      >
        <SettingsIcon className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}

      {!onboarded && <OnboardingWizard onClose={finishOnboarding} />}

      {/* Screen corner crosshairs (decorative). */}
      <div aria-hidden="true" className="pointer-events-none absolute top-1 left-1 w-3 h-3 border-t border-l border-neutral-800 z-[70]" />
      <div aria-hidden="true" className="pointer-events-none absolute top-1 right-1 w-3 h-3 border-t border-r border-neutral-800 z-[70]" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-1 right-1 w-3 h-3 border-b border-r border-neutral-800 z-[70]" />
    </div>
  );
}

/** Inner component — rendered inside AuthProvider so it can call useAuth(). */
function AppShell() {
  const { currentUser } = useAuth();

  // Show sign-in screen when no user is active (multi-user setup).
  if (!currentUser) return <SignInScreen />;

  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </LanguageProvider>
  );
}
