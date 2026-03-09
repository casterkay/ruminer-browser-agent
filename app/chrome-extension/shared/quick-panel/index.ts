/**
 * Quick Panel Entry Point
 *
 * This module provides the main controller for Quick Panel functionality.
 * It orchestrates:
 * - Shadow DOM host management
 * - AI Chat panel lifecycle
 * - Agent bridge communication
 * - Keyboard shortcut handling (external)
 *
 * Usage in content script:
 * ```typescript
 * import { createQuickPanelController } from './quick-panel';
 *
 * const controller = createQuickPanelController();
 *
 * // Show panel (e.g., on keyboard shortcut)
 * controller.show();
 *
 * // Hide panel
 * controller.hide();
 *
 * // Toggle visibility
 * controller.toggle();
 *
 * // Cleanup on unload
 * controller.dispose();
 * ```
 */

import { createAgentBridge, type QuickPanelAgentBridge } from './core/agent-bridge';
import {
  mountQuickPanelAiChatPanel,
  mountQuickPanelShadowHost,
  type QuickPanelAiChatPanelManager,
  type QuickPanelShadowHostManager,
} from './ui';

// ============================================================
// Types
// ============================================================

export interface QuickPanelControllerOptions {
  /** Custom host element ID for Shadow DOM. Default: '__mcp_quick_panel_host__' */
  hostId?: string;
  /** Custom z-index for overlay. Default: 2147483647 (highest possible) */
  zIndex?: number;
  /** Panel title. Default: 'Agent' */
  title?: string;
  /** Panel subtitle. Default: 'Quick Panel' */
  subtitle?: string;
  /** Input placeholder. Default: 'Ask the agent...' */
  placeholder?: string;
  /** Optional brand icon URL shown in the header (engine icon). */
  brandIconUrl?: string;
}

export interface QuickPanelController {
  /** Show the Quick Panel (creates if not exists) */
  show: () => void;
  /** Hide the Quick Panel (disposes UI but keeps bridge alive) */
  hide: () => void;
  /** Toggle Quick Panel visibility */
  toggle: () => void;
  /** Check if panel is currently visible */
  isVisible: () => boolean;
  /** Update header branding (title/subtitle/icon) without remounting. */
  setBranding: (branding: {
    title?: string;
    subtitle?: string;
    brandIconUrl?: string;
    engineName?: string;
  }) => void;
  /** Fully dispose all resources */
  dispose: () => void;
}

// ============================================================
// Constants
// ============================================================

const LOG_PREFIX = '[QuickPanelController]';

// ============================================================
// Main Factory
// ============================================================

/**
 * Create a Quick Panel controller instance.
 *
 * The controller manages the full lifecycle of the Quick Panel UI,
 * including Shadow DOM isolation, AI chat interface, and background
 * communication.
 *
 * @example
 * ```typescript
 * // In content script
 * const quickPanel = createQuickPanelController();
 *
 * // Listen for keyboard shortcut (e.g., Cmd+Shift+K)
 * document.addEventListener('keydown', (e) => {
 *   if (e.metaKey && e.shiftKey && e.key === 'k') {
 *     e.preventDefault();
 *     quickPanel.toggle();
 *   }
 * });
 *
 * // Cleanup on extension unload
 * window.addEventListener('unload', () => {
 *   quickPanel.dispose();
 * });
 * ```
 */
