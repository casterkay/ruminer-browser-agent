import { cleanupModelCache } from '@/utils/semantic-similarity-engine';
import { initElementMarkerListeners } from './element-marker';
import { initNativeHostListener } from './native-host';
import { initQuickPanelAgentHandler } from './quick-panel/agent-handler';
import { initQuickPanelCommands } from './quick-panel/commands';
import { initQuickPanelTabsHandler } from './quick-panel/tabs-handler';
import { initRecordReplayListeners } from './record-replay';
import {
  initSemanticSimilarityListener,
  initializeSemanticEngineIfCached,
} from './semantic-similarity';
import { initStorageManagerListener } from './storage-manager';
import { openAgentChatSidepanel } from './utils/sidepanel';
import { initWebEditorListeners } from './web-editor';

// Record-Replay V3 (feature flag)
import { bootstrapV3 } from './record-replay-v3/bootstrap';

const SIDEPANEL_CONTEXT_MENU_ID = 'ruminer_open_sidepanel';

/**
 * Feature flag for RR-V3
 * Set to true to enable the new Record-Replay V3 engine
 */
const ENABLE_RR_V3 = true;

/**
 * Background script entry point
 * Initializes all background services and listeners
 */
export default defineBackground(() => {
  // Extension button opens sidepanel directly (no popup)
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn('[Sidepanel] setPanelBehavior failed:', err));

  // Open welcome page on first install
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      // Open the welcome/onboarding page for new installations
      chrome.tabs.create({
        url: chrome.runtime.getURL('/welcome.html'),
      });
    }
  });

  // Initialize core services
  initNativeHostListener();
  initSemanticSimilarityListener();
  initStorageManagerListener();
  // Record & Replay V1/V2 listeners
  initRecordReplayListeners();

  // Record & Replay V3 (new engine)
  if (ENABLE_RR_V3) {
    bootstrapV3()
      .then((runtime) => {
        console.log(`[RR-V3] Bootstrap complete, ownerId: ${runtime.ownerId}`);
      })
      .catch((error) => {
        console.error('[RR-V3] Bootstrap failed:', error);
      });
  }

  // Element marker: context menu + CRUD listeners
  initElementMarkerListeners();
  // Web editor: toggle edit-mode overlay
  initWebEditorListeners();
  // Quick Panel: send messages to AgentChat via background-stream bridge
  initQuickPanelAgentHandler();
  // Quick Panel: tabs search bridge for content script UI
  initQuickPanelTabsHandler();
  // Quick Panel: keyboard shortcut handler
  initQuickPanelCommands();
  // Conditionally initialize semantic similarity engine if model cache exists
  initializeSemanticEngineIfCached()
    .then((initialized) => {
      if (initialized) {
        console.log('Background: Semantic similarity engine initialized from cache');
      } else {
        console.log(
          'Background: Semantic similarity engine initialization skipped (no cache found)',
        );
      }
    })
    .catch((error) => {
      console.warn('Background: Failed to conditionally initialize semantic engine:', error);
    });

  // Initial cleanup on startup
  cleanupModelCache().catch((error) => {
    console.warn('Background: Initial context cleanup failed:', error);
  });

  // Single context menu entry to open sidepanel
  initSidepanelContextMenu();
});

/**
 * Initialize a single context menu entry for opening the sidepanel
 * Replaces the previous element-marker and web-editor context menus
 */
function initSidepanelContextMenu(): void {
  if (!chrome.contextMenus?.create) return;

  // Create the context menu immediately on startup
  createSidepanelContextMenu();

  // Also recreate on install/update to ensure it's always there
  chrome.runtime.onInstalled.addListener(() => {
    createSidepanelContextMenu();
  });

  // Handle click
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === SIDEPANEL_CONTEXT_MENU_ID && tab?.id) {
      // Open must happen synchronously - pass tab info and let the function handle both sync and async parts
      const sidePanel = chrome.sidePanel as any;
      if (sidePanel?.open) {
        // Try immediate synchronous open first
        try {
          sidePanel.open({ tabId: tab.id });
        } catch (e) {
          console.warn('[Sidepanel] Synchronous open failed:', e);
          // Fallback to windowId if available
          if (typeof tab.windowId === 'number') {
            try {
              sidePanel.open({ windowId: tab.windowId });
            } catch (e2) {
              console.error('[Sidepanel] Window open also failed:', e2);
            }
          }
        }
      }
      // Also run the async setup (setOptions)
      openAgentChatSidepanel(tab.id, tab.windowId);
    }
  });
}

/**
 * Create/recreate the sidepanel context menu
 */
function createSidepanelContextMenu(): void {
  // Remove any existing menu with our ID first, then create
  chrome.contextMenus.remove(SIDEPANEL_CONTEXT_MENU_ID, () => {
    // Clear the error (menu may not exist)
    const _ = chrome.runtime.lastError;
    // Create the menu
    chrome.contextMenus.create(
      {
        id: SIDEPANEL_CONTEXT_MENU_ID,
        title: 'Open Sidepanel',
        contexts: ['all'],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            '[Sidepanel] Failed to create context menu:',
            chrome.runtime.lastError.message,
          );
        } else {
          console.log('[Sidepanel] Context menu created successfully');
        }
      },
    );
  });
}
