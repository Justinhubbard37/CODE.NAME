import type { SidecarInfo } from '../lib/sidecar';
import { systemConfig } from './system';

export type SidecarCheckKind = 'success' | 'unavailable' | 'failed';

export interface SidecarCheckResult {
  kind: SidecarCheckKind;
  message: string;
}

export function configuredSidecarEndpoint(): string {
  const bind =
    systemConfig.sidecar.bind === 'ephemeral'
      ? 'ephemeral'
      : String(systemConfig.sidecar.bind);
  return `${systemConfig.sidecar.host}:${bind}`;
}

export function sidecarCheckResult(info: SidecarInfo | null): SidecarCheckResult {
  if (!info) {
    return {
      kind: 'unavailable',
      message: 'Sidecar unavailable in this runtime.',
    };
  }
  if (info.status === 'ready') {
    return {
      kind: 'success',
      message: `Sidecar ready at ${info.host}:${info.port}.`,
    };
  }
  if (info.status === 'error') {
    return {
      kind: 'failed',
      message: `Sidecar failed at ${info.host}:${info.port}.`,
    };
  }
  return {
    kind: 'unavailable',
    message: `Sidecar ${info.status} at ${info.host}:${info.port}.`,
  };
}
