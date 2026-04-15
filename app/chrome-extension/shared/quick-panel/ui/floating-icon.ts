/**
 * Floating App Icon for Quick Panel
 *
 * A round, draggable floating button that appears at the bottom right of web pages.
 * Clicking it opens the Quick Panel AI Chat interface.
 * Features beautiful motion flow with spring animations.
 */

import { QUICK_PANEL_STYLES } from './styles';

// ============================================================
// Types
// ============================================================

export interface FloatingIconOptions {
  /** Initial position from bottom (px). Default: 24 */
  initialBottom?: number;
  /** Initial position from right (px). Default: 24 */
  initialRight?: number;
  /** Initial size in px (overrides compile-time default). */
  size?: number;
  /** Callback when icon is clicked */
  onClick?: () => void;
  /** Callback when icon is dragged to new position */
  onPositionChange?: (position: { bottom: number; right: number }) => void;
}

export type FloatingIconWorkflowStatus = 'running' | 'paused';

export interface FloatingIconWorkflowProgress {
  runId: string;
  platform?: string;
  status: FloatingIconWorkflowStatus;
  percent: number;
  finished: number;
  total: number | null;
  elapsedMs: number;
  estimatedTotalMs: number | null;
}

export interface FloatingIconWorkflowControls {
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}

export interface FloatingIconTooltipState {
  /** When null/empty, hide the “Save {Platform} Chat” chip. */
  platformLabel?: string | null;
  /** Persist toggle state. */
  persistEnabled: boolean;
  /** Current session engine (internal id like "claude"). */
  engineName?: string | null;
  /** Current session engine display name (e.g. "Claude Code"). */
  engineDisplayName?: string | null;
  /** Switch engine for the current session (ephemeral sessions only). */
  onSetEngine?: (engineName: string) => void;
  onSaveChat?: () => void;
  onTogglePersist?: (nextEnabled: boolean) => void;
  onNewQuickChat?: () => void;
}

export interface FloatingIconDialogOptions {
  title: string;
  message: string;
  kind?: 'error' | 'info';
}

export interface FloatingIconManager {
  /** Show the floating icon */
  show: () => void;
  /** Hide the floating icon */
  hide: () => void;
  /** Toggle visibility */
  toggle: () => void;
  /** Check if visible */
  isVisible: () => boolean;
  /**
   * Get internal DOM elements for composition.
   * Returns nulls before `show()` creates the Shadow DOM.
   */
  getElements: () => {
    host: HTMLElement | null;
    shadowRoot: ShadowRoot | null;
    container: HTMLElement | null;
    icon: HTMLElement | null;
  };
  /** Get current position */
  getPosition: () => { bottom: number; right: number };
  /** Set position programmatically */
  setPosition: (position: { bottom: number; right: number }) => void;
  /** Pulse animation to draw attention */
  pulse: () => void;
  /** Update the icon size at runtime (px) */
  setSize: (size: number) => void;
  /**
   * Set workflow progress UI state (null to disable).
   * Intended for RR-V3 “Import All” workflows.
   */
  setWorkflowProgress: (progress: FloatingIconWorkflowProgress | null) => void;
  /**
   * Set handlers for workflow controls (pause/resume/stop).
   * Only used when workflow progress is active.
   */
  setWorkflowControls: (controls: FloatingIconWorkflowControls | null) => void;
  /** Configure hover tooltip quick actions (null to disable actions). */
  setTooltipState: (state: FloatingIconTooltipState | null) => void;
  /** Show a lightweight dialog anchored to the icon. */
  showDialog: (options: FloatingIconDialogOptions) => void;
  /** Hide the dialog (if any). */
  hideDialog: () => void;
  /** Dispose and remove from DOM */
  dispose: () => void;
}

// ============================================================
// Constants
// ============================================================

export const DEFAULT_FLOATING_ICON_SIZE = 96;
const ICON_SIZE = DEFAULT_FLOATING_ICON_SIZE;
const DRAG_THRESHOLD = 5;
const SPRITE_SHEET_PUBLIC_PATH = 'icon/logo-spritesheet.png';
const SPRITE_SHEET_COLS = 6;
const SPRITE_SHEET_ROWS = 5;
const SPRITE_SHEET_TOTAL_FRAMES = 6 * 4 + 4;
const SPRITE_SHEET_FPS = 36;

// ============================================================
// Styles
// ============================================================

