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

  .floating-icon:hover {
    transform: scale(1.08) translateY(-4px);
    background: linear-gradient(145deg, #322d28 0%, #1e1b18 100%);
    border-color: rgba(229, 169, 61, 0.4);
    box-shadow:
      0 12px 32px rgba(229, 169, 61, 0.15),
      0 4px 12px rgba(0, 0, 0, 0.4);
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

  /* Tooltip */
  .floating-icon-tooltip {
    position: absolute;
    bottom: calc(100% + 14px);
    right: 0;
    padding: 6px 12px;
    background: #1e1b18;
    border: 1px solid rgba(255, 200, 100, 0.15);
    border-radius: 99px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    font-size: 12px;
    font-weight: 500;
    color: #f5e6d3;
    white-space: nowrap;
    opacity: 0;
    transform: translateY(8px) scale(0.95);
    pointer-events: none;
    transition:
      opacity 0.2s ease,
      transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    z-index: 1;
  }

  .floating-icon:hover .floating-icon-tooltip {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  /* Reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .floating-icon, .floating-icon:hover, .floating-icon-svg, 
    .cow-jaw, .cow-tongue, .cow-mouth-cavity, .aura-group, .aura-line {
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

// ============================================================
// Main Factory
// ============================================================

export function createFloatingIcon(options: FloatingIconOptions = {}): FloatingIconManager {
  let hostElement: HTMLElement | null = null;
  let shadowRoot: ShadowRoot | null = null;
  let containerElement: HTMLElement | null = null;
  let iconElement: HTMLElement | null = null;
  let tooltipElement: HTMLElement | null = null;
  let rippleElement: HTMLElement | null = null;

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

    // Create tooltip
    tooltipElement = document.createElement('div');
    tooltipElement.className = 'floating-icon-tooltip';
    tooltipElement.textContent = 'Ruminer is Here, At Your Service!';
    iconElement.appendChild(tooltipElement);

    // Add event listeners
    setupEventListeners(iconElement);

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

    triggerRipple();
    options.onClick?.();
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
    shadowRoot = null;
    containerElement = null;
    iconElement = null;
    tooltipElement = null;
    rippleElement = null;
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
    dispose,
  };
}
