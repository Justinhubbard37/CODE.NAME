import { describe, expect, it } from 'vitest';
import type { ModelInventoryEntry } from '../types';
import {
  MODEL_MENU_LAYER_TARGET,
  MODEL_MENU_VIEWPORT_MARGIN_PX,
  PARAMETER_TRAY_BASE_EXPANDED_WIDTH_REM,
  PARAMETER_TRAY_COLLAPSED_WIDTH_REM,
  PARAMETER_TRAY_EXPANDED_WIDTH_REM,
  boundedParameterTrayWidthPx,
  calculateModelMenuLayout,
  modelMenuItems,
  modelMenuNeedsScroll,
  parameterTrayExpandedWidthCss,
} from './runtimeControlLayout';

function model(id: string): ModelInventoryEntry {
  return {
    id,
    displayName: id,
    executionClass: 'local',
    availability: 'available',
    source: 'configured',
    discoveredAt: 1,
    capabilities: [],
  };
}

describe('runtime control viewport layout', () => {
  it('makes long model menus vertically scrollable within available viewport height', () => {
    const layout = calculateModelMenuLayout(
      { left: 860, right: 1100, bottom: 42 },
      { width: 1200, height: 240 },
    );

    expect(layout.overflowY).toBe('auto');
    expect(modelMenuNeedsScroll(30, layout.maxHeight)).toBe(true);
  });

  it('returns finite viewport-safe model menu bounds', () => {
    const layout = calculateModelMenuLayout(
      { left: 900, right: 1180, bottom: 40 },
      { width: 1200, height: 640 },
    );

    expect(Number.isFinite(layout.left)).toBe(true);
    expect(Number.isFinite(layout.top)).toBe(true);
    expect(Number.isFinite(layout.width)).toBe(true);
    expect(Number.isFinite(layout.maxHeight)).toBe(true);
    expect(layout.left).toBeGreaterThanOrEqual(MODEL_MENU_VIEWPORT_MARGIN_PX);
    expect(layout.top).toBeGreaterThanOrEqual(MODEL_MENU_VIEWPORT_MARGIN_PX);
    expect(layout.left + layout.width).toBeLessThanOrEqual(1200 - MODEL_MENU_VIEWPORT_MARGIN_PX);
    expect(layout.top + layout.maxHeight).toBeLessThanOrEqual(640 - MODEL_MENU_VIEWPORT_MARGIN_PX);
  });

  it('keeps the final model entry in the menu data instead of truncating inventory', () => {
    const models = Array.from({ length: 48 }, (_, index) => model(`model-${index}`));
    const items = modelMenuItems(models);

    expect(items).toHaveLength(48);
    expect(items.at(-1)).toEqual(expect.objectContaining({
      id: 'model-47',
      availability: 'available',
    }));
  });

  it('uses a fixed document-body layer so clipping parents cannot constrain the popup', () => {
    const layout = calculateModelMenuLayout(
      { left: 20, right: 240, bottom: 40 },
      { width: 400, height: 300 },
    );

    expect(MODEL_MENU_LAYER_TARGET).toBe('document.body');
    expect(layout.position).toBe('fixed');
  });

  it('preserves model selection inventory order', () => {
    const models = [model('alpha'), model('beta'), model('gamma')];

    expect(modelMenuItems(models).map((item) => item.id)).toEqual(['alpha', 'beta', 'gamma']);
  });
});

describe('parameter tray sizing', () => {
  it('sets the expanded tray width to the prior baseline multiplied by 1.20', () => {
    expect(PARAMETER_TRAY_BASE_EXPANDED_WIDTH_REM).toBe(18);
    expect(PARAMETER_TRAY_EXPANDED_WIDTH_REM).toBeCloseTo(21.6);
    expect(PARAMETER_TRAY_EXPANDED_WIDTH_REM).toBeCloseTo(PARAMETER_TRAY_BASE_EXPANDED_WIDTH_REM * 1.2);
    expect(parameterTrayExpandedWidthCss()).toBe('min(21.6rem, calc(100vw - 1rem))');
  });

  it('bounds the expanded tray width on narrow viewports', () => {
    expect(boundedParameterTrayWidthPx(320, 16)).toBe(304);
  });

  it('keeps the collapsed tray width unchanged', () => {
    expect(PARAMETER_TRAY_COLLAPSED_WIDTH_REM).toBe(1.5);
  });
});
