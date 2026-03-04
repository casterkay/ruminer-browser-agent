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
  createFloatingIcon,
  createQuickPanelController,
  type FloatingIconManager,
  type QuickPanelController,
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
    console.log('[QuickPanelContentScript] Content script loaded on:', window.location.href);
    let controller: QuickPanelController | null = null;
    let floatingIcon: FloatingIconManager | null = null;

    async function resolveSelectedEngineBranding(): Promise<{
      subtitle: string;
      brandIconUrl: string;
    }> {
      try {
        const response = (await chrome.runtime.sendMessage({
          type: BACKGROUND_MESSAGE_TYPES.QUICK_PANEL_GET_BRANDING,
        } satisfies QuickPanelGetBrandingMessage)) as QuickPanelGetBrandingResponse;

        if (response?.success) {
          return {
            subtitle: response.engineDisplayName || 'Agent',
            brandIconUrl: response.brandIconUrl || '',
          };
        }
      } catch {
        // ignore
      }

      return { subtitle: 'Agent', brandIconUrl: '' };
    }

    function refreshBranding(): void {
      if (!controller) return;

      void resolveSelectedEngineBranding().then(({ subtitle, brandIconUrl }) => {
        controller?.setBranding({ subtitle, brandIconUrl });
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
    function ensureController(): QuickPanelController {
      if (!controller) {
        controller = createQuickPanelController({
          title: 'Ruminer Browser Agent',
          subtitle: 'Agent',
          placeholder: 'Ask about this page...',
          brandIconUrl: '',
        });
      }
      refreshBranding();
      return controller;
    }

    /**
     * Initialize floating icon
     */
    async function initFloatingIcon(): Promise<void> {
      // Check if enabled
      const enabled = await isFloatingIconEnabled();
      if (!enabled) {
        console.log('[QuickPanelContentScript] Floating icon disabled');
        return;
      }

      if (floatingIcon) return;

      floatingIcon = createFloatingIcon({
        initialBottom: 24,
        initialRight: 24,
        onClick: () => {
          const ctrl = ensureController();
          refreshBranding();
          ctrl.toggle();
        },
        onPositionChange: (position) => {
          console.log('[QuickPanelContentScript] Icon moved to:', position);
        },
      });

      // Show the floating icon
      floatingIcon.show();

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
        console.log('[QuickPanelContentScript] Received toggle_quick_panel message');
        try {
          const ctrl = ensureController();
          refreshBranding();
          ctrl.toggle();
          const visible = ctrl.isVisible();
          console.log('[QuickPanelContentScript] Toggle completed, visible:', visible);
          sendResponse({ success: true, visible });
        } catch (err) {
          console.error('[QuickPanelContentScript] Toggle error:', err);
          sendResponse({ success: false, error: String(err) });
        }
        return true; // Async response
      }

      if (msg?.action === 'show_quick_panel') {
        try {
          const ctrl = ensureController();
          refreshBranding();
          ctrl.show();
          sendResponse({ success: true });
        } catch (err) {
          console.error('[QuickPanelContentScript] Show error:', err);
          sendResponse({ success: false, error: String(err) });
        }
        return true;
      }

      if (msg?.action === 'hide_quick_panel') {
        try {
          if (controller) {
            controller.hide();
          }
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
          visible: controller?.isVisible() ?? false,
          initialized: controller !== null,
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
      if (controller) {
        controller.dispose();
        controller = null;
      }
      if (floatingIcon) {
        floatingIcon.dispose();
        floatingIcon = null;
      }
    });
  },
});
