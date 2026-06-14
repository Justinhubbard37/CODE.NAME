/** A2UI declarative UI payload (Phase 4). Flat component list + root id. */
export interface A2UIComponent {
  id: string;
  type: string;
  properties?: Record<string, unknown>;
  children?: string[];
}

export interface A2UIPayload {
  root: string;
  components: A2UIComponent[];
}

/**
 * Action emitted by A2UI button clicks (Phase 5, Slice 5.2).
 * `values` carries the snapshot of all textfield form state keyed by component id.
 */
export interface A2UIAction {
  prompt?: string;
  tool?: string;
  toolArgs?: Record<string, unknown>;
  /** All textfield values collected at button-click time, keyed by component id. */
  values?: Record<string, string>;
}
