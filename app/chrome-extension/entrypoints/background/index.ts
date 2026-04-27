import { NOTIFICATIONS } from '@/common/constants';
import { cleanupModelCache } from '@/utils/semantic-similarity-engine';
import { initElementMarkerListeners } from './element-marker';
import { initNativeHostListener } from './native-host';
import { initQuickPanelAgentHandler } from './quick-panel/agent-handler';
import { initQuickPanelCommands } from './quick-panel/commands';
import { initQuickPanelTabsHandler } from './quick-panel/tabs-handler';
import { initRecordReplayListeners } from './record-replay';
import { initIngestWorkflowRpc } from './record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/ingest-workflow-rpc';
import { enqueueRun } from './record-replay-v3/engine/queue/enqueue-run';
import {
  initSemanticSimilarityListener,
  initializeSemanticEngineIfCached,
} from './semantic-similarity';
import { initStorageManagerListener } from './storage-manager';
import { openAgentChatSidepanel } from './utils/sidepanel';
import { initWebEditorListeners } from './web-editor';
import { assertWorkflowAccess, initWorkflowAccessListener } from './workflow-access';

// Record-Replay V3 (feature flag)
import { bootstrapV3 } from './record-replay-v3/bootstrap';

const SIDEPANEL_CONTEXT_MENU_ID = 'ruminer_open_sidepanel';
const IMPORT_CURRENT_CONVERSATION_CONTEXT_MENU_ID = 'ruminer_import_current_conversation';
const IMPORT_CURRENT_DOCUMENT_URL_PATTERNS = [
  'https://chatgpt.com/*',
  'https://chat.openai.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
  'https://chat.deepseek.com/*',
  'https://grok.com/*',
  'https://x.com/i/grok*',
];

let ensureContextMenusPromise: Promise<void> | null = null;

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
  initWorkflowAccessListener();
  initIngestWorkflowRpc();
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

  // Content-script shortcut: run Import Current Conversation from floating tooltip chip
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    const msg = message as { type?: string; payload?: { url?: unknown } } | undefined;
    if (msg?.type !== 'ruminer.import_current_conversation') return false;

    const tab = sender?.tab;
    if (!tab?.id) {
      sendResponse({ ok: false, error: 'This action must be triggered from a tab.' });
      return true;
    }

    const urlFromPayload = typeof msg.payload?.url === 'string' ? msg.payload.url.trim() : '';
    const url = urlFromPayload || (typeof tab.url === 'string' ? tab.url.trim() : '');

    void importCurrentConversationFromTab({ ...tab, url }).then(
      () => sendResponse({ ok: true }),
      (e) => {
        const err = e instanceof Error ? e.message : String(e);
        sendResponse({ ok: false, error: err || 'Failed to queue workflow' });
      },
    );

    return true;
  });
});

/**
 * Initialize a single context menu entry for opening the sidepanel
 * Replaces the previous element-marker and web-editor context menus
 */
function initSidepanelContextMenu(): void {
  if (!chrome.contextMenus?.create) return;

  // Create the context menu immediately on startup
  createSidepanelContextMenu();

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

    if (info.menuItemId === IMPORT_CURRENT_CONVERSATION_CONTEXT_MENU_ID && tab?.id) {
      void importCurrentConversationFromTab(tab).catch((e) => {
        console.warn('[ContextMenu] Import Current Conversation failed:', e);
      });
    }
  });
}

async function notify(title: string, message: string): Promise<void> {
  try {
    await chrome.notifications.create({
      type: NOTIFICATIONS.TYPE,
      iconUrl: chrome.runtime.getURL('icon/128.png'),
      title,
      message,
      priority: NOTIFICATIONS.PRIORITY,
    });
  } catch {
    // ignore (notifications permission may be absent or blocked)
  }
}

async function importCurrentConversationFromTab(tab: chrome.tabs.Tab): Promise<void> {
  await assertWorkflowAccess();

  const tabId = tab.id;
  if (typeof tabId !== 'number' || !Number.isFinite(tabId)) return;

  const url = typeof tab.url === 'string' ? tab.url.trim() : '';
  if (!url) {
    await notify('Import Current Conversation', 'This tab has no URL.');
    return;
  }

  const runtime = await bootstrapV3();

  try {
    const result = await enqueueRun(
      { storage: runtime.storage, events: runtime.events, scheduler: runtime.scheduler },
      {
        flowId: 'auto.conversation_ingest.v1' as any,
        tabId,
        args: { ruminerConversationUrl: url } as any,
        maxAttempts: 1,
        priority: 0,
      },
    );
    await notify('Import Current Conversation', `Queued (runId=${result.runId})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await notify('Import Current Conversation', msg || 'Failed to queue workflow');
    throw e;
  }
}

async function ensureContextMenuItem(
  spec: chrome.contextMenus.CreateProperties & { id: string },
): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.contextMenus.create(spec, () => {
      if (!chrome.runtime.lastError) {
        resolve();
        return;
      }

      const msg = String(chrome.runtime.lastError.message || '');
      // If it already exists (service worker restart / races), update it instead of erroring.
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already exists')) {
        chrome.contextMenus.update(spec.id, spec, () => {
          const _ = chrome.runtime.lastError;
          resolve();
        });
        return;
      }

      // Otherwise best-effort remove then create again.
      chrome.contextMenus.remove(spec.id, () => {
        const _ = chrome.runtime.lastError;
        chrome.contextMenus.create(spec, () => {
          const __ = chrome.runtime.lastError;
          resolve();
        });
      });
    });
  });
}

/**
 * Create/recreate the sidepanel context menu
 */
function createSidepanelContextMenu(): void {
  if (!ensureContextMenusPromise) {
    ensureContextMenusPromise = (async () => {
      await ensureContextMenuItem({
        id: SIDEPANEL_CONTEXT_MENU_ID,
        title: 'Open Sidepanel',
        contexts: ['all'],
      });

      await ensureContextMenuItem({
        id: IMPORT_CURRENT_CONVERSATION_CONTEXT_MENU_ID,
        title: 'Import Current Conversation',
        contexts: ['page'],
        documentUrlPatterns: IMPORT_CURRENT_DOCUMENT_URL_PATTERNS,
      });
    })().finally(() => {
      ensureContextMenusPromise = null;
    });
  }

  void ensureContextMenusPromise.catch((e) => {
    console.warn('[ContextMenu] ensure menus failed:', e);
  });
}