const FLOATING_ICON_STYLES = /* css */ `
  ${QUICK_PANEL_STYLES}

  :host {
    all: initial;
  }

  .floating-icon-container {
    position: fixed;
    z-index: 2147483646;
    pointer-events: none;
    font-family: var(--ac-font-body, ui-sans-serif, system-ui);
  }

  .floating-icon {
    width: ${ICON_SIZE}px;
    height: ${ICON_SIZE}px;
    flex-shrink: 0;
    position: relative;
    border-radius: 50%;
    /* Rich charcoal background to make the golden logo pop like the reference image */
    background: linear-gradient(145deg, #2a2622 0%, #171513 100%);
    border: 1px solid rgba(255, 200, 100, 0.15);
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.4),
      0 2px 8px rgba(0, 0, 0, 0.3),
      inset 0 1px 2px rgba(255, 255, 255, 0.05);
    /* Majestic Golden Yellow */
    color: #e5a93d; 
    cursor: grab;
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 0.4s ease,
      border-color 0.4s ease,
      opacity 0.2s ease;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }

  .floating-icon.workflow-active {
    cursor: default;
  }

  .floating-icon:hover {
    transform: scale(1.08) translateY(-4px);
    background: linear-gradient(145deg, #322d28 0%, #1e1b18 100%);
    border-color: rgba(229, 169, 61, 0.4);
    box-shadow:
      0 12px 32px rgba(229, 169, 61, 0.15),
      0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .floating-icon:hover .floating-icon-em-field {
    opacity: 1;
  }

  .floating-icon:hover .floating-icon-em-field::before {
    animation-duration: 5.9s;
  }

  .floating-icon:hover .floating-icon-em-field::after {
    opacity: 0.3;
  }

  .floating-icon:hover .floating-icon-aura {
    filter:
      drop-shadow(0 0 12px rgba(72, 245, 255, 0.26))
      drop-shadow(0 0 34px rgba(72, 245, 255, 0.12));
  }

  /* When tooltip is open, avoid translateY hover shift (can cause “open then close” flicker). */
  .floating-icon.tooltip-open:hover {
    transform: scale(1.08);
  }

  .floating-icon:active,
  .floating-icon.dragging {
    cursor: grabbing;
    transform: scale(0.95);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.5),
      0 1px 4px rgba(0, 0, 0, 0.4);
  }

  .floating-icon.dragging {
    transition: none;
  }

  /* Entrance animation */
  @keyframes icon-entrance {
    0% {
      opacity: 0;
      transform: scale(0.5) translateY(12px);
    }
    60% {
      opacity: 1;
      transform: scale(1.05) translateY(-2px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .floating-icon.entering {
    animation: icon-entrance 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  /* Exit animation */
  @keyframes icon-exit {
    0% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
    100% {
      opacity: 0;
      transform: scale(0.5) translateY(12px);
    }
  }

  .floating-icon.exiting {
    animation: icon-exit 0.3s cubic-bezier(0.4, 0, 1, 1) forwards;
    pointer-events: none;
  }

  /* Pulse animation for attention */
  @keyframes icon-pulse {
    0%, 100% {
      box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.06),
        0 1px 4px rgba(0, 0, 0, 0.04),
        0 0 0 0 rgba(217, 119, 87, 0.2);
    }
    50% {
      box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.06),
        0 1px 4px rgba(0, 0, 0, 0.04),
        0 0 0 10px rgba(217, 119, 87, 0);
    }
  }

  .floating-icon.pulsing {
    animation: icon-pulse 1.5s ease-in-out infinite;
  }

  /* Gentle float idle animation */
  @keyframes icon-float {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-3px);
    }
  }

  .floating-icon.breathing {
    animation: icon-float 3s ease-in-out infinite;
  }

  /* Ripple effect on click */
  .floating-icon-ripple {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transform: scale(0);
    opacity: 0;
    pointer-events: none;
  }

  @keyframes ripple-effect {
    0% {
      transform: scale(0);
      opacity: 0.6;
    }
    100% {
      transform: scale(2.5);
      opacity: 0;
    }
  }

  .floating-icon-ripple.active {
    animation: ripple-effect 0.5s ease-out forwards;
  }

  /* Icon art (Aura + Sprite Sheet) */
  .floating-icon-art {
    /* Maximize visible sprite size inside the circular button while keeping a small padding. */
    width: calc(100% - 12px);
    height: calc(100% - 12px);
    position: relative;
    transition: opacity 0.24s ease, transform 0.28s cubic-bezier(0.2, 0.9, 0.2, 1);
  }

  /* Electromagnetic background field (behind aura + sprite) */
  .floating-icon-em-field {
    position: absolute;
    inset: -14px;
    pointer-events: none;
    border-radius: 999px;
    opacity: 0.9;
    mix-blend-mode: screen;
    will-change: transform, opacity;
  }

  .floating-icon-em-field::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background:
      radial-gradient(
        circle at 50% 45%,
        rgba(72, 245, 255, 0.26) 0%,
        rgba(72, 245, 255, 0.12) 24%,
        rgba(72, 245, 255, 0.04) 42%,
        transparent 68%
      ),
      conic-gradient(
        from 20deg,
        transparent 0deg,
        rgba(72, 245, 255, 0.16) 42deg,
        transparent 92deg,
        rgba(229, 169, 61, 0.12) 138deg,
        transparent 206deg,
        rgba(72, 245, 255, 0.14) 268deg,
        transparent 360deg
      );
    filter: blur(10px) saturate(1.15);
    animation: em-field-rotate 7.2s linear infinite;
  }

  .floating-icon-em-field::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background:
      radial-gradient(
        circle at 50% 50%,
        rgba(72, 245, 255, 0.08) 0%,
        transparent 52%,
        rgba(72, 245, 255, 0.10) 64%,
        transparent 74%
      ),
      repeating-linear-gradient(
        90deg,
        rgba(72, 245, 255, 0.0) 0px,
        rgba(72, 245, 255, 0.0) 10px,
        rgba(72, 245, 255, 0.10) 14px,
        rgba(72, 245, 255, 0.0) 20px
      );
    opacity: 0.22;
    filter: blur(0.5px);
    animation: em-field-scan 2.9s ease-in-out infinite;
  }

  @keyframes em-field-rotate {
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes em-field-scan {
    0%, 100% {
      opacity: 0.18;
      transform: rotate(-6deg) translateY(0px);
    }
    55% {
      opacity: 0.28;
      transform: rotate(9deg) translateY(-1px);
    }
  }

  .floating-icon-aura {
    position: absolute;
    /* Slightly larger than the sprite so it reads as a background halo. */
    inset: -10px;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.95;
    color: rgba(72, 245, 255, 0.92);
    filter:
      drop-shadow(0 0 10px rgba(72, 245, 255, 0.18))
      drop-shadow(0 0 26px rgba(72, 245, 255, 0.10));
  }

  .floating-icon-aura svg {
    width: 100%;
    height: 100%;
  }

  .floating-icon-sprite {
    width: 100%;
    height: 100%;
    background-image: var(--ruminer-sprite-url);
    background-repeat: no-repeat;
    background-size: ${SPRITE_SHEET_COLS * 100}% ${SPRITE_SHEET_ROWS * 100}%;
    background-position: 0% 0%;
    transform: translateY(5%);
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
    will-change: transform, background-position;
  }

  .floating-icon.workflow-active .floating-icon-art {
    opacity: 0.14;
    transform: scale(0.98);
  }

  /* Workflow progress ring + center text */
  .floating-icon-progress {
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .floating-icon.workflow-active .floating-icon-progress {
    display: flex;
  }

  .floating-icon-progress-ring {
    position: absolute;
    inset: -2px;
  }

  .floating-icon-progress-ring svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .floating-icon-progress-ring .ring-bg {
    stroke: rgba(255, 200, 100, 0.14);
  }

  .floating-icon-progress-ring .ring-fg {
    stroke: rgba(229, 169, 61, 0.95);
    transition: stroke-dashoffset 0.2s ease;
  }

  .floating-icon-progress-text {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1.05;
    text-align: center;
    width: 100%;
    height: 100%;
    padding: 10px;
    color: #f5e6d3;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7);
    transition: opacity 140ms ease, transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  /* On hover, replace progress text with control buttons (inside the icon). */
  .floating-icon.workflow-active:hover .floating-icon-progress-text {
    opacity: 0;
    transform: scale(0.95);
  }

  .floating-icon-progress-count {
    font-size: 8px;
    font-weight: 600;
    margin-bottom: 3px;
    opacity: 0.9;
  }

  .floating-icon-progress-percent {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .floating-icon-progress-time {
    font-size: 7px;
    font-weight: 500;
    margin-top: 3px;
    opacity: 0.9;
  }

  /* Workflow hover controls */
  .floating-icon-workflow-controls {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) scale(0.92);
    display: none;
    gap: 4px;
    align-items: center;
    justify-content: center;
    padding: 0px;
    border-radius: 0px;
    background: transparent;
    border: none;
    box-shadow: none;
    pointer-events: none;
    opacity: 0;
    transition:
      opacity 140ms ease,
      transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .floating-icon.workflow-active .floating-icon-workflow-controls {
    display: flex;
  }

  .floating-icon.workflow-active:hover .floating-icon-workflow-controls {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
    pointer-events: auto;
  }

  .floating-icon-workflow-button {
    width: 24px;
    height: 24px;
    border-radius: 99px;
    border: 1px solid currentColor;
    background: transparent;
    --ruminer-workflow-icon-size: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.15s ease, filter 0.15s ease, opacity 0.15s ease;
  }

  .floating-icon-workflow-button:hover {
    transform: translateY(-1px);
    filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.55));
  }

  .floating-icon-workflow-button:active {
    transform: translateY(0);
  }

  .floating-icon-workflow-button[disabled] {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .floating-icon-workflow-button svg {
    width: var(--ruminer-workflow-icon-size);
    height: var(--ruminer-workflow-icon-size);
    fill: currentColor;
    display: block;
  }

  .floating-icon-workflow-button[data-mode='pause'] {
    color: #e5a93d;
  }

  .floating-icon-workflow-button[data-mode='resume'] {
    color: #22c55e;
  }

  .floating-icon-workflow-button[data-mode='stop'] {
    color: #ef4444;
  }

  /* -- Aura Animations -- */
  .aura-spin-slow,
  .aura-spin-fast {
    transform-origin: 50% 50%;
    animation-name: aura-spin;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
  }

  .aura-spin-slow {
    animation-duration: 22s;
  }

  .aura-spin-fast {
    animation-duration: 12s;
    animation-direction: reverse;
  }

  @keyframes aura-spin {
    100% {
      transform: rotate(360deg);
    }
  }

  .aura-dash {
    stroke-dasharray: 8 10;
    stroke-dashoffset: 0;
    animation: aura-dash-flow 2.8s linear infinite;
  }

  @keyframes aura-dash-flow {
    to {
      stroke-dashoffset: -72;
    }
  }

  .aura-arc {
    transform-origin: 50% 50%;
    animation: aura-arc-flicker 2.4s ease-in-out infinite;
  }

  @keyframes aura-arc-flicker {
    0%, 100% {
      opacity: 0.10;
      stroke-width: 0.8;
    }
    18% {
      opacity: 0.52;
      stroke-width: 1.25;
    }
    42% {
      opacity: 0.16;
      stroke-width: 0.75;
    }
    66% {
      opacity: 0.72;
      stroke-width: 1.35;
    }
  }

  .aura-spark {
    transform-box: fill-box;
    transform-origin: center;
    animation: aura-spark-pop 1.9s ease-in-out infinite;
  }

  @keyframes aura-spark-pop {
    0%, 100% {
      opacity: 0.18;
      transform: scale(0.85);
    }
    40% {
      opacity: 0.85;
      transform: scale(1.12);
    }
    70% {
      opacity: 0.32;
      transform: scale(0.95);
    }
  }

  .aura-accent {
    stroke: rgba(229, 169, 61, 0.55);
  }

  /* Tooltip (interactive quick actions; vertical list; one item per row) */
  .floating-icon-tooltip {
    --ruminer-tooltip-count: 1;
    --ruminer-tooltip-stagger-open: 36ms;
    --ruminer-tooltip-stagger-close: 28ms;
    position: absolute;
    bottom: calc(100% + 10px);
    right: 0;
    width: min(180px, calc(100vw - 36px));
    padding: 0;
    background: transparent;
    border: none;
    box-shadow: none;
    color: rgba(245, 230, 211, 0.95);
    opacity: 0;
    transform: translateY(10px) scale(0.98);
    pointer-events: none;
    transition:
      opacity 0.2s ease,
      transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    z-index: 1;
  }

  .floating-icon-tooltip[data-open='true'] {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .floating-icon-tooltip[data-anim='closing'] {
    /* Keep capturing pointer events while closing to avoid click-through onto the icon. */
    pointer-events: auto;
  }

  /* Prevent a “flash” when we toggle data-open off after the row close stagger. */
  .floating-icon-tooltip[data-open='false'] .floating-icon-tooltip-row {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
    filter: blur(1.5px);
    pointer-events: none;
  }

  /* Hover-bridge region between icon and tooltip to prevent flicker on fast mouse moves */
  .floating-icon-tooltip::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    /* Match the gap introduced by bottom: calc(100% + 10px) */
    bottom: -10px;
    height: 10px;
    background: transparent;
  }

  .floating-icon-tooltip-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
  }

  @keyframes tooltip-item-in {
    0% {
      opacity: 0;
      transform: translateY(10px) scale(0.985);
      filter: blur(2px);
    }
    70% {
      opacity: 1;
      transform: translateY(-1px) scale(1.01);
      filter: blur(0px);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: blur(0px);
    }
  }

  @keyframes tooltip-item-out {
    0% {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: blur(0px);
    }
    100% {
      opacity: 0;
      transform: translateY(10px) scale(0.985);
      filter: blur(1.5px);
    }
  }

  /* Base row style: revert to the pre-action tooltip pill aesthetic */
  .floating-icon-tooltip-row {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    border: 1px solid rgba(255, 200, 100, 0.15);
    border-radius: 99px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    font-size: 12px;
    letter-spacing: 0.15px;
    line-height: 1.25;
    color: #f5e6d3;
    white-space: nowrap;
    will-change: transform, opacity, filter;
  }

  .floating-icon-tooltip[data-anim='opening'] .floating-icon-tooltip-row {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
    filter: blur(2px);
    pointer-events: none;
    animation: tooltip-item-in 240ms cubic-bezier(0.2, 0.95, 0.2, 1) both;
    animation-delay: calc(var(--i, 0) * var(--ruminer-tooltip-stagger-open));
  }

  .floating-icon-tooltip[data-anim='closing'] .floating-icon-tooltip-row {
    pointer-events: none;
    animation: tooltip-item-out 200ms cubic-bezier(0.4, 0, 1, 1) both;
    animation-delay: calc(
      (var(--ruminer-tooltip-count) - 1 - var(--i, 0)) * var(--ruminer-tooltip-stagger-close)
    );
  }

  .floating-icon-tooltip-row--greeting {
    width: fit-content;
    padding: 8px 12px;
    cursor: default;
    background: rgb(30, 27, 24, 0.95);
    user-select: none;
    -webkit-user-select: none;
    font-weight: 500;
  }

  .floating-icon-tooltip-row--action {
    width: 180px;
    max-width: 180px;
    padding: 4px 4px;
    background: rgba(30, 27, 24, 0.85);
    font-weight: 450;
    overflow: hidden;
  }

  .floating-icon-tooltip-action {
    appearance: none;
    cursor: pointer;
    text-align: left;
    color: #f5e6d3;
    transition:
      transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1),
      border-color 180ms ease,
      box-shadow 220ms ease,
      filter 220ms ease;
  }

  .floating-icon-tooltip-action:hover {
    transform: translateY(-1px);
    border-color: rgba(229, 169, 61, 0.38);
    box-shadow:
      0 18px 54px rgba(0, 0, 0, 0.36),
      0 0 0 4px rgba(229, 169, 61, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .floating-icon-tooltip-action:active {
    transform: translateY(0) scale(0.99);
    filter: brightness(0.985);
  }

  .floating-icon-tooltip-action[disabled] {
    opacity: 0.55;
    cursor: default;
    filter: saturate(0.85);
  }

  .floating-icon-tooltip-action-icon {
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--ruminer-action-icon, rgba(229, 169, 61, 0.96));
    flex-shrink: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .floating-icon-tooltip-action-label {
    flex: 1;
    user-select: none;
    -webkit-user-select: none;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .floating-icon-tooltip-action--save {
    --ruminer-action-icon: rgb(255, 175, 56);
  }

  .floating-icon-tooltip-action--persist {
    --ruminer-action-icon: rgb(203, 205, 210);
  }

  .floating-icon-tooltip-action--persist[data-enabled='true'] {
    /* Only change icon color when enabled */
    --ruminer-action-icon: rgb(84, 254, 41);
  }

  .floating-icon-tooltip-action--new {
    --ruminer-action-icon: rgb(57, 239, 239);
  }

  .floating-icon-tooltip-action--engine {
    --ruminer-action-icon: rgba(229, 169, 61, 0.96);
  }

  .floating-icon-tooltip-action-suffix {
    flex-shrink: 0;
    opacity: 0.7;
    margin-left: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* Engine flyout submenu (opens to the left of the Engine row) */
  .floating-icon-tooltip-flyout {
    position: absolute;
    right: calc(100% + 10px);
    top: 0;
    width: min(180px, calc(100vw - 36px));
    padding: 8px;
    background: linear-gradient(145deg, rgba(30, 27, 24, 0.96), rgba(18, 16, 14, 0.92));
    border: 1px solid rgba(255, 200, 100, 0.18);
    border-radius: 16px;
    box-shadow:
      0 22px 60px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    opacity: 0;
    transform: translateX(10px) scale(0.985);
    pointer-events: none;
    transition:
      opacity 180ms ease,
      transform 220ms cubic-bezier(0.2, 0.9, 0.2, 1);
    z-index: 2;
  }

  .floating-icon-tooltip-flyout[data-open='true'] {
    opacity: 1;
    transform: translateX(0) scale(1);
    pointer-events: auto;
  }

  .floating-icon-tooltip-flyout-title {
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 248, 240, 0.86);
    letter-spacing: 0.14px;
    padding: 2px 6px 8px 6px;
    user-select: none;
    -webkit-user-select: none;
  }

  .floating-icon-tooltip-flyout-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .floating-icon-tooltip-flyout-item {
    appearance: none;
    cursor: pointer;
    border: 1px solid rgba(255, 200, 100, 0.14);
    background: rgba(255, 255, 255, 0.03);
    border-radius: 12px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: rgba(245, 230, 211, 0.95);
    font-size: 12px;
    font-weight: 520;
    letter-spacing: 0.15px;
    transition:
      transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1),
      border-color 160ms ease,
      background 180ms ease,
      box-shadow 220ms ease;
    text-align: left;
  }

  .floating-icon-tooltip-flyout-item:hover {
    transform: translateY(-1px);
    border-color: rgba(229, 169, 61, 0.38);
    background: rgba(229, 169, 61, 0.08);
    box-shadow:
      0 18px 54px rgba(0, 0, 0, 0.32),
      0 0 0 4px rgba(229, 169, 61, 0.06);
  }

  .floating-icon-tooltip-flyout-item:active {
    transform: translateY(0) scale(0.99);
  }

  .floating-icon-tooltip-flyout-item[disabled] {
    opacity: 0.55;
    cursor: default;
    filter: saturate(0.85);
  }

  .floating-icon-tooltip-flyout-item-check {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0;
    color: rgba(229, 169, 61, 0.96);
  }

  .floating-icon-tooltip-flyout-item[data-active='true'] .floating-icon-tooltip-flyout-item-check {
    opacity: 1;
  }

  .floating-icon-tooltip-flyout-item-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Dialog (anchored, non-blocking) */
  .floating-icon-dialog {
    position: absolute;
    bottom: calc(100% + 14px);
    right: 0;
    width: min(420px, calc(100vw - 36px));
    padding: 12px 12px 10px 12px;
    background: linear-gradient(145deg, rgba(30, 27, 24, 0.98), rgba(18, 16, 14, 0.92));
    border: 1px solid rgba(255, 200, 100, 0.18);
    border-radius: 16px;
    box-shadow:
      0 22px 60px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    opacity: 0;
    transform: translateY(12px) scale(0.98);
    pointer-events: none;
    transition:
      opacity 200ms ease,
      transform 200ms cubic-bezier(0.2, 0.9, 0.2, 1);
    z-index: 2;
  }

  .floating-icon-dialog[data-visible='true'] {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .floating-icon-dialog-title {
    font-size: 13px;
    font-weight: 750;
    color: rgba(255, 248, 240, 0.96);
    letter-spacing: 0.15px;
  }

  .floating-icon-dialog-message {
    margin-top: 8px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.4;
    color: rgba(255, 248, 240, 0.86);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .floating-icon-dialog-actions {
    margin-top: 10px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .floating-icon-dialog-btn {
    appearance: none;
    border: 1px solid rgba(255, 200, 100, 0.18);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 248, 240, 0.92);
    border-radius: 999px;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
    transition:
      transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1),
      background 160ms ease,
      border-color 160ms ease;
  }

  .floating-icon-dialog-btn:hover {
    transform: translateY(-1px);
    border-color: rgba(229, 169, 61, 0.34);
    background: rgba(255, 255, 255, 0.06);
  }

  .floating-icon-dialog-btn:active {
    transform: translateY(0) scale(0.98);
  }

  /* Reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .floating-icon, .floating-icon:hover, .floating-icon-art,
    .floating-icon-em-field, .floating-icon-aura, .floating-icon-sprite,
    .aura-spin-slow, .aura-spin-fast, .aura-dash, .aura-arc, .aura-spark,
    .floating-icon-tooltip, .floating-icon-tooltip-row, .floating-icon-tooltip-action {
      transition: none !important;
      animation: none !important;
    }
  }
`;