export function createQuickPanelController(
  options: QuickPanelControllerOptions = {},
): QuickPanelController {
  let disposed = false;

  let branding: { title?: string; subtitle?: string; brandIconUrl?: string; engineName?: string } =
    {
      title: options.title,
      subtitle: options.subtitle,
      brandIconUrl: options.brandIconUrl,
    };

  // Shared agent bridge (persists across show/hide cycles)
  let agentBridge: QuickPanelAgentBridge | null = null;

  // UI components (created on show, disposed on hide)
  let shadowHost: QuickPanelShadowHostManager | null = null;
  let chatPanel: QuickPanelAiChatPanelManager | null = null;

  /**
   * Ensure agent bridge is initialized
   */
  function ensureBridge(): QuickPanelAgentBridge {
    if (!agentBridge || agentBridge.isDisposed()) {
      agentBridge = createAgentBridge();
    }
    return agentBridge;
  }

  /**
   * Dispose current UI (keeps bridge alive for potential reuse)
   */
  function disposeUI(): void {
    if (chatPanel) {
      try {
        chatPanel.dispose();
      } catch (err) {
        console.warn(`${LOG_PREFIX} Error disposing chat panel:`, err);
      }
      chatPanel = null;
    }

    if (shadowHost) {
      try {
        shadowHost.dispose();
      } catch (err) {
        console.warn(`${LOG_PREFIX} Error disposing shadow host:`, err);
      }
      shadowHost = null;
    }
  }

  /**
   * Show the Quick Panel
   */
  function show(): void {
    if (disposed) {
      console.warn(`${LOG_PREFIX} Cannot show - controller is disposed`);
      return;
    }

    // Already visible
    if (chatPanel && shadowHost?.getElements()) {
      chatPanel.focusInput();
      return;
    }

    // Clean up any stale UI
    disposeUI();

    // Create shadow host
    shadowHost = mountQuickPanelShadowHost({
      hostId: options.hostId,
      zIndex: options.zIndex,
    });

    const elements = shadowHost.getElements();
    if (!elements) {
      console.error(`${LOG_PREFIX} Failed to create shadow host elements`);
      disposeUI();
      return;
    }

    // Ensure bridge is ready
    const bridge = ensureBridge();

    // Create chat panel
    chatPanel = mountQuickPanelAiChatPanel({
      mount: elements.root,
      agentBridge: bridge,
      title: branding.title ?? options.title,
      subtitle: branding.subtitle ?? options.subtitle,
      brandIconUrl: branding.brandIconUrl ?? options.brandIconUrl,
      engineName: branding.engineName,
      placeholder: options.placeholder,
      autoFocus: true,
      onRequestClose: () => hide(),
    });
  }

  function setBranding(next: {
    title?: string;
    subtitle?: string;
    brandIconUrl?: string;
    engineName?: string;
  }): void {
    const patch: { title?: string; subtitle?: string; brandIconUrl?: string; engineName?: string } =
      {};

    if (typeof next?.title === 'string') patch.title = next.title;
    if (typeof next?.subtitle === 'string') patch.subtitle = next.subtitle;
    if (typeof next?.brandIconUrl === 'string') patch.brandIconUrl = next.brandIconUrl;
    if (typeof next?.engineName === 'string') patch.engineName = next.engineName;

    branding = { ...branding, ...patch };

    if (chatPanel) {
      try {
        chatPanel.setBranding(next);
      } catch (err) {
        console.warn(`${LOG_PREFIX} Error applying branding:`, err);
      }
    }
  }

  /**
   * Hide the Quick Panel
   */
  function hide(): void {
    if (disposed) return;
    disposeUI();
  }

  /**
   * Toggle Quick Panel visibility
   */
  function toggle(): void {
    if (disposed) return;

    if (isVisible()) {
      hide();
    } else {
      show();
    }
  }

  /**
   * Check if panel is currently visible
   */
  function isVisible(): boolean {
    return chatPanel !== null && shadowHost?.getElements() !== null;
  }

  /**
   * Fully dispose all resources
   */
  function dispose(): void {
    if (disposed) return;
    disposed = true;

    disposeUI();

    if (agentBridge) {
      try {
        agentBridge.dispose();
      } catch (err) {
        console.warn(`${LOG_PREFIX} Error disposing agent bridge:`, err);
      }
      agentBridge = null;
    }
  }

  return {
    show,
    hide,
    toggle,
    isVisible,
    setBranding,
    dispose,
  };
}

// ============================================================
// Re-exports for convenience
// ============================================================

// Core types
export {
  DEFAULT_SCOPE,
  normalizeQuickPanelScope,
  normalizeSearchQuery,
  parseScopePrefixedQuery,
  QUICK_PANEL_SCOPES,
} from './core/types';

export type {
  Action,
  ActionContext,
  ActionTone,
  ParsedScopeQuery,
  QuickPanelIcon,
  QuickPanelScope,
  QuickPanelScopeDefinition,
  QuickPanelState,
  QuickPanelView,
  SearchProvider,
  SearchProviderContext,
  SearchQuery,
  SearchResult,
} from './core/types';

// Agent bridge
export { createAgentBridge } from './core/agent-bridge';
export type {
  AgentBridgeOptions,
  QuickPanelAgentBridge,
  RequestEventListener,
} from './core/agent-bridge';

// UI Components
export {
  createQuickEntries,
  createQuickPanelLauncher,
  createQuickPanelMessageRenderer,
  // Search UI
  createSearchInput,
  // AI Chat
  mountQuickPanelAiChatPanel,
  // Shadow host
  mountQuickPanelShadowHost,
  // Panel shell (unified container)
  mountQuickPanelShell,
  // Styles
  QUICK_PANEL_STYLES,
} from './ui';

export type {
  // Quick entries
  QuickEntriesManager,
  QuickEntriesOptions,
  // AI Chat
  QuickPanelAiChatPanelManager,
  QuickPanelAiChatPanelOptions,
  QuickPanelAiChatPanelState,
  // Hover launcher
  QuickPanelLauncherBranding,
  QuickPanelLauncherManager,
  QuickPanelLauncherOptions,
  QuickPanelMessageRenderer,
  QuickPanelMessageRendererOptions,
  // Shadow host
  QuickPanelShadowHostElements,
  QuickPanelShadowHostManager,
  QuickPanelShadowHostOptions,
  // Panel shell
  QuickPanelShellElements,
  QuickPanelShellManager,
  QuickPanelShellOptions,
  // Search input
  SearchInputManager,
  SearchInputOptions,
  SearchInputState,
} from './ui';

// Search Engine
export { SearchEngine } from './core/search-engine';
export type {
  SearchEngineOptions,
  SearchEngineRequest,
  SearchEngineResponse,
  SearchProviderError,
} from './core/search-engine';

// Search Providers
export { createTabsProvider } from './providers';
export type { TabsProviderOptions, TabsSearchResultData } from './providers';

// Floating Icon
export { createFloatingIcon } from './ui/floating-icon';
export type { FloatingIconManager, FloatingIconOptions } from './ui/floating-icon';
