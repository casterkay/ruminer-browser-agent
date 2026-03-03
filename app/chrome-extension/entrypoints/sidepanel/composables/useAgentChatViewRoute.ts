/**
 * Composable for managing AgentChat view routing.
 *
 * Handles navigation between 'sessions' (list) and 'chat' (conversation) views
 * without requiring vue-router. Supports URL parameters for deep linking.
 *
 * View state is persisted to chrome.storage.local so it survives side-panel
 * close/reopen. URL parameters take priority over stored state (deep links).
 *
 * URL Parameters:
 * - `view`: 'sessions' | 'chat' (default: 'sessions')
 * - `sessionId`: Session ID to open directly in chat view
 *
 * Example URLs:
 * - `sidepanel.html?tab=agent-chat` → sessions list
 * - `sidepanel.html?tab=agent-chat&view=chat&sessionId=xxx` → direct to chat
 */
import { ref, computed } from 'vue';

// =============================================================================
// Types
// =============================================================================

/** Available view modes */
export type AgentChatView = 'sessions' | 'chat';

/** Route state */
export interface AgentChatRouteState {
  view: AgentChatView;
  sessionId: string | null;
}

/** Options for useAgentChatViewRoute */
export interface UseAgentChatViewRouteOptions {
  /**
   * Callback when route changes.
   * Called after internal state is updated.
   */
  onRouteChange?: (state: AgentChatRouteState) => void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_VIEW: AgentChatView = 'sessions';
const URL_PARAM_VIEW = 'view';
const URL_PARAM_SESSION_ID = 'sessionId';
const STORAGE_KEY_VIEW_STATE = 'agent-chat-view-state';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse view from URL parameter.
 * Returns default if invalid.
 */
function parseView(value: string | null): AgentChatView {
  if (value === 'sessions' || value === 'chat') {
    return value;
  }
  return DEFAULT_VIEW;
}

/**
 * Persist view state to chrome.storage.local so it survives panel close/reopen.
 */
async function saveViewState(view: AgentChatView, sessionId: string | null): Promise<void> {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY_VIEW_STATE]: { view, sessionId },
    });
  } catch {
    // Non-fatal — storage unavailable in some environments
  }
}

/**
 * Load persisted view state from chrome.storage.local.
 * Returns null if nothing was saved.
 */
