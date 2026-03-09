/**
 * Quick Panel Content Script
 *
 * This content script manages the Quick Panel AI Chat feature on web pages.
 * It responds to:
 * - Background messages (toggle_quick_panel from keyboard shortcut)
 * - Direct programmatic calls
 *
 * The Quick Panel provides a floating AI chat interface that:
 * - Uses Shadow DOM for style isolation
 * - Streams AI responses in real-time
 * - Supports keyboard shortcuts (Enter to send, Esc to close)
 * - Collects page context (URL, selection) automatically
 */

import {
  createAgentBridge,
  createFloatingIcon,
  createQuickPanelLauncher,
  type FloatingIconManager,
  type QuickPanelAgentBridge,
  type QuickPanelLauncherManager,
} from '@/shared/quick-panel';

import {
  BACKGROUND_MESSAGE_TYPES,
  type QuickPanelGetBrandingMessage,
  type QuickPanelGetBrandingResponse,
} from '@/common/message-types';

/** Storage key for floating icon preference */
const STORAGE_KEY_FLOATING_ICON = 'floatingIconEnabled';

/** Default value when none is set */
const DEFAULT_FLOATING_ICON_ENABLED = true;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    let floatingIcon: FloatingIconManager | null = null;
    let launcher: QuickPanelLauncherManager | null = null;
    let agentBridge: QuickPanelAgentBridge | null = null;

    async function resolveSelectedEngineBranding(): Promise<{
      engineDisplayName: string;
      brandIconUrl: string;
      engineName: string;
    }> {
      try {
        const response = (await chrome.runtime.sendMessage({
          type: BACKGROUND_MESSAGE_TYPES.QUICK_PANEL_GET_BRANDING,
        } satisfies QuickPanelGetBrandingMessage)) as QuickPanelGetBrandingResponse;

        if (response?.success) {
          return {
            engineDisplayName: response.engineDisplayName || 'Agent',
            brandIconUrl: response.brandIconUrl || '',
            engineName: response.engineName || '',
          };
        }
      } catch {
        // ignore
      }

      return { engineDisplayName: 'Agent', brandIconUrl: '', engineName: '' };
    }

    function refreshBranding(): void {
      if (!launcher) return;

      void resolveSelectedEngineBranding().then(({ engineDisplayName, brandIconUrl }) => {
        launcher?.setBranding({ engineDisplayName, brandIconUrl });
      });
    }

    /**
     * Check if floating icon is enabled
     */
    async function isFloatingIconEnabled(): Promise<boolean> {
      try {
        const result = await chrome.storage.local.get(STORAGE_KEY_FLOATING_ICON);
        return result[STORAGE_KEY_FLOATING_ICON] ?? DEFAULT_FLOATING_ICON_ENABLED;
      } catch {
        return DEFAULT_FLOATING_ICON_ENABLED;
      }
    }

    /**
     * Ensure controller is initialized (lazy initialization)
     */
    function ensureBridge(): QuickPanelAgentBridge {
      if (!agentBridge || agentBridge.isDisposed()) {
        agentBridge = createAgentBridge();
      }
      return agentBridge;
    }

    function ensureLauncher(): QuickPanelLauncherManager {
      if (!floatingIcon) {
        throw new Error('Floating icon not initialized');
      }

      if (!launcher) {
        launcher = createQuickPanelLauncher({
          floatingIcon,
          agentBridge: ensureBridge(),
          placeholder: 'Ask about this page…',
          maxRecentMessages: 10,
        });
        launcher.mount();
      }

      refreshBranding();
      return launcher;
    }

    /**
     * Initialize floating icon
     */
    async function initFloatingIcon(options?: { force?: boolean }): Promise<void> {
      // Check if enabled
      const enabled = options?.force === true ? true : await isFloatingIconEnabled();
      if (!enabled) return;
      if (floatingIcon) return;

      floatingIcon = createFloatingIcon({
        initialBottom: 24,
        initialRight: 24,
        onClick: () => {
          const bridge = ensureBridge();
          void bridge.openSidepanel();
          launcher?.collapse({ force: true });
        },
      });

      // Show the floating icon
      floatingIcon.show();
      ensureLauncher();

      // Initial pulse after a delay to draw attention
      setTimeout(() => {
        floatingIcon?.pulse();
      }, 2000);
    }

    /**
     * Handle storage changes (for toggling floating icon)
     */
    function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }): void {
      if (STORAGE_KEY_FLOATING_ICON in changes) {
        const enabled =
          changes[STORAGE_KEY_FLOATING_ICON].newValue ?? DEFAULT_FLOATING_ICON_ENABLED;
        if (enabled) {
          if (!floatingIcon) {
            initFloatingIcon();
          }
        } else {
          launcher?.dispose();
          launcher = null;
          if (floatingIcon) {
            floatingIcon.dispose();
            floatingIcon = null;
          }
        }
      }
    }

    // Initialize floating icon on load
    initFloatingIcon();

    // Listen for storage changes
    chrome.storage.onChanged.addListener(handleStorageChange);

    /**
     * Handle messages from background script
     */
    function handleMessage(
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ): boolean | void {
      const msg = message as { action?: string } | undefined;

      if (msg?.action === 'toggle_quick_panel') {
        void (async () => {
          try {
            await initFloatingIcon({ force: true });
            if (!floatingIcon) throw new Error('Floating icon is disabled');
            const ui = ensureLauncher();
            ui.toggle({ focus: true });
            sendResponse({ success: true, visible: ui.isExpanded() });
          } catch (err) {
            console.error('[QuickPanelContentScript] Toggle error:', err);
            sendResponse({ success: false, error: String(err) });
          }
        })();
        return true; // Async response
      }

      if (msg?.action === 'show_quick_panel') {
        void (async () => {
          try {
            await initFloatingIcon({ force: true });
            if (!floatingIcon) throw new Error('Floating icon is disabled');
            const ui = ensureLauncher();
            ui.expand({ focus: true });
            sendResponse({ success: true });
          } catch (err) {
            console.error('[QuickPanelContentScript] Show error:', err);
            sendResponse({ success: false, error: String(err) });
          }
        })();
        return true;
      }

      if (msg?.action === 'hide_quick_panel') {
        try {
          launcher?.collapse({ force: true });
          sendResponse({ success: true });
        } catch (err) {
          console.error('[QuickPanelContentScript] Hide error:', err);
          sendResponse({ success: false, error: String(err) });
        }
        return true;
      }

      if (msg?.action === 'get_quick_panel_status') {
        sendResponse({
          success: true,
          visible: launcher?.isExpanded() ?? false,
          initialized: launcher !== null,
        });
        return true;
      }

      // Not handled
      return false;
    }

    // Register message listener
    chrome.runtime.onMessage.addListener(handleMessage);

    // Cleanup when the document is being unloaded (policy-safe on modern pages)
    window.addEventListener('pagehide', () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.storage.onChanged.removeListener(handleStorageChange);
      launcher?.dispose();
      launcher = null;
      agentBridge?.dispose();
      agentBridge = null;
      if (floatingIcon) {
        floatingIcon.dispose();
        floatingIcon = null;
      }
    });
  },
});