// ============================================================
// Icon Art (Aura SVG + Sprite Sheet)
// ============================================================

const RUMINER_ICON_HTML = /* html */ `
  <div class="floating-icon-art" aria-hidden="true">
    <div class="floating-icon-em-field" aria-hidden="true"></div>
    <div class="floating-icon-aura" aria-hidden="true">
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <g stroke="currentColor" fill="none" stroke-linecap="round">
          <g class="aura-spin-slow" stroke-width="0.9">
            <circle class="aura-dash" cx="50" cy="50" r="44" opacity="0.18" />
            <circle cx="50" cy="50" r="38" opacity="0.10" />
            <circle class="aura-accent aura-dash" cx="50" cy="50" r="46" opacity="0.08" />
          </g>

          <g class="aura-spin-fast" stroke-width="1.05" opacity="0.55">
            <path class="aura-arc" d="M 50 6 A 44 44 0 0 1 85 22" style="animation-delay: -0.6s" />
            <path class="aura-arc" d="M 94 50 A 44 44 0 0 1 78 84" style="animation-delay: -1.4s" />
            <path class="aura-arc" d="M 50 94 A 44 44 0 0 1 16 78" style="animation-delay: -0.2s" />
            <path class="aura-arc" d="M 6 50 A 44 44 0 0 1 22 16" style="animation-delay: -1.0s" />
          </g>

          <g class="aura-spin-slow" stroke-width="0.95" opacity="0.35">
            <path class="aura-arc" d="M 12 56 C 5 60 6 76 24 84" style="animation-delay: -0.8s" />
            <path class="aura-arc" d="M 88 56 C 95 60 94 76 76 84" style="animation-delay: -1.2s" />
            <path class="aura-arc" d="M 18 44 C 6 50 6 60 12 68" style="animation-delay: -0.3s" />
            <path class="aura-arc" d="M 82 44 C 94 50 94 60 88 68" style="animation-delay: -1.6s" />
          </g>
        </g>

        <g fill="currentColor" stroke="none">
          <circle class="aura-spark" cx="14" cy="44" r="1.5" style="animation-delay: -0.2s" />
          <circle class="aura-spark" cx="10" cy="58" r="1.0" style="animation-delay: -1.0s" />
          <circle class="aura-spark" cx="21" cy="72" r="1.4" style="animation-delay: -1.4s" />
          <circle class="aura-spark" cx="29" cy="85" r="1.0" style="animation-delay: -0.6s" />
          <circle class="aura-spark" cx="86" cy="44" r="1.5" style="animation-delay: -1.2s" />
          <circle class="aura-spark" cx="90" cy="58" r="1.0" style="animation-delay: -0.4s" />
          <circle class="aura-spark" cx="79" cy="72" r="1.4" style="animation-delay: -1.6s" />
          <circle class="aura-spark" cx="71" cy="85" r="1.0" style="animation-delay: -0.9s" />
        </g>
      </svg>
    </div>
    <div class="floating-icon-sprite" aria-hidden="true"></div>
  </div>
`;

