import type { ToolMeta } from './webmcp';

export type CapabilityStatus =
  | 'unavailable'
  | 'policy-blocked'
  | 'not-bound'
  | 'bound';

export interface RuntimeCapabilityState {
  name: string;
  registered: boolean;
  connected: boolean;
  policyAllowed: boolean;
  explicitlyAuthorized: boolean;
  boundToActiveRequest: boolean;
  status: CapabilityStatus;
  statusLabel: string;
  detail: string;
}

export interface RuntimeCapabilityBindingState {
  toolBindings: RuntimeCapabilityState[];
  toolSummary: string;
  hasActiveToolBindings: boolean;
  explicitlyAuthorized: boolean;
}

const knownUnavailableTools: ToolMeta[] = [
  {
    name: 'browser.open',
    description: 'Browser execution is unavailable during Sidecar containment.',
  },
];

const unavailableToolNames = new Set(knownUnavailableTools.map((tool) => tool.name));

function includeKnownUnavailableTools(tools: ToolMeta[]): ToolMeta[] {
  const known = new Set(tools.map((tool) => tool.name));
  const missing = knownUnavailableTools.filter((tool) => !known.has(tool.name));
  return missing.length === 0 ? tools : [...tools, ...missing];
}

export function deriveToolCapabilityStates(
  tools: ToolMeta[],
  options: {
    toolsGateOpen: boolean;
    hasActiveToolBindings: boolean;
    explicitlyAuthorized?: boolean;
  },
): RuntimeCapabilityState[] {
  return tools.map((tool) => {
    const unavailable = unavailableToolNames.has(tool.name);
    const policyAllowed = options.toolsGateOpen;
    const explicitlyAuthorized = options.explicitlyAuthorized === true;
    const boundToActiveRequest =
      !unavailable && policyAllowed && explicitlyAuthorized && options.hasActiveToolBindings;
    const connected = !unavailable;

    if (unavailable) {
      return {
        name: tool.name,
        registered: true,
        connected: false,
        policyAllowed,
        explicitlyAuthorized,
        boundToActiveRequest: false,
        status: 'unavailable',
        statusLabel: 'Unavailable',
        detail: 'Registered scaffold; no connected runtime.',
      };
    }

    if (!policyAllowed) {
      return {
        name: tool.name,
        registered: true,
        connected,
        policyAllowed,
        explicitlyAuthorized,
        boundToActiveRequest: false,
        status: 'policy-blocked',
        statusLabel: 'Policy blocked',
        detail: 'Tools gate is closed.',
      };
    }

    if (!boundToActiveRequest) {
      return {
        name: tool.name,
        registered: true,
        connected,
        policyAllowed,
        explicitlyAuthorized,
        boundToActiveRequest: false,
        status: 'not-bound',
        statusLabel: 'Not bound',
        detail: 'No tool definitions are attached to the active model request.',
      };
    }

    return {
      name: tool.name,
      registered: true,
      connected,
      policyAllowed,
      explicitlyAuthorized,
      boundToActiveRequest,
      status: 'bound',
      statusLabel: 'Bound',
      detail: 'Tool definitions are attached to the active model request.',
    };
  });
}

export function activeRequestToolSummary(states: RuntimeCapabilityState[]): string {
  return states.some((state) => state.boundToActiveRequest)
    ? 'TOOL-ENABLED'
    : 'TEXT-ONLY';
}

export function buildRuntimeCapabilityState(
  tools: ToolMeta[],
  options: {
    toolsGateOpen: boolean;
    hasActiveToolBindings: boolean;
    explicitlyAuthorized?: boolean;
  },
): RuntimeCapabilityBindingState {
  const toolBindings = deriveToolCapabilityStates(includeKnownUnavailableTools(tools), options);
  return {
    toolBindings,
    toolSummary: activeRequestToolSummary(toolBindings),
    hasActiveToolBindings: options.hasActiveToolBindings,
    explicitlyAuthorized: options.explicitlyAuthorized === true,
  };
}
