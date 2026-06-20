export interface ViewportBox {
  width: number;
  height: number;
}

export interface TriggerBox {
  left: number;
  right: number;
  bottom: number;
}

export interface ModelMenuLayout {
  position: 'fixed';
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  overflowY: 'auto';
}

export const MODEL_MENU_WIDTH_PX = 320;
export const MODEL_MENU_VIEWPORT_MARGIN_PX = 12;
export const MODEL_MENU_TRIGGER_GAP_PX = 4;
export const MODEL_MENU_MIN_HEIGHT_PX = 120;
export const MODEL_MENU_LAYER_TARGET = 'document.body';

export const PARAMETER_TRAY_COLLAPSED_WIDTH_REM = 1.5;
export const PARAMETER_TRAY_BASE_EXPANDED_WIDTH_REM = 18;
export const PARAMETER_TRAY_EXPANDED_WIDTH_REM = Number((PARAMETER_TRAY_BASE_EXPANDED_WIDTH_REM * 1.2).toFixed(1));
export const PARAMETER_TRAY_VIEWPORT_MARGIN_REM = 1;

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function calculateModelMenuLayout(
  trigger: TriggerBox,
  viewport: ViewportBox,
  options: {
    menuWidth?: number;
    margin?: number;
    gap?: number;
    minHeight?: number;
  } = {},
): ModelMenuLayout {
  const margin = finite(options.margin ?? MODEL_MENU_VIEWPORT_MARGIN_PX, MODEL_MENU_VIEWPORT_MARGIN_PX);
  const gap = finite(options.gap ?? MODEL_MENU_TRIGGER_GAP_PX, MODEL_MENU_TRIGGER_GAP_PX);
  const minHeight = finite(options.minHeight ?? MODEL_MENU_MIN_HEIGHT_PX, MODEL_MENU_MIN_HEIGHT_PX);
  const viewportWidth = Math.max(finite(viewport.width, MODEL_MENU_WIDTH_PX + margin * 2), margin * 2 + 1);
  const viewportHeight = Math.max(finite(viewport.height, minHeight + margin * 2), margin * 2 + 1);
  const availableWidth = Math.max(1, viewportWidth - margin * 2);
  const width = Math.min(finite(options.menuWidth ?? MODEL_MENU_WIDTH_PX, MODEL_MENU_WIDTH_PX), availableWidth);

  const preferredTop = finite(trigger.bottom, margin) + gap;
  const top = clamp(preferredTop, margin, viewportHeight - margin - minHeight);
  const maxHeight = Math.max(1, viewportHeight - top - margin);

  const triggerRight = finite(trigger.right, viewportWidth - margin);
  const preferredLeft = triggerRight - width;
  const left = clamp(preferredLeft, margin, viewportWidth - margin - width);

  return {
    position: 'fixed',
    left,
    top,
    width,
    maxHeight,
    overflowY: 'auto',
  };
}

export function modelMenuNeedsScroll(
  itemCount: number,
  maxHeight: number,
  options: {
    headerHeight?: number;
    itemHeight?: number;
    unavailableModelHeight?: number;
  } = {},
) {
  const headerHeight = finite(options.headerHeight ?? 30, 30);
  const itemHeight = finite(options.itemHeight ?? 48, 48);
  const unavailableModelHeight = finite(options.unavailableModelHeight ?? 0, 0);
  const contentHeight = headerHeight + unavailableModelHeight + Math.max(0, itemCount) * itemHeight;
  return contentHeight > maxHeight;
}

export function modelMenuItems<T>(models: readonly T[]) {
  return models;
}

export function parameterTrayExpandedWidthCss() {
  return `min(${PARAMETER_TRAY_EXPANDED_WIDTH_REM}rem, calc(100vw - ${PARAMETER_TRAY_VIEWPORT_MARGIN_REM}rem))`;
}

export function boundedParameterTrayWidthPx(viewportWidthPx: number, rootFontSizePx = 16) {
  const expandedWidthPx = PARAMETER_TRAY_EXPANDED_WIDTH_REM * rootFontSizePx;
  const viewportBoundPx = Math.max(0, viewportWidthPx - PARAMETER_TRAY_VIEWPORT_MARGIN_REM * rootFontSizePx);
  return Math.min(expandedWidthPx, viewportBoundPx);
}
