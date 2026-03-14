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

const LOG_PREFIX = '[FloatingIcon]';
const ICON_SIZE = 64;
const DRAG_THRESHOLD = 5;

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

  /* Ruminating jaw animation */
  @keyframes cow-ruminate {
    0%, 36%, 100% {
      transform: translateY(0);
    }
    8% {
      transform: translateY(2px);
    }
    16% {
      transform: translateY(0);
    }
    24% {
      transform: translateY(1.5px);
    }
    32% {
      transform: translateY(0);
    }
  }

  .floating-icon.breathing .cow-jaw {
    animation: cow-ruminate 4s ease-in-out infinite;
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

  /* Icon SVG styling */
  /* ========================================================
     Icon SVG Animating Graphics (Geometric Cow Style)
     ======================================================== */
  
  .floating-icon-svg {
    width: 48px;
    height: 48px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .floating-icon:hover .floating-icon-svg {
    transform: scale(1.02);
  }

  .floating-icon.workflow-active .floating-icon-svg {
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
  }

  .floating-icon-progress-time {
    font-size: 10px;
    font-weight: 600;
    opacity: 0.9;
  }

  .floating-icon-progress-percent {
    font-size: 20px;
    font-weight: 800;
    margin-top: 4px;
    letter-spacing: -0.02em;
  }

  .floating-icon-progress-count {
    font-size: 10px;
    font-weight: 600;
    margin-top: 4px;
    opacity: 0.9;
  }

  /* Workflow hover controls */
  .floating-icon-workflow-controls {
    position: absolute;
    bottom: calc(100% + 12px);
    right: 0;
    display: none;
    gap: 8px;
    align-items: center;
    padding: 8px;
    border-radius: 999px;
    background: rgba(30, 27, 24, 0.9);
    border: 1px solid rgba(255, 200, 100, 0.18);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
    pointer-events: auto;
  }

  .floating-icon.workflow-active:hover .floating-icon-workflow-controls {
    display: flex;
  }

  .floating-icon-workflow-button {
    width: 34px;
    height: 34px;
    border-radius: 999px;
    border: 1px solid rgba(255, 200, 100, 0.16);
    background: linear-gradient(145deg, rgba(50, 45, 40, 0.95), rgba(30, 27, 24, 0.95));
    color: #e5a93d;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }

  .floating-icon-workflow-button:hover {
    transform: translateY(-1px);
    border-color: rgba(229, 169, 61, 0.45);
  }

  .floating-icon-workflow-button:active {
    transform: translateY(0);
  }

  .floating-icon-workflow-button[disabled] {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .floating-icon-workflow-button svg {
    width: 18px;
    height: 18px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .cow-dark-hole {
    fill: #110f0e; /* Deep dark to simulate negative space */
    transition: fill 0.4s ease;
  }

  /* -- Jaw Morph Animation -- */
  .cow-jaw {
    /* Base: Closed crescent shape below the snout */
    d: path('M 42,81 C 42,83 50,86 58,81 C 55,84 45,84 42,81 Z');
    transition: d 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  
  .floating-icon:hover .cow-jaw {
    /* Hover: Massive open U-shape jaw */
    d: path('M 37,76 C 37,100 63,100 63,76 C 55,90 45,90 37,76 Z');
  }

  /* -- Mouth Cavity (Dark void behind the jaw) -- */
  .cow-mouth-cavity {
    opacity: 0;
    transform-origin: 50% 77%;
    transform: scale(0.3);
    transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .floating-icon:hover .cow-mouth-cavity {
    opacity: 1;
    transform: scale(1);
  }

  /* -- Tongue -- */
  .cow-tongue {
    opacity: 0;
    transform-origin: 50% 90%;
    transform: scale(0.5) translateY(4px);
    transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .floating-icon:hover .cow-tongue {
    opacity: 1;
    transform: scale(1) translateY(0);
    transition-delay: 0.1s; /* Tongue pops up slightly after jaw opens */
  }

  /* -- Aura Animations -- */
  .aura-group {
    transform-origin: 50% 50%;
    animation: aura-spin 30s linear infinite;
  }

  @keyframes aura-spin {
    100% { transform: rotate(360deg); }
  }

  .aura-line {
    stroke-dasharray: 40;
    stroke-dashoffset: 80;
    animation: aura-flow 3s linear infinite;
  }

  .floating-icon:hover .aura-line {
    animation-duration: 1.5s; /* Speeds up on hover */
  }

  @keyframes aura-flow {
    to { stroke-dashoffset: 0; }
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
    /* Show while closing, but prevent accidental clicks on animating rows */
    pointer-events: none;
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
    --ruminer-action-icon: rgb(98, 237, 64);
  }

  .floating-icon-tooltip-action--new {
    --ruminer-action-icon: rgb(57, 239, 239);
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
    .floating-icon, .floating-icon:hover, .floating-icon-svg, 
    .cow-jaw, .cow-tongue, .cow-mouth-cavity, .aura-group, .aura-line,
    .floating-icon-tooltip, .floating-icon-tooltip-row, .floating-icon-tooltip-action {
      transition: none !important;
      animation: none !important;
    }
  }
`;

// ============================================================
// SVG Icon (Geometric Cow + Aura)
// ============================================================

const RUMINER_ICON_SVG = /* svg */ `
  <svg class="floating-icon-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    
    <!-- Magical Aura Background -->
    <g class="aura-group" stroke="currentColor" fill="none" stroke-width="0.75" stroke-linecap="round">
      <circle cx="50" cy="50" r="38" opacity="0.15" />
      <circle cx="50" cy="50" r="46" opacity="0.08" />
      
      <!-- Flowing magical lines -->
      <path d="M 12,55 C 5,60 5,75 22,82" class="aura-line" opacity="0.4" />
      <path d="M 88,55 C 95,60 95,75 78,82" class="aura-line" opacity="0.4" />
      <path d="M 18,45 C 5,50 5,60 12,68" class="aura-line" opacity="0.2" style="animation-delay: -1s" />
      <path d="M 82,45 C 95,50 95,60 88,68" class="aura-line" opacity="0.2" style="animation-delay: -1s" />
      
      <!-- Sparkle Dots -->
      <circle cx="15" cy="45" r="1.5" fill="currentColor" stroke="none" opacity="0.6" />
      <circle cx="10" cy="58" r="1" fill="currentColor" stroke="none" opacity="0.4" />
      <circle cx="20" cy="72" r="1.5" fill="currentColor" stroke="none" opacity="0.5" />
      <circle cx="28" cy="85" r="1" fill="currentColor" stroke="none" opacity="0.3" />
      
      <circle cx="85" cy="45" r="1.5" fill="currentColor" stroke="none" opacity="0.6" />
      <circle cx="90" cy="58" r="1" fill="currentColor" stroke="none" opacity="0.4" />
      <circle cx="80" cy="72" r="1.5" fill="currentColor" stroke="none" opacity="0.5" />
      <circle cx="72" cy="85" r="1" fill="currentColor" stroke="none" opacity="0.3" />
    </g>

    <!-- Main Cow Geometry -->
    <g fill="currentColor">
      
      <!-- Center Face / Nose Bridge / Snout -->
      <path d="M 38,25 
               Q 50,22 62,25 
               C 60,35 55,40 56,48 
               C 57,55 68,62 68,68 
               C 68,75 60,78 50,78 
               C 40,78 32,75 32,68 
               C 32,62 43,55 44,48 
               C 45,40 40,35 38,25 Z" />
      
      <!-- Left Horn (Majestic curve) -->
      <path d="M 38,26 C 20,24 10,12 2,16 C 12,20 22,32 35,32 Z" />
      
      <!-- Right Horn -->
      <path d="M 62,26 C 80,24 90,12 98,16 C 88,20 78,32 65,32 Z" />
      
      <!-- Left Ear (Separated leaf shape) -->
      <path d="M 35,35 C 20,35 5,42 2,46 C 12,50 22,46 28,42 C 22,42 15,44 12,44 C 20,40 30,38 35,35 Z" />
      
      <!-- Right Ear -->
      <path d="M 65,35 C 80,35 95,42 98,46 C 88,50 78,46 72,42 C 78,42 85,44 88,44 C 80,40 70,38 65,35 Z" />
      
      <!-- Left Cheek (Creates the negative-space eye) -->
      <path d="M 38,40 C 42,42 42,50 35,60 C 32,58 30,50 38,40 Z" />
      
      <!-- Right Cheek -->
      <path d="M 62,40 C 58,42 58,50 65,60 C 68,58 70,50 62,40 Z" />
    </g>

    <!-- Nostrils (Solid dark cutouts) -->
    <circle cx="43" cy="68" r="3.5" class="cow-dark-hole" />
    <circle cx="57" cy="68" r="3.5" class="cow-dark-hole" />

    <!-- Open Mouth Cavity (Hidden until jaw drops) -->
    <path class="cow-mouth-cavity cow-dark-hole" d="M 37,76 C 37,92 63,92 63,76 Z" />

    <!-- Tongue (Scales up on hover inside the mouth cavity) -->
    <path class="cow-tongue" fill="currentColor" d="M 45,84 Q 50,81 55,84 Q 55,88 50,88 Q 45,88 45,84 Z" />

    <!-- Morphing Jaw / Lower Lip -->
    <!-- Managed entirely by CSS path 'd' attribute for silky smooth morph -->
    <path class="cow-jaw" fill="currentColor" />

  </svg>
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

// ============================================================
// Main Factory
// ============================================================

export function createFloatingIcon(options: FloatingIconOptions = {}): FloatingIconManager {
  let hostElement: HTMLElement | null = null;
  let shadowRoot: ShadowRoot | null = null;
  let containerElement: HTMLElement | null = null;
  let iconElement: HTMLElement | null = null;
  let tooltipElement: HTMLElement | null = null;
  let tooltipGreetingElement: HTMLElement | null = null;
  let tooltipListElement: HTMLElement | null = null;
  let tooltipSaveChip: HTMLButtonElement | null = null;
  let tooltipPersistChip: HTMLButtonElement | null = null;
  let tooltipNewChip: HTMLButtonElement | null = null;
  let tooltipState: FloatingIconTooltipState | null = null;
  let tooltipOpen = false;
  let tooltipAnimationTimer: ReturnType<typeof setTimeout> | null = null;
  let tooltipCloseTimer: ReturnType<typeof setTimeout> | null = null;

  let dialogElement: HTMLElement | null = null;
  let dialogTitleElement: HTMLElement | null = null;
  let dialogMessageElement: HTMLElement | null = null;
  let dialogOkButton: HTMLButtonElement | null = null;
  let rippleElement: HTMLElement | null = null;

  let workflowProgress: FloatingIconWorkflowProgress | null = null;
  let workflowControls: FloatingIconWorkflowControls | null = null;

  let progressOverlayElement: HTMLElement | null = null;
  let progressTimeElement: HTMLElement | null = null;
  let progressPercentElement: HTMLElement | null = null;
  let progressCountElement: HTMLElement | null = null;
  let progressRingFg: SVGCircleElement | null = null;

  let workflowControlsElement: HTMLElement | null = null;
  let pauseResumeButton: HTMLButtonElement | null = null;
  let stopButton: HTMLButtonElement | null = null;

  let isVisible = false;
  let isDragging = false;
  let hasDragged = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let currentBottom = options.initialBottom ?? 24;
  let currentRight = options.initialRight ?? 24;

  // Try to load saved position
  const savedPosition = loadSavedPosition();
  if (savedPosition) {
    currentBottom = savedPosition.bottom;
    currentRight = savedPosition.right;
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
    iconElement.innerHTML = RUMINER_ICON_SVG;

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

    const createActionRow = (params: {
      className: string;
      iconHtml: string;
      label: string;
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

      const stop = (e: Event) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      };
      btn.addEventListener('pointerdown', stop);
      btn.addEventListener('mousedown', stop);
      btn.addEventListener('touchstart', stop, { passive: false } as any);

      return btn;
    };

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
      tooltipSaveChip,
      tooltipPersistChip,
      tooltipNewChip,
    );
    tooltipElement.appendChild(tooltipListElement);
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
        <div class="floating-icon-progress-time"></div>
        <div class="floating-icon-progress-percent"></div>
        <div class="floating-icon-progress-count"></div>
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
    setTooltipOpen(false);

    container.appendChild(iconElement);
    shadowRoot.appendChild(container);

    // Remove entrance animation class after animation completes
    setTimeout(() => {
      iconElement?.classList.remove('entering');
      iconElement?.classList.add('breathing');
    }, 500);
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
    const maxRight = window.innerWidth - ICON_SIZE - 16;
    const maxBottom = window.innerHeight - ICON_SIZE - 16;

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
    updateWorkflowUi();
  }

  function setTooltipState(next: FloatingIconTooltipState | null): void {
    tooltipState = next;
    updateTooltipUi();
  }

  function setTooltipOpen(next: boolean): void {
    tooltipOpen = next;

    if (!tooltipElement || !iconElement) return;

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
    if (!iconElement || !tooltipElement) return;

    iconElement.addEventListener('pointerenter', () => {
      if (tooltipCloseTimer) {
        clearTimeout(tooltipCloseTimer);
        tooltipCloseTimer = null;
      }
      setTooltipOpen(true);
    });

    iconElement.addEventListener('pointerleave', (e: PointerEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && tooltipElement.contains(related)) return;
      scheduleTooltipClose();
    });

    tooltipElement.addEventListener('pointerenter', (e) => {
      e.stopPropagation();
      if (tooltipCloseTimer) {
        clearTimeout(tooltipCloseTimer);
        tooltipCloseTimer = null;
      }
      setTooltipOpen(true);
    });

    tooltipElement.addEventListener('pointerleave', (e: PointerEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && iconElement.contains(related)) return;
      scheduleTooltipClose();
    });
  }

  function updateTooltipUi(): void {
    if (!tooltipPersistChip || !tooltipNewChip || !tooltipSaveChip) return;

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

    syncTooltipAnimationVars();
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
    const totalCountText = p.total === null ? '--' : String(Math.max(0, Math.floor(p.total)));
    const finishedText = String(Math.max(0, Math.floor(p.finished)));
    const elapsedText = formatDurationShort(p.elapsedMs);
    const totalTimeText =
      p.estimatedTotalMs === null ? '--:--' : formatDurationShort(p.estimatedTotalMs);

    if (progressTimeElement) progressTimeElement.textContent = `${elapsedText}/${totalTimeText}`;
    if (progressPercentElement) progressPercentElement.textContent = `${pct}%`;
    if (progressCountElement)
      progressCountElement.textContent = `${finishedText}/${totalCountText}`;

    if (progressRingFg) {
      const r = 44;
      const c = 2 * Math.PI * r;
      const offset = c * (1 - pct / 100);
      progressRingFg.style.strokeDashoffset = `${offset}`;
    }

    const playSvg = /* html */ `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
    `;
    const pauseSvg = /* html */ `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="6" y="4" width="4" height="16"></rect>
        <rect x="14" y="4" width="4" height="16"></rect>
      </svg>
    `;
    const stopSvg = /* html */ `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="6" y="6" width="12" height="12" rx="2"></rect>
      </svg>
    `;

    if (pauseResumeButton) {
      pauseResumeButton.innerHTML = p.status === 'paused' ? playSvg : pauseSvg;
      pauseResumeButton.disabled =
        p.status === 'paused' ? !workflowControls?.onResume : !workflowControls?.onPause;
    }

    if (stopButton) {
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

  /**
   * Show the floating icon
   */
  function show(): void {
    if (isVisible) return;

    createShadowDOM();

    if (hostElement) {
      document.body.appendChild(hostElement);
      isVisible = true;
    }
  }

  /**
   * Hide the floating icon
   */
  function hide(): void {
    if (!isVisible || !iconElement || !hostElement) return;

    iconElement.classList.remove('breathing');
    iconElement.classList.add('exiting');

    setTimeout(() => {
      hostElement?.remove();
      isVisible = false;
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
    if (hostElement) {
      hostElement.remove();
      hostElement = null;
    }
    if (tooltipCloseTimer) clearTimeout(tooltipCloseTimer);
    tooltipCloseTimer = null;
    shadowRoot = null;
    containerElement = null;
    iconElement = null;
    tooltipElement = null;
    tooltipGreetingElement = null;
    tooltipListElement = null;
    tooltipSaveChip = null;
    tooltipPersistChip = null;
    tooltipNewChip = null;
    tooltipState = null;
    tooltipOpen = false;
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
    dispose,
  };
}