// ============================================================
// Helper Functions
// ============================================================

function loadSavedPosition(): { bottom: number; right: number } | null {
  try {
    const saved = localStorage.getItem('ruminer_floating_icon_position');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function savePosition(position: { bottom: number; right: number }): void {
  try {
    localStorage.setItem('ruminer_floating_icon_position', JSON.stringify(position));
  } catch {
    // Ignore storage errors
  }
}

function formatDurationShort(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function createSvgIcon(paths: string[]): string {
  const ps = (Array.isArray(paths) ? paths : []).map(
    (d) =>
      `<path d="${d}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`,
  );
  return /* html */ `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
      ${ps.join('')}
    </svg>
  `;
}

// Lucide-style icons (inline SVG)
const ICON_DOWNLOAD = createSvgIcon([
  'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
  'M7 10l5 5 5-5',
  'M12 15V3',
]);
const ICON_PIN = createSvgIcon(['M12 17v5', 'M9 3h6l1 7 2 2v2H6v-2l2-2 1-7z']);
const ICON_PIN_OFF = createSvgIcon(['M12 17v5', 'M9 3h6l1 7 2 2v2H6v-2l2-2 1-7z', 'M3 3l18 18']);
const ICON_PLUS = createSvgIcon(['M12 5v14', 'M5 12h14']);
const ICON_CPU = createSvgIcon([
  'M4 4h16v16H4z',
  'M9 9h6v6H9z',
  'M9 1v3',
  'M15 1v3',
  'M9 20v3',
  'M15 20v3',
  'M1 9h3',
  'M1 15h3',
  'M20 9h3',
  'M20 15h3',
]);
const ICON_CHEVRON_LEFT = createSvgIcon(['M15 18l-6-6 6-6']);
const ICON_CHECK = createSvgIcon(['M20 6L9 17l-5-5']);

const ENGINE_CHOICES: Array<{ engineName: string; label: string }> = [
  { engineName: 'claude', label: 'Claude Code' },
  { engineName: 'openclaw', label: 'OpenClaw' },
  { engineName: 'codex', label: 'Codex CLI' },
];

// ============================================================
// Main Factory
// ============================================================

export function createFloatingIcon(options: FloatingIconOptions = {}): FloatingIconManager {
  let hostElement: HTMLElement | null = null;
  let shadowRoot: ShadowRoot | null = null;
  let containerElement: HTMLElement | null = null;
  let iconElement: HTMLElement | null = null;
  let spriteElement: HTMLElement | null = null;
  let tooltipElement: HTMLElement | null = null;
  let tooltipGreetingElement: HTMLElement | null = null;
  let tooltipListElement: HTMLElement | null = null;
  let tooltipEngineChip: HTMLButtonElement | null = null;
  let tooltipSaveChip: HTMLButtonElement | null = null;
  let tooltipPersistChip: HTMLButtonElement | null = null;
  let tooltipNewChip: HTMLButtonElement | null = null;
  let tooltipState: FloatingIconTooltipState | null = null;
  let tooltipOpen = false;
  let tooltipAnimationTimer: ReturnType<typeof setTimeout> | null = null;
  let tooltipCloseTimer: ReturnType<typeof setTimeout> | null = null;

  let engineFlyoutElement: HTMLElement | null = null;
  let engineFlyoutListElement: HTMLElement | null = null;
  let engineFlyoutOpen = false;

  let dialogElement: HTMLElement | null = null;
  let dialogTitleElement: HTMLElement | null = null;
  let dialogMessageElement: HTMLElement | null = null;
  let dialogOkButton: HTMLButtonElement | null = null;
  let rippleElement: HTMLElement | null = null;

  let workflowProgress: FloatingIconWorkflowProgress | null = null;
  let workflowControls: FloatingIconWorkflowControls | null = null;

  // runtime size (px) — allow overriding the compile-time `ICON_SIZE` constant
  let iconSize =
    typeof options.size === 'number' && !Number.isNaN(options.size) ? options.size : ICON_SIZE;

  let progressOverlayElement: HTMLElement | null = null;
  let progressTimeElement: HTMLElement | null = null;
  let progressPercentElement: HTMLElement | null = null;
  let progressCountElement: HTMLElement | null = null;
  let progressRingFg: SVGCircleElement | null = null;

  let workflowControlsElement: HTMLElement | null = null;
  let pauseResumeButton: HTMLButtonElement | null = null;
  let stopButton: HTMLButtonElement | null = null;

  let isVisible = false;
  let isHiding = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let isDragging = false;
  let hasDragged = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let currentBottom = options.initialBottom ?? 24;
  let currentRight = options.initialRight ?? 24;
  let hostObserver: MutationObserver | null = null;

  let spriteFrameIndex = 0;
  let spriteAnimationRaf: number | null = null;
  let spriteAnimationLastTs: number | null = null;
  let spriteAnimationTarget: number | null = null;

  // Try to load saved position
  const savedPosition = loadSavedPosition();
  if (savedPosition) {
    currentBottom = savedPosition.bottom;
    currentRight = savedPosition.right;
  }

  function prefersReducedMotion(): boolean {
    try {
      return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch {
      return false;
    }
  }

  function resolveAssetUrl(path: string): string {
    try {
      const chromeRuntime = (globalThis as any)?.chrome?.runtime;
      if (chromeRuntime?.getURL) return chromeRuntime.getURL(path);
    } catch {
      // ignore
    }
    return path;
  }

  function setSpriteFrame(nextFrame: number): void {
    spriteFrameIndex = Math.min(Math.max(Math.floor(nextFrame), 0), SPRITE_SHEET_TOTAL_FRAMES - 1);
    if (!spriteElement) return;

    const col = spriteFrameIndex % SPRITE_SHEET_COLS;
    const row = Math.floor(spriteFrameIndex / SPRITE_SHEET_COLS);
    const colPct = SPRITE_SHEET_COLS <= 1 ? 0 : (col * 100) / (SPRITE_SHEET_COLS - 1);
    const rowPct = SPRITE_SHEET_ROWS <= 1 ? 0 : (row * 100) / (SPRITE_SHEET_ROWS - 1);
    spriteElement.style.backgroundPosition = `${colPct}% ${rowPct}%`;
  }

  function stopSpriteAnimation(): void {
    if (spriteAnimationRaf != null) {
      cancelAnimationFrame(spriteAnimationRaf);
      spriteAnimationRaf = null;
    }
    spriteAnimationLastTs = null;
    spriteAnimationTarget = null;
  }

  function playSpriteTo(targetFrame: number): void {
    const clampedTarget = Math.min(
      Math.max(Math.floor(targetFrame), 0),
      SPRITE_SHEET_TOTAL_FRAMES - 1,
    );

    if (!spriteElement) return;

    if (prefersReducedMotion()) {
      stopSpriteAnimation();
      setSpriteFrame(clampedTarget);
      return;
    }

    if (spriteFrameIndex === clampedTarget) {
      stopSpriteAnimation();
      return;
    }

    stopSpriteAnimation();
    spriteAnimationTarget = clampedTarget;

    const direction = spriteFrameIndex < clampedTarget ? 1 : -1;
    const frameStepMs = 1000 / SPRITE_SHEET_FPS;

    const tick = (ts: number) => {
      if (!spriteElement || spriteAnimationTarget == null) {
        stopSpriteAnimation();
        return;
      }

      if (spriteAnimationLastTs == null) spriteAnimationLastTs = ts;
      const elapsed = ts - spriteAnimationLastTs;

      if (elapsed >= frameStepMs) {
        const maxCatchUpSteps = 6;
        const stepCount = Math.min(maxCatchUpSteps, Math.floor(elapsed / frameStepMs));
        spriteAnimationLastTs += stepCount * frameStepMs;

        for (let i = 0; i < stepCount; i += 1) {
          if (spriteAnimationTarget == null) break;
          const next = spriteFrameIndex + direction;
          if (direction > 0) setSpriteFrame(Math.min(next, spriteAnimationTarget));
          else setSpriteFrame(Math.max(next, spriteAnimationTarget));

          if (spriteFrameIndex === spriteAnimationTarget) {
            stopSpriteAnimation();
            return;
          }
        }
      }

      spriteAnimationRaf = requestAnimationFrame(tick);
    };

    spriteAnimationRaf = requestAnimationFrame(tick);
  }

  function bindSpriteHoverAnimation(): void {
    const icon = iconElement;
    const tooltip = tooltipElement;
    if (!icon || !tooltip) return;

    const playForward = () => playSpriteTo(SPRITE_SHEET_TOTAL_FRAMES - 1);
    const playReverse = () => playSpriteTo(0);

    icon.addEventListener('pointerenter', playForward);

    icon.addEventListener('pointerleave', (e: PointerEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && tooltip.contains(related)) return;
      playReverse();
    });

    tooltip.addEventListener('pointerenter', (e) => {
      e.stopPropagation();
      playForward();
    });

    tooltip.addEventListener('pointerleave', (e: PointerEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && icon.contains(related)) return;
      playReverse();
    });
  }

  /**
   * Create the shadow DOM structure
   */
  function createShadowDOM(): void {
    if (hostElement) return;

    // Create host element
    hostElement = document.createElement('div');
    hostElement.id = '__ruminer_floating_icon_host__';
    hostElement.style.cssText = 'all: initial;';

    // Attach shadow root
    shadowRoot = hostElement.attachShadow({ mode: 'open' });

    // Add styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = FLOATING_ICON_STYLES;
    shadowRoot.appendChild(styleSheet);

    // Create container
    const container = document.createElement('div');
    container.className = 'floating-icon-container';
    container.style.cssText = `
      bottom: ${currentBottom}px;
      right: ${currentRight}px;
    `;
    containerElement = container;

    // Create icon button
    iconElement = document.createElement('div');
    iconElement.className = 'floating-icon entering';
    iconElement.innerHTML = RUMINER_ICON_HTML;
    // Apply runtime size if provided
    try {
      iconElement.style.width = `${iconSize}px`;
      iconElement.style.height = `${iconSize}px`;
    } catch {
      // ignore
    }

    spriteElement = iconElement.querySelector('.floating-icon-sprite') as HTMLElement | null;
    try {
      const spriteUrl = resolveAssetUrl(SPRITE_SHEET_PUBLIC_PATH);
      iconElement.style.setProperty('--ruminer-sprite-url', `url("${spriteUrl}")`);
    } catch {
      // ignore
    }
    setSpriteFrame(0);

    // Create ripple element
    rippleElement = document.createElement('div');
    rippleElement.className = 'floating-icon-ripple';
    iconElement.appendChild(rippleElement);

    // Dialog (anchored bubble)
    dialogElement = document.createElement('div');
    dialogElement.className = 'floating-icon-dialog';
    dialogElement.dataset.visible = 'false';

    dialogTitleElement = document.createElement('div');
    dialogTitleElement.className = 'floating-icon-dialog-title';
    dialogTitleElement.textContent = 'Ruminer';

    dialogMessageElement = document.createElement('div');
    dialogMessageElement.className = 'floating-icon-dialog-message';
    dialogMessageElement.textContent = '';

    const dialogActions = document.createElement('div');
    dialogActions.className = 'floating-icon-dialog-actions';

    dialogOkButton = document.createElement('button');
    dialogOkButton.className = 'floating-icon-dialog-btn';
    dialogOkButton.type = 'button';
    dialogOkButton.textContent = 'OK';
    dialogOkButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      hideDialog();
    });

    dialogActions.appendChild(dialogOkButton);
    dialogElement.append(dialogTitleElement, dialogMessageElement, dialogActions);
    iconElement.appendChild(dialogElement);

    // Tooltip quick actions (interactive vertical list)
    tooltipElement = document.createElement('div');
    tooltipElement.className = 'floating-icon-tooltip';
    tooltipElement.dataset.open = 'false';

    tooltipListElement = document.createElement('div');
    tooltipListElement.className = 'floating-icon-tooltip-list';

    tooltipGreetingElement = document.createElement('div');
    tooltipGreetingElement.className =
      'floating-icon-tooltip-row floating-icon-tooltip-row--greeting';
    tooltipGreetingElement.textContent = 'Ruminer is Here, At Your Service!';

    // Engine flyout submenu (mounted under tooltip, positioned dynamically)
    engineFlyoutElement = document.createElement('div');
    engineFlyoutElement.className = 'floating-icon-tooltip-flyout';
    engineFlyoutElement.dataset.open = 'false';

    const flyoutTitle = document.createElement('div');
    flyoutTitle.className = 'floating-icon-tooltip-flyout-title';
    flyoutTitle.textContent = 'Select Engine';

    engineFlyoutListElement = document.createElement('div');
    engineFlyoutListElement.className = 'floating-icon-tooltip-flyout-list';

    engineFlyoutElement.append(flyoutTitle, engineFlyoutListElement);

    const createActionRow = (params: {
      className: string;
      iconHtml: string;
      label: string;
      suffixHtml?: string;
    }): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        `floating-icon-tooltip-row floating-icon-tooltip-row--action floating-icon-tooltip-action ${params.className}`.trim();

      const icon = document.createElement('span');
      icon.className = 'floating-icon-tooltip-action-icon';
      icon.innerHTML = params.iconHtml;

      const text = document.createElement('span');
      text.className = 'floating-icon-tooltip-action-label';
      text.textContent = params.label;

      btn.append(icon, text);

      if (params.suffixHtml) {
        const suffix = document.createElement('span');
        suffix.className = 'floating-icon-tooltip-action-suffix';
        suffix.innerHTML = params.suffixHtml;
        btn.appendChild(suffix);
      }

      const stop = (e: Event) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      };
      btn.addEventListener('pointerdown', stop);
      btn.addEventListener('mousedown', stop);
      btn.addEventListener('touchstart', stop, { passive: false } as any);

      return btn;
    };

    tooltipEngineChip = createActionRow({
      className: 'floating-icon-tooltip-action--engine',
      iconHtml: ICON_CPU,
      label: 'Engine',
      suffixHtml: ICON_CHEVRON_LEFT,
    });
    tooltipEngineChip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      toggleEngineFlyout();
    });

    tooltipSaveChip = createActionRow({
      className: 'floating-icon-tooltip-action--save',
      iconHtml: ICON_DOWNLOAD,
      label: 'Save Chat',
    });
    tooltipSaveChip.hidden = true;
    tooltipSaveChip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      tooltipState?.onSaveChat?.();
    });

    tooltipPersistChip = createActionRow({
      className: 'floating-icon-tooltip-action--persist',
      iconHtml: ICON_PIN_OFF,
      label: 'Persist Quick Chat',
    });
    tooltipPersistChip.dataset.enabled = 'false';
    tooltipPersistChip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      const current = tooltipState?.persistEnabled === true;
      tooltipState?.onTogglePersist?.(!current);
    });

    tooltipNewChip = createActionRow({
      className: 'floating-icon-tooltip-action--new',
      iconHtml: ICON_PLUS,
      label: 'New Quick Chat',
    });
    tooltipNewChip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      tooltipState?.onNewQuickChat?.();
    });

    tooltipListElement.append(
      tooltipGreetingElement,
      tooltipEngineChip,
      tooltipSaveChip,
      tooltipPersistChip,
      tooltipNewChip,
    );
    tooltipElement.appendChild(tooltipListElement);
    tooltipElement.appendChild(engineFlyoutElement);
    iconElement.appendChild(tooltipElement);

    // Workflow progress overlay (hidden by default)
    progressOverlayElement = document.createElement('div');
    progressOverlayElement.className = 'floating-icon-progress';

    // Build ring + text
    progressOverlayElement.innerHTML = /* html */ `
      <div class="floating-icon-progress-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle class="ring-bg" cx="50" cy="50" r="44" stroke-width="6" fill="none"></circle>
          <circle class="ring-fg" cx="50" cy="50" r="44" stroke-width="6" fill="none"></circle>
        </svg>
      </div>
      <div class="floating-icon-progress-text" aria-hidden="true">
      <div class="floating-icon-progress-count"></div>
      <div class="floating-icon-progress-percent"></div>
      <div class="floating-icon-progress-time"></div>
      </div>
    `;

    progressTimeElement = progressOverlayElement.querySelector(
      '.floating-icon-progress-time',
    ) as HTMLElement | null;
    progressPercentElement = progressOverlayElement.querySelector(
      '.floating-icon-progress-percent',
    ) as HTMLElement | null;
    progressCountElement = progressOverlayElement.querySelector(
      '.floating-icon-progress-count',
    ) as HTMLElement | null;
    progressRingFg = progressOverlayElement.querySelector('.ring-fg') as SVGCircleElement | null;

    // Configure ring dash values (44 radius => circumference)
    if (progressRingFg) {
      const r = 44;
      const c = 2 * Math.PI * r;
      progressRingFg.style.strokeDasharray = `${c}`;
      progressRingFg.style.strokeDashoffset = `${c}`;
    }
    iconElement.appendChild(progressOverlayElement);

    // Workflow controls (hover-only; only when workflowActive)
    workflowControlsElement = document.createElement('div');
    workflowControlsElement.className = 'floating-icon-workflow-controls';

    pauseResumeButton = document.createElement('button');
    pauseResumeButton.className = 'floating-icon-workflow-button';
    pauseResumeButton.type = 'button';
    pauseResumeButton.setAttribute('aria-label', 'Pause / Resume workflow');

    stopButton = document.createElement('button');
    stopButton.className = 'floating-icon-workflow-button';
    stopButton.type = 'button';
    stopButton.setAttribute('aria-label', 'Stop workflow');

    workflowControlsElement.appendChild(pauseResumeButton);
    workflowControlsElement.appendChild(stopButton);
    iconElement.appendChild(workflowControlsElement);

    // Add event listeners
    setupEventListeners(iconElement);
    setupWorkflowControlListeners();
    updateWorkflowUi();
    updateTooltipUi();
    bindTooltipHoverRetention();
    bindSpriteHoverAnimation();
    setTooltipOpen(false);

    container.appendChild(iconElement);
    shadowRoot.appendChild(container);

    // Remove entrance animation class after animation completes
    setTimeout(() => {
      iconElement?.classList.remove('entering');
      iconElement?.classList.add('breathing');
    }, 500);
  }

  function setSize(nextSize: number): void {
    const next = Math.round(Number(nextSize) || ICON_SIZE);
    // clamp reasonable bounds
    const clamped = Math.max(32, Math.min(160, next));
    iconSize = clamped;

    if (iconElement) {
      iconElement.style.width = `${iconSize}px`;
      iconElement.style.height = `${iconSize}px`;
    }

    // Re-constrain current position to keep icon on-screen
    currentRight = Math.max(16, Math.min(window.innerWidth - iconSize - 16, currentRight));
    currentBottom = Math.max(16, Math.min(window.innerHeight - iconSize - 16, currentBottom));

    if (hostElement) {
      const container = hostElement.shadowRoot?.querySelector(
        '.floating-icon-container',
      ) as HTMLElement | null;
      if (container) {
        container.style.bottom = `${currentBottom}px`;
        container.style.right = `${currentRight}px`;
      }
    }
  }

  /**
   * Setup drag and click event listeners
   */
  function setupEventListeners(element: HTMLElement): void {
    // Mouse events
    element.addEventListener('mousedown', handleDragStart);
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);

    // Touch events
    element.addEventListener('touchstart', handleDragStart, { passive: false });
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('touchend', handleDragEnd);

    // Click
    element.addEventListener('click', handleClick);

    // Keyboard accessibility
    element.setAttribute('tabindex', '0');
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', 'Toggle Side Panel');
    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerRipple();
        options.onClick?.();
      }
    });
  }

  /**
   * Handle drag start
   */
  function handleDragStart(e: MouseEvent | TouchEvent): void {
    if (!iconElement) return;

    const target = (e as any)?.target as Element | null;
    if (
      target &&
      (target.closest('.floating-icon-tooltip') ||
        target.closest('.floating-icon-dialog') ||
        target.closest('.floating-icon-workflow-controls'))
    ) {
      return;
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    dragStartX = clientX;
    dragStartY = clientY;
    isDragging = true;
    hasDragged = false;

    iconElement.classList.add('dragging');
    iconElement.classList.remove('breathing');

    // Prevent text selection during drag
    e.preventDefault();
  }

  /**
   * Handle drag move
   */
  function handleDragMove(e: MouseEvent | TouchEvent): void {
    if (!isDragging || !iconElement || !hostElement) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const deltaX = dragStartX - clientX;
    const deltaY = dragStartY - clientY;

    // Check if actually dragged beyond threshold
    if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
      hasDragged = true;
    }

    // Update position
    currentRight += deltaX;
    currentBottom += deltaY;

    // Constrain to viewport
    const maxRight = window.innerWidth - iconSize - 16;
    const maxBottom = window.innerHeight - iconSize - 16;

    currentRight = Math.max(16, Math.min(maxRight, currentRight));
    currentBottom = Math.max(16, Math.min(maxBottom, currentBottom));

    // Apply position
    const container = hostElement.shadowRoot?.querySelector(
      '.floating-icon-container',
    ) as HTMLElement;
    if (container) {
      container.style.right = `${currentRight}px`;
      container.style.bottom = `${currentBottom}px`;
    }

    // Update drag start for next move
    dragStartX = clientX;
    dragStartY = clientY;

    e.preventDefault();
  }

  /**
   * Handle drag end
   */
  function handleDragEnd(): void {
    if (!iconElement) return;

    isDragging = false;
    iconElement.classList.remove('dragging');
    iconElement.classList.add('breathing');

    // Save position if dragged
    if (hasDragged) {
      savePosition({ bottom: currentBottom, right: currentRight });
      options.onPositionChange?.({ bottom: currentBottom, right: currentRight });
    }
  }

  /**
   * Handle click
   */
  function handleClick(e: MouseEvent): void {
    // Ignore if it was a drag
    if (hasDragged) {
      e.stopPropagation();
      return;
    }

    const target = (e as any)?.target as Element | null;
    if (
      target &&
      (target.closest('.floating-icon-tooltip') ||
        target.closest('.floating-icon-dialog') ||
        target.closest('.floating-icon-workflow-controls'))
    ) {
      e.stopPropagation();
      return;
    }

    // While workflow progress is active, clicking the icon should not open the Quick Panel.
    if (workflowProgress) {
      e.stopPropagation();
      return;
    }

    triggerRipple();
    options.onClick?.();
  }

  function setupWorkflowControlListeners(): void {
    const stopPointer = (e: Event) => {
      e.stopPropagation();
      // Prevent drag start + click-through
      if (e.cancelable) e.preventDefault();
    };

    const bindNoDrag = (el: HTMLElement | null) => {
      if (!el) return;
      el.addEventListener('mousedown', stopPointer);
      el.addEventListener('touchstart', stopPointer, { passive: false } as any);
    };

    bindNoDrag(pauseResumeButton);
    bindNoDrag(stopButton);

    pauseResumeButton?.addEventListener('click', (e) => {
      stopPointer(e);
      const p = workflowProgress;
      if (!p) return;
      if (p.status === 'paused') workflowControls?.onResume?.();
      else workflowControls?.onPause?.();
    });

    stopButton?.addEventListener('click', (e) => {
      stopPointer(e);
      workflowControls?.onStop?.();
    });
  }

  function setWorkflowControls(controls: FloatingIconWorkflowControls | null): void {
    workflowControls = controls;
    updateWorkflowUi();
  }

  function setWorkflowProgress(progress: FloatingIconWorkflowProgress | null): void {
    workflowProgress = progress;
    // Workflow progress overlay is a dedicated mode: suppress hover tooltip while active.
    if (workflowProgress) setTooltipOpen(false);
    updateWorkflowUi();
  }

  function setTooltipState(next: FloatingIconTooltipState | null): void {
    tooltipState = next;
    if (!next) setEngineFlyoutOpen(false);
    updateTooltipUi();
  }

  function setTooltipOpen(next: boolean): void {
    if (!tooltipElement || !iconElement) return;
    // While workflow progress is active, keep tooltip closed.
    if (workflowProgress && next) next = false;

    tooltipOpen = next;
    if (!next) setEngineFlyoutOpen(false);

    if (tooltipAnimationTimer) clearTimeout(tooltipAnimationTimer);
    tooltipAnimationTimer = null;

    if (next) {
      syncTooltipAnimationVars();
      const count = getTooltipVisibleItemCount();
      tooltipElement.dataset.open = 'true';
      tooltipElement.dataset.anim = 'opening';
      iconElement.classList.add('tooltip-open');
      const openDurationMs = (count - 1) * 36 + 240 + 60;
      tooltipAnimationTimer = setTimeout(() => {
        tooltipAnimationTimer = null;
        if (!tooltipOpen) return;
        if (!tooltipElement) return;
        tooltipElement.dataset.anim = '';
      }, openDurationMs);
      return;
    }

    if (tooltipElement.dataset.open !== 'true') {
      tooltipElement.dataset.open = 'false';
      tooltipElement.dataset.anim = '';
      iconElement.classList.remove('tooltip-open');
      return;
    }

    // Animate closed itemwise (keep the tooltip mounted while items fold).
    syncTooltipAnimationVars();
    const count = getTooltipVisibleItemCount();
    tooltipElement.dataset.open = 'true';
    tooltipElement.dataset.anim = 'closing';
    iconElement.classList.add('tooltip-open');

    const closeDurationMs = (count - 1) * 28 + 200 + 60;
    tooltipAnimationTimer = setTimeout(() => {
      tooltipAnimationTimer = null;
      if (!tooltipElement || !iconElement) return;
      // If we re-opened meanwhile, don't force-close.
      if (tooltipOpen) return;
      if (tooltipElement.dataset.anim !== 'closing') return;

      // First hide the tooltip container (it has its own opacity/transform transition).
      tooltipElement.dataset.open = 'false';

      // Then, after the container finishes transitioning out, clear animation state.
      const containerFadeOutMs = 200 + 40;
      tooltipAnimationTimer = setTimeout(() => {
        tooltipAnimationTimer = null;
        if (!tooltipElement || !iconElement) return;
        if (tooltipOpen) return;
        if (tooltipElement.dataset.open === 'true') return;
        tooltipElement.dataset.anim = '';
        iconElement.classList.remove('tooltip-open');
      }, containerFadeOutMs);
    }, closeDurationMs);
  }

  function scheduleTooltipClose(): void {
    if (tooltipCloseTimer) clearTimeout(tooltipCloseTimer);
    tooltipCloseTimer = setTimeout(() => {
      tooltipCloseTimer = null;
      // If pointer is still within icon/tooltip (or the bridge), keep it open.
      try {
        if (iconElement?.matches(':hover') || tooltipElement?.matches(':hover')) return;
      } catch {
        // ignore
      }
      setTooltipOpen(false);
    }, 240);
  }

  function bindTooltipHoverRetention(): void {
    const icon = iconElement;
    const tooltip = tooltipElement;
    if (!icon || !tooltip) return;

    icon.addEventListener('pointerenter', () => {
      if (workflowProgress) return;
      if (tooltipCloseTimer) {
        clearTimeout(tooltipCloseTimer);
        tooltipCloseTimer = null;
      }
      setTooltipOpen(true);
    });

    icon.addEventListener('pointerleave', (e: PointerEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && tooltip.contains(related)) return;
      scheduleTooltipClose();
    });

    tooltip.addEventListener('pointerenter', (e) => {
      e.stopPropagation();
      if (tooltipCloseTimer) {
        clearTimeout(tooltipCloseTimer);
        tooltipCloseTimer = null;
      }
      setTooltipOpen(true);
    });

    tooltip.addEventListener('pointerleave', (e: PointerEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && icon.contains(related)) return;
      scheduleTooltipClose();
    });
  }

  function layoutEngineFlyout(): void {
    const tooltip = tooltipElement;
    const engineChip = tooltipEngineChip;
    const flyout = engineFlyoutElement;
    if (!tooltip || !engineChip || !flyout) return;

    try {
      const tooltipRect = tooltip.getBoundingClientRect();
      const chipRect = engineChip.getBoundingClientRect();
      const rawTop = chipRect.top - tooltipRect.top;
      const maxTop = Math.max(0, tooltipRect.height - flyout.offsetHeight);
      const top = Math.max(0, Math.min(rawTop, maxTop));
      flyout.style.top = `${top}px`;
    } catch {
      // ignore
    }
  }

  function rebuildEngineFlyoutItems(): void {
    const flyoutList = engineFlyoutListElement;
    if (!flyoutList) return;

    const current =
      typeof tooltipState?.engineName === 'string' ? tooltipState.engineName.trim() : '';
    const canSet = typeof tooltipState?.onSetEngine === 'function';

    flyoutList.textContent = '';
    for (const choice of ENGINE_CHOICES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'floating-icon-tooltip-flyout-item';
      btn.dataset.active = choice.engineName === current ? 'true' : 'false';
      btn.disabled = !canSet;

      const check = document.createElement('span');
      check.className = 'floating-icon-tooltip-flyout-item-check';
      check.innerHTML = ICON_CHECK;

      const label = document.createElement('span');
      label.className = 'floating-icon-tooltip-flyout-item-label';
      label.textContent = choice.label;

      btn.append(check, label);

      const stop = (e: Event) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      };
      btn.addEventListener('pointerdown', stop);
      btn.addEventListener('mousedown', stop);
      btn.addEventListener('touchstart', stop, { passive: false } as any);

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        if (!canSet) return;
        tooltipState?.onSetEngine?.(choice.engineName);
        setEngineFlyoutOpen(false);
      });

      flyoutList.appendChild(btn);
    }
  }

  function setEngineFlyoutOpen(next: boolean): void {
    if (!engineFlyoutElement) return;
    engineFlyoutOpen = next;
    engineFlyoutElement.dataset.open = next ? 'true' : 'false';

    if (!next) return;

    rebuildEngineFlyoutItems();
    requestAnimationFrame(() => layoutEngineFlyout());
  }

  function toggleEngineFlyout(): void {
    if (!tooltipOpen) return;
    if (!tooltipEngineChip || !engineFlyoutElement) return;

    if (engineFlyoutOpen) {
      setEngineFlyoutOpen(false);
      return;
    }

    // If engine switching isn't supported for the current session, do nothing (but keep UI consistent).
    if (typeof tooltipState?.onSetEngine !== 'function') return;
    setEngineFlyoutOpen(true);
  }

  function updateTooltipUi(): void {
    if (!tooltipPersistChip || !tooltipNewChip || !tooltipSaveChip || !tooltipEngineChip) return;

    const platformLabelRaw = tooltipState?.platformLabel;
    const platformLabel = typeof platformLabelRaw === 'string' ? platformLabelRaw.trim() : '';
    const canSave = !!platformLabel && typeof tooltipState?.onSaveChat === 'function';

    tooltipSaveChip.hidden = !canSave;
    tooltipSaveChip.disabled = !canSave;
    const saveLabelEl = tooltipSaveChip.querySelector(
      '.floating-icon-tooltip-action-label',
    ) as HTMLElement | null;
    if (saveLabelEl) saveLabelEl.textContent = canSave ? `Save ${platformLabel} Chat` : 'Save Chat';

    const persistEnabled = tooltipState?.persistEnabled === true;
    tooltipPersistChip.dataset.enabled = persistEnabled ? 'true' : 'false';
    tooltipPersistChip.disabled = typeof tooltipState?.onTogglePersist !== 'function';
    const persistIconEl = tooltipPersistChip.querySelector(
      '.floating-icon-tooltip-action-icon',
    ) as HTMLElement | null;
    if (persistIconEl) persistIconEl.innerHTML = persistEnabled ? ICON_PIN : ICON_PIN_OFF;

    tooltipNewChip.disabled = typeof tooltipState?.onNewQuickChat !== 'function';

    const engineDisplayNameRaw = tooltipState?.engineDisplayName;
    const engineDisplayName =
      typeof engineDisplayNameRaw === 'string' && engineDisplayNameRaw.trim()
        ? engineDisplayNameRaw.trim()
        : 'Agent';
    const engineLabelEl = tooltipEngineChip.querySelector(
      '.floating-icon-tooltip-action-label',
    ) as HTMLElement | null;
    if (engineLabelEl) engineLabelEl.textContent = `Engine: ${engineDisplayName}`;
    tooltipEngineChip.disabled = typeof tooltipState?.onSetEngine !== 'function';

    syncTooltipAnimationVars();

    // If flyout is open, keep items/layout in sync with latest state.
    if (engineFlyoutOpen) {
      rebuildEngineFlyoutItems();
      requestAnimationFrame(() => layoutEngineFlyout());
    }
  }

  function getTooltipVisibleItemCount(): number {
    if (!tooltipListElement) return 1;
    return Math.max(
      1,
      Array.from(tooltipListElement.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement && !el.hidden,
      ).length,
    );
  }

  function syncTooltipAnimationVars(): void {
    if (!tooltipElement || !tooltipListElement) return;
    const items = Array.from(tooltipListElement.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && !el.hidden,
    );
    tooltipElement.style.setProperty('--ruminer-tooltip-count', String(Math.max(1, items.length)));
    items.forEach((item, idx) => {
      item.style.setProperty('--i', String(idx));
    });
  }

  function showDialog(dialog: FloatingIconDialogOptions): void {
    createShadowDOM();
    if (!dialogElement || !dialogTitleElement || !dialogMessageElement) return;
    dialogTitleElement.textContent = String(dialog?.title || 'Ruminer');
    dialogMessageElement.textContent = String(dialog?.message || '');
    dialogElement.dataset.visible = 'true';
    // Best-effort: hide tooltip interaction while dialog is visible.
    if (tooltipElement) tooltipElement.style.pointerEvents = 'none';
  }

  function hideDialog(): void {
    if (!dialogElement) return;
    dialogElement.dataset.visible = 'false';
    if (tooltipElement) tooltipElement.style.pointerEvents = '';
  }

  function updateWorkflowUi(): void {
    if (!iconElement) return;

    const p = workflowProgress;
    if (!p) {
      iconElement.classList.remove('workflow-active');
      if (progressTimeElement) progressTimeElement.textContent = '';
      if (progressPercentElement) progressPercentElement.textContent = '';
      if (progressCountElement) progressCountElement.textContent = '';
      if (progressRingFg) {
        const r = 44;
        const c = 2 * Math.PI * r;
        progressRingFg.style.strokeDashoffset = `${c}`;
      }
      if (pauseResumeButton) pauseResumeButton.disabled = true;
      if (stopButton) stopButton.disabled = true;
      return;
    }

    iconElement.classList.add('workflow-active');

    const pct = Math.max(0, Math.min(100, Math.floor(p.percent)));
    const finishedCount = Math.max(0, Math.floor(p.finished));
    const totalCount = p.total === null ? null : Math.max(0, Math.floor(p.total));
    const remainingCountText =
      totalCount === null ? '--' : String(Math.max(0, Math.floor(totalCount - finishedCount)));
    const finishedText = String(finishedCount);
    const elapsedText = formatDurationShort(p.elapsedMs);
    const remainingMs =
      p.estimatedTotalMs === null
        ? null
        : Math.max(0, Math.floor(p.estimatedTotalMs - p.elapsedMs));
    const remainingTimeText = remainingMs === null ? '--:--' : formatDurationShort(remainingMs);

    if (progressTimeElement)
      progressTimeElement.textContent = `${elapsedText}-${remainingTimeText}`;
    if (progressPercentElement) progressPercentElement.textContent = `${pct}%`;
    if (progressCountElement)
      progressCountElement.textContent = `${finishedText}-${remainingCountText}`;

    if (progressRingFg) {
      const r = 44;
      const c = 2 * Math.PI * r;
      const offset = c * (1 - pct / 100);
      progressRingFg.style.strokeDashoffset = `${offset}`;
    }

    const playSvg = /* html */ `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 5v14l12-7L7 5z"></path>
      </svg>
    `;
    const pauseSvg = /* html */ `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 5h5v14H6V5zm7 0h5v14h-5V5z"></path>
      </svg>
    `;
    const stopSvg = /* html */ `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 5h14v14H5V5z"></path>
      </svg>
    `;

    if (pauseResumeButton) {
      pauseResumeButton.dataset.mode = p.status === 'paused' ? 'resume' : 'pause';
      pauseResumeButton.innerHTML = p.status === 'paused' ? playSvg : pauseSvg;
      pauseResumeButton.disabled =
        p.status === 'paused' ? !workflowControls?.onResume : !workflowControls?.onPause;
    }

    if (stopButton) {
      stopButton.dataset.mode = 'stop';
      stopButton.innerHTML = stopSvg;
      stopButton.disabled = !workflowControls?.onStop;
    }
  }

  /**
   * Trigger ripple animation
   */
  function triggerRipple(): void {
    if (!rippleElement) return;

    rippleElement.classList.remove('active');
    void rippleElement.offsetWidth; // Force reflow
    rippleElement.classList.add('active');

    setTimeout(() => {
      rippleElement?.classList.remove('active');
    }, 500);
  }

  function resolveHostMountRoot(): HTMLElement {
    // Prefer <html> to avoid interfering with apps that treat <body> as the React root (hydration).
    return document.documentElement || document.body;
  }

  function ensureHostAttached(): void {
    if (!hostElement) return;
    const root = resolveHostMountRoot();
    if (hostElement.isConnected && root.contains(hostElement)) return;
    try {
      root.appendChild(hostElement);
    } catch {
      try {
        document.body?.appendChild(hostElement);
      } catch {
        // ignore
      }
    }
  }

  function ensureHostObserver(): void {
    if (hostObserver) return;
    if (!hostElement) return;
    hostObserver = new MutationObserver(() => {
      if (!isVisible) return;
      if (isHiding) return;
      if (!hostElement) return;
      if (hostElement.isConnected) return;
      ensureHostAttached();
    });
    try {
      hostObserver.observe(document, { childList: true, subtree: true });
    } catch {
      // ignore
    }
  }

  /**
   * Show the floating icon
   */
  function show(): void {
    if (isVisible) return;

    createShadowDOM();

    if (hostElement) {
      isHiding = false;
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      iconElement?.classList.remove('exiting');
      iconElement?.classList.add('entering');
      ensureHostAttached();
      ensureHostObserver();
      isVisible = true;
    }
  }

  /**
   * Hide the floating icon
   */
  function hide(): void {
    if (!isVisible || !iconElement || !hostElement) return;

    stopSpriteAnimation();
    setSpriteFrame(0);
    iconElement.classList.remove('breathing');
    iconElement.classList.add('exiting');

    isHiding = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      hostElement?.remove();
      isVisible = false;
      isHiding = false;
    }, 300);
  }

  /**
   * Toggle visibility
   */
  function toggle(): void {
    if (isVisible) {
      hide();
    } else {
      show();
    }
  }

  /**
   * Check if visible
   */
  function checkVisible(): boolean {
    return isVisible;
  }

  /**
   * Get current position
   */
  function getPosition(): { bottom: number; right: number } {
    return { bottom: currentBottom, right: currentRight };
  }

  /**
   * Set position programmatically
   */
  function setPosition(position: { bottom: number; right: number }): void {
    currentBottom = position.bottom;
    currentRight = position.right;

    if (hostElement) {
      const container = hostElement.shadowRoot?.querySelector(
        '.floating-icon-container',
      ) as HTMLElement;
      if (container) {
        container.style.right = `${currentRight}px`;
        container.style.bottom = `${currentBottom}px`;
      }
    }

    savePosition(position);
  }

  /**
   * Pulse animation to draw attention
   */
  function pulse(): void {
    if (!iconElement) return;

    iconElement.classList.remove('breathing');
    iconElement.classList.add('pulsing');

    setTimeout(() => {
      iconElement?.classList.remove('pulsing');
      iconElement?.classList.add('breathing');
    }, 3000);
  }

  /**
   * Dispose and cleanup
   */
  function dispose(): void {
    stopSpriteAnimation();
    if (hostObserver) {
      try {
        hostObserver.disconnect();
      } catch {
        // ignore
      }
      hostObserver = null;
    }
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    isHiding = false;
    if (hostElement) {
      hostElement.remove();
      hostElement = null;
    }
    if (tooltipCloseTimer) clearTimeout(tooltipCloseTimer);
    tooltipCloseTimer = null;
    shadowRoot = null;
    containerElement = null;
    iconElement = null;
    spriteElement = null;
    tooltipElement = null;
    tooltipGreetingElement = null;
    tooltipListElement = null;
    tooltipEngineChip = null;
    tooltipSaveChip = null;
    tooltipPersistChip = null;
    tooltipNewChip = null;
    tooltipState = null;
    tooltipOpen = false;
    engineFlyoutElement = null;
    engineFlyoutListElement = null;
    engineFlyoutOpen = false;
    dialogElement = null;
    dialogTitleElement = null;
    dialogMessageElement = null;
    dialogOkButton = null;
    rippleElement = null;
    progressOverlayElement = null;
    progressTimeElement = null;
    progressPercentElement = null;
    progressCountElement = null;
    progressRingFg = null;
    workflowControlsElement = null;
    pauseResumeButton = null;
    stopButton = null;
    workflowProgress = null;
    workflowControls = null;
    isVisible = false;
  }

  return {
    show,
    hide,
    toggle,
    isVisible: checkVisible,
    getElements: () => ({
      host: hostElement,
      shadowRoot,
      container: containerElement,
      icon: iconElement,
    }),
    getPosition,
    setPosition,
    pulse,
    setWorkflowProgress,
    setWorkflowControls,
    setTooltipState,
    showDialog,
    hideDialog,
    setSize,
    dispose,
  };
}