async function loadViewState(): Promise<AgentChatRouteState | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_VIEW_STATE);
    const stored = result[STORAGE_KEY_VIEW_STATE];
    if (stored && (stored.view === 'sessions' || stored.view === 'chat')) {
      return { view: stored.view, sessionId: stored.sessionId ?? null };
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Update URL parameters without page reload.
 * Preserves existing parameters (like `tab`).
 */
function updateUrlParams(view: AgentChatView, sessionId: string | null): void {
  try {
    const url = new URL(window.location.href);

    // Update view param
    if (view === DEFAULT_VIEW) {
      url.searchParams.delete(URL_PARAM_VIEW);
    } else {
      url.searchParams.set(URL_PARAM_VIEW, view);
    }

    // Update sessionId param
    if (sessionId) {
      url.searchParams.set(URL_PARAM_SESSION_ID, sessionId);
    } else {
      url.searchParams.delete(URL_PARAM_SESSION_ID);
    }

    // Update URL without reload
    window.history.replaceState({}, '', url.toString());
  } catch {
    // Ignore URL update errors (e.g., in non-browser environment)
  }
}

// =============================================================================
// Composable
// =============================================================================

export function useAgentChatViewRoute(options: UseAgentChatViewRouteOptions = {}) {
  // ==========================================================================
  // State
  // ==========================================================================

  const currentView = ref<AgentChatView>(DEFAULT_VIEW);
  const currentSessionId = ref<string | null>(null);

  // ==========================================================================
  // Computed
  // ==========================================================================

  /** Whether currently showing sessions list */
  const isSessionsView = computed(() => currentView.value === 'sessions');

  /** Whether currently showing chat conversation */
  const isChatView = computed(() => currentView.value === 'chat');

  /** Current route state */
  const routeState = computed<AgentChatRouteState>(() => ({
    view: currentView.value,
    sessionId: currentSessionId.value,
  }));

  // ==========================================================================
  // Actions
  // ==========================================================================

  /**
   * Navigate to sessions list view.
   * Clears sessionId from URL.
   */
  function goToSessions(): void {
    currentView.value = 'sessions';
    // Don't clear sessionId internally - it's used to highlight selected session
    updateUrlParams('sessions', null);
    saveViewState('sessions', currentSessionId.value);
    options.onRouteChange?.(routeState.value);
  }

  /**
   * Navigate to chat view for a specific session.
   * @param sessionId - Session ID to open
   */
  function goToChat(sessionId: string): void {
    if (!sessionId) {
      console.warn('[useAgentChatViewRoute] goToChat called without sessionId');
      return;
    }

    currentView.value = 'chat';
    currentSessionId.value = sessionId;
    updateUrlParams('chat', sessionId);
    saveViewState('chat', sessionId);
    options.onRouteChange?.(routeState.value);
  }

  /**
   * Initialize route state.
   *
   * Priority:
   * 1. URL parameters — explicit deep link (e.g. from Apply button)
   * 2. chrome.storage.local — restore view from last session
   * 3. Default ('sessions')
   *
   * Should be called on mount after sessions are loaded.
   * @returns Initial route state
   */
  async function initFromUrl(): Promise<AgentChatRouteState> {
    try {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get(URL_PARAM_VIEW);
      const sessionIdParam = params.get(URL_PARAM_SESSION_ID);

      // URL params present → deep link takes full priority
      if (viewParam !== null || sessionIdParam !== null) {
        const view = parseView(viewParam);
        const sessionId = sessionIdParam?.trim() || null;

        // chat view requires a sessionId
        if (view === 'chat' && !sessionId) {
          currentView.value = 'sessions';
          currentSessionId.value = null;
        } else {
          currentView.value = view;
          currentSessionId.value = sessionId;
        }
        return routeState.value;
      }

      // No URL params → restore from storage
      const stored = await loadViewState();
      if (stored) {
        currentView.value = stored.view;
        currentSessionId.value = stored.sessionId;
        // Sync URL to match restored state so deep links stay coherent
        updateUrlParams(stored.view, stored.view === 'chat' ? stored.sessionId : null);
        return routeState.value;
      }
    } catch {
      // Fall through to default
    }

    currentView.value = DEFAULT_VIEW;
    currentSessionId.value = null;
    return routeState.value;
  }

  /**
   * Update session ID without changing view.
   * Updates URL based on current view and sessionId:
   * - In chat view: always update URL with sessionId
   * - In sessions view with null sessionId: clear sessionId from URL (cleanup)
   */
  function setSessionId(sessionId: string | null): void {
    currentSessionId.value = sessionId;

    if (currentView.value === 'chat') {
      // In chat view, always sync URL with current sessionId
      updateUrlParams('chat', sessionId);
    } else if (sessionId === null) {
      // In sessions view, clear any stale sessionId from URL
      // This handles edge cases like deleting the last session
      updateUrlParams('sessions', null);
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  // Note: We don't call initFromUrl() here because AgentChat.vue needs to
  // call it after loading sessions (to verify sessionId exists).
  // Caller is responsible for calling initFromUrl() at the right time.

  // ==========================================================================
  // Return
  // ==========================================================================

  return {
    // State
    currentView,
    currentSessionId,

    // Computed
    isSessionsView,
    isChatView,
    routeState,

    // Actions
    goToSessions,
    goToChat,
    initFromUrl,
    setSessionId,
  };
}

// =============================================================================
// Type Export
// =============================================================================

export type UseAgentChatViewRoute = ReturnType<typeof useAgentChatViewRoute>;
