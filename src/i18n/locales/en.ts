/**
 * English message catalogue (Phase 10, Slice 10.3).
 *
 * This is the canonical catalogue: its keys define the `MessageKey` union and
 * every other locale is a `Partial` of it, so a missing translation silently
 * falls back to the English string here. Keep keys sorted by namespace.
 *
 * Interpolation: use `{name}` placeholders and pass `vars` to `t()`.
 */
export const en = {
  // Generic
  'common.done': 'Done',
  'common.close': 'Close',
  'common.on': 'on',
  'common.off': 'off',

  // App chrome
  'app.name': 'CODE NAME',
  'app.tagline': 'Governed agent harness',

  // Settings entry point
  'settings.open': 'Settings',

  // Settings screen
  'settings.title': 'Settings',
  'settings.subtitle': 'One place for models, secrets, gates, and workspace.',
  'settings.section.models': 'Models & routing',
  'settings.section.secrets': 'Secrets',
  'settings.section.gates': 'Capability gates',
  'settings.section.tuning': 'Tuning',
  'settings.section.language': 'Language',
  'settings.section.logs': 'Logs',
  'settings.section.about': 'About',

  'settings.models.preset': 'Preset',
  'settings.models.endpoint': 'Routed endpoint',
  'settings.models.model': 'Model',
  'settings.models.noModels': 'No installed models detected. Start the model server, then re-probe from the status pill.',

  'settings.language.label': 'Interface language',
  'settings.language.help': 'English is always available as a fallback for untranslated text.',

  'settings.logs.view': 'View logs',
  'settings.logs.help': 'Open the local log directory in your file manager.',
  'settings.logs.desktopOnly': 'Logs are available in the desktop app.',

  'settings.about.version': 'Version',
  'settings.about.desc': 'A local-first, two-pane governed workspace over a knowledge graph, GraphRAG, and a vector store, with a model-agnostic execution canvas.',

  // Empty / loading / error states (Slice 10.4)
  'graph.loading': 'Loading knowledge graph…',
  'graph.empty.title': 'Knowledge graph is empty',
  'graph.empty.hint': 'Drop a codebase or document onto this pane to ingest and index it.',
  'graph.noMatch.title': 'No nodes match your query',
  'graph.noMatch.hint': 'Clear the GraphRAG query to show the full graph again.',

  'chat.empty.title': 'Isolated context',
  'chat.empty.hint': 'Awaiting input — send a message to begin.',
  'chat.thinking': 'Working…',

  'tools.empty': 'No tools registered',
} as const;
