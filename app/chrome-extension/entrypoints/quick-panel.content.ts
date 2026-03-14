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
  type FloatingIconWorkflowProgress,
  type QuickPanelAgentBridge,
  type QuickPanelLauncherManager,
} from '@/shared/quick-panel';

import { inferPlatformFromUrl } from '@/common/chat-platforms';

import {
  BACKGROUND_MESSAGE_TYPES,
  type QuickPanelGetBrandingMessage,
  type QuickPanelGetBrandingResponse,
} from '@/common/message-types';

import {
  RR_V3_PORT_NAME,
  createRpcRequest,
  isRpcResponse,
  type RpcMethod,
} from '@/entrypoints/background/record-replay-v3/engine/transport/rpc';

/** Storage key for floating icon preference */
const STORAGE_KEY_FLOATING_ICON = 'floatingIconEnabled';

/** Default value when none is set */
const DEFAULT_FLOATING_ICON_ENABLED = true;

const STORAGE_KEY_QP_PERSIST_ENABLED = 'quick-panel-persist-enabled';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    let floatingIcon: FloatingIconManager | null = null;
    let launcher: QuickPanelLauncherManager | null = null;
    let agentBridge: QuickPanelAgentBridge | null = null;
    let workflowControlRunId: string | null = null;
    let persistEnabled = false;
    let isAutomationWorkflowTab = false;
    let automationSeedProgress: FloatingIconWorkflowProgress | null = null;
    let ephemeralSessionId: string | null = null;
    let ephemeralDeleteTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTooltipUrl = '';
    let lastIngestOpenedSessionId: string | null = null;
    let lastIngestOpenedAt = 0;

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
          onExpandedChange: (expanded) => {
            if (ephemeralDeleteTimer) {
              clearTimeout(ephemeralDeleteTimer);
              ephemeralDeleteTimer = null;
            }

            if (expanded) return;
            if (persistEnabled) return;

            const current = launcher?.getActiveSessionId() || null;
            if (!current) return;

            ephemeralSessionId = current;

            // Grace period to avoid deleting on hover jitter.
            ephemeralDeleteTimer = setTimeout(() => {
              ephemeralDeleteTimer = null;
              if (persistEnabled) return;
              if (!ephemeralSessionId) return;
              void deleteSessionBestEffort(ephemeralSessionId);
              ephemeralSessionId = null;
            }, 5000);
          },
        });
        launcher.mount();
      }

      refreshBranding();
      return launcher;
    }

    function platformLabelFromUrl(url: string): string | null {
      const p = inferPlatformFromUrl(url);
      if (p === 'chatgpt') return 'ChatGPT';
      if (p === 'claude') return 'Claude';
      if (p === 'gemini') return 'Gemini';
      if (p === 'deepseek') return 'DeepSeek';
      return null;
    }

    async function loadPersistPreference(): Promise<boolean> {
      try {
        const result = await chrome.storage.local.get(STORAGE_KEY_QP_PERSIST_ENABLED);
        return result?.[STORAGE_KEY_QP_PERSIST_ENABLED] === true;
      } catch {
        return false;
      }
    }

    async function setPersistPreference(nextEnabled: boolean): Promise<void> {
      persistEnabled = nextEnabled;
      try {
        await chrome.storage.local.set({ [STORAGE_KEY_QP_PERSIST_ENABLED]: nextEnabled });
      } catch {
        // ignore
      }
      if (ephemeralDeleteTimer) {
        clearTimeout(ephemeralDeleteTimer);
        ephemeralDeleteTimer = null;
      }
      refreshTooltipState();
    }

    async function deleteSessionBestEffort(sessionId: string): Promise<void> {
      const id = String(sessionId || '').trim();
      if (!id) return;
      try {
        const bridge = ensureBridge();
        await bridge.deleteSession(id);
      } catch {
        // ignore
      }
    }

    function refreshTooltipState(): void {
      if (!floatingIcon) return;
      if (isAutomationWorkflowTab) {
        floatingIcon.setTooltipState(null);
        return;
      }

      const platformLabel = platformLabelFromUrl(location.href);

      floatingIcon.setTooltipState({
        platformLabel,
        persistEnabled,
        onSaveChat: platformLabel
          ? () => {
              void chrome.runtime
                .sendMessage({
                  type: 'ruminer.import_current_conversation',
                  payload: { url: location.href },
                })
                .catch((e) => {
                  const msg = e instanceof Error ? e.message : String(e);
                  floatingIcon?.showDialog({
                    kind: 'error',
                    title: 'Import Current Conversation',
                    message: msg || 'Failed to start import',
                  });
                });
            }
          : undefined,
        onTogglePersist: (nextEnabled) => {
          void (async () => {
            // Turning off persistence: delete the currently active session from DB.
            if (!nextEnabled && persistEnabled) {
              const currentSessionId = launcher?.getActiveSessionId() || null;
              if (currentSessionId) {
                const resp = await ensureBridge().deleteSession(currentSessionId);
                if (!resp.success) {
                  floatingIcon?.showDialog({
                    kind: 'error',
                    title: 'Persist Quick Chat',
                    message: resp.error || 'Failed to delete session',
                  });
                  return;
                }
              }

              ephemeralSessionId = null;
            }

            if (nextEnabled) {
              ephemeralSessionId = null;
            }

            await setPersistPreference(nextEnabled);
          })();
        },
        onNewQuickChat: () => {
          void (async () => {
            await initFloatingIcon({ force: true });
            if (!floatingIcon) return;
            const ui = ensureLauncher();

            // If persistence is off, clean up the previous ephemeral session before creating a new one.
            if (!persistEnabled && ephemeralSessionId) {
              void deleteSessionBestEffort(ephemeralSessionId);
              ephemeralSessionId = null;
            }

            const resp = await ui.newQuickChat({ focus: true });
            if (!resp.success) {
              floatingIcon?.showDialog({
                kind: 'error',
                title: 'New Quick Chat',
                message: resp.error || 'Failed to create quick chat',
              });
              return;
            }

            if (!persistEnabled) {
              ephemeralSessionId = ui.getActiveSessionId();
            }

            refreshBranding();
          })();
        },
      });
    }

    async function syncAutomationTabState(): Promise<void> {
      // Only workflows that seed the floating icon progress UI run on known chat platforms.
      const platform = inferPlatformFromUrl(location.href);
      if (!platform) {
        isAutomationWorkflowTab = false;
        automationSeedProgress = null;
        return;
      }

      try {
        const resp = (await chrome.runtime.sendMessage({
          type: 'ruminer.automation_tabs.get',
        })) as any;
        const enabled = resp?.ok === true && resp?.result?.enabled === true;
        isAutomationWorkflowTab = enabled;
        const progress = resp?.result?.progress;
        automationSeedProgress =
          enabled && progress && typeof progress.runId === 'string' ? (progress as any) : null;
      } catch {
        isAutomationWorkflowTab = false;
        automationSeedProgress = null;
      }
    }

    async function rrv3Request(method: RpcMethod, params?: Record<string, unknown>): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        const port = chrome.runtime.connect({ name: RR_V3_PORT_NAME });
        const req = createRpcRequest(method, (params ?? {}) as any);

        const cleanup = () => {
          try {
            port.onMessage.removeListener(onMessage);
          } catch {
            // ignore
          }
          try {
            port.onDisconnect.removeListener(onDisconnect);
          } catch {
            // ignore
          }
          try {
            port.disconnect();
          } catch {
            // ignore
          }
        };

        const onDisconnect = () => {
          cleanup();
          const msg = chrome.runtime.lastError?.message || 'RR-V3 port disconnected';
          reject(new Error(msg));
        };

        const onMessage = (message: unknown) => {
          if (!isRpcResponse(message)) return;
          if (message.requestId !== req.requestId) return;
          cleanup();
          if (message.ok) resolve();
          else reject(new Error(message.error || 'RR-V3 request failed'));
        };

        port.onDisconnect.addListener(onDisconnect);
        port.onMessage.addListener(onMessage);

        try {
          port.postMessage(req);
        } catch (e) {
          cleanup();
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    }

    function ensureWorkflowControls(runId: string): void {
      const rid = String(runId || '').trim();
      if (!rid) return;
      if (!floatingIcon) return;
      if (workflowControlRunId === rid) return;
      workflowControlRunId = rid;

      floatingIcon.setWorkflowControls({
        onPause: () => {
          void rrv3Request('rr_v3.pauseRun', { runId: rid }).catch((e) =>
            console.warn('[QuickPanelContentScript] pauseRun failed:', e),
          );
        },
        onResume: () => {
          void rrv3Request('rr_v3.resumeRun', { runId: rid }).catch((e) =>
            console.warn('[QuickPanelContentScript] resumeRun failed:', e),
          );
        },
        onStop: () => {
          void rrv3Request('rr_v3.cancelRun', {
            runId: rid,
            reason: 'Canceled by user (floating icon)',
          }).catch((e) => console.warn('[QuickPanelContentScript] cancelRun failed:', e));
        },
      });
    }

    /**
     * Initialize floating icon
     */
    async function initFloatingIcon(options?: { force?: boolean }): Promise<void> {
      await syncAutomationTabState();

      // Check if enabled
      const enabled =
        isAutomationWorkflowTab || options?.force === true ? true : await isFloatingIconEnabled();
      if (!enabled) return;
      if (floatingIcon) {
        // A workflow tab may become "automation" after initial mount (best-effort).
        if (isAutomationWorkflowTab) {
          launcher?.dispose();
          launcher = null;
          floatingIcon.setTooltipState(null);
          if (automationSeedProgress) {
            if (automationSeedProgress.runId) ensureWorkflowControls(automationSeedProgress.runId);
            floatingIcon.setWorkflowProgress(automationSeedProgress);
          } else {
            floatingIcon.setWorkflowProgress({
              runId: '',
              status: 'running',
              percent: 0,
              finished: 0,
              total: null,
              elapsedMs: 0,
              estimatedTotalMs: null,
            });
          }
        }
        return;
      }

      persistEnabled = await loadPersistPreference();

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
      if (isAutomationWorkflowTab) {
        floatingIcon.setTooltipState(null);
        if (automationSeedProgress) {
          if (automationSeedProgress.runId) ensureWorkflowControls(automationSeedProgress.runId);
          floatingIcon.setWorkflowProgress(automationSeedProgress);
        } else {
          floatingIcon.setWorkflowProgress({
            runId: '',
            status: 'running',
            percent: 0,
            finished: 0,
            total: null,
            elapsedMs: 0,
            estimatedTotalMs: null,
          });
        }
      } else {
        ensureLauncher();
        refreshTooltipState();
      }

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
        if (isAutomationWorkflowTab) return;
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

      if (STORAGE_KEY_QP_PERSIST_ENABLED in changes) {
        persistEnabled = changes[STORAGE_KEY_QP_PERSIST_ENABLED].newValue === true;
        refreshTooltipState();
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

      if (msg?.action === 'ruminer_workflow_progress') {
        const payload = (message as any)?.payload as FloatingIconWorkflowProgress | undefined;
        void (async () => {
          try {
            await initFloatingIcon({ force: true });
            if (!floatingIcon) throw new Error('Floating icon is disabled');
            if (!payload || typeof payload.runId !== 'string') return;
            if (isAutomationWorkflowTab) {
              launcher?.dispose();
              launcher = null;
              floatingIcon.setTooltipState(null);
            }
            ensureWorkflowControls(payload.runId);
            floatingIcon.setWorkflowProgress(payload);
          } catch (err) {
            console.warn('[QuickPanelContentScript] Workflow progress error:', err);
          } finally {
            sendResponse({ success: true });
          }
        })();
        return true;
      }

      if (msg?.action === 'ruminer_workflow_clear') {
        void (async () => {
          try {
            floatingIcon?.setWorkflowProgress(null);
            floatingIcon?.setWorkflowControls(null);
            workflowControlRunId = null;
            await syncAutomationTabState();
            if (!isAutomationWorkflowTab && floatingIcon) {
              ensureLauncher();
              refreshTooltipState();
            }
          } catch (err) {
            console.warn('[QuickPanelContentScript] Workflow clear error:', err);
          } finally {
            sendResponse({ success: true });
          }
        })();
        return true;
      }

      if (msg?.action === 'ruminer_ingest_current_conversation_succeeded') {
        const payload = (message as any)?.payload as any;
        void (async () => {
          try {
            await initFloatingIcon({ force: true });
            if (!floatingIcon) throw new Error('Floating icon is disabled');
            const sessionId =
              typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : '';
            if (!sessionId) throw new Error('Missing sessionId from ingest result');

            const now = Date.now();
            if (lastIngestOpenedSessionId === sessionId && now - lastIngestOpenedAt < 2000) {
              sendResponse({ success: true, deduped: true });
              return;
            }
            lastIngestOpenedSessionId = sessionId;
            lastIngestOpenedAt = now;

            const ui = ensureLauncher();

            // Replace any previous ephemeral session if persistence is off.
            if (!persistEnabled && ephemeralSessionId && ephemeralSessionId !== sessionId) {
              void deleteSessionBestEffort(ephemeralSessionId);
              ephemeralSessionId = null;
            }

            const opened = await ui.openSession(sessionId, { focus: false });
            if (!opened.success) {
              throw new Error(opened.error || 'Failed to open imported session');
            }

            if (!persistEnabled) ephemeralSessionId = sessionId;
            else ephemeralSessionId = null;

            refreshBranding();
            refreshTooltipState();
            floatingIcon.hideDialog();
            sendResponse({ success: true });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            floatingIcon?.showDialog({
              kind: 'error',
              title: 'Import Current Conversation',
              message: msg || 'Import failed',
            });
            sendResponse({ success: false, error: msg });
          }
        })();
        return true;
      }

      if (msg?.action === 'ruminer_ingest_current_conversation_failed') {
        const payload = (message as any)?.payload as any;
        void (async () => {
          await initFloatingIcon({ force: true });
          const errMsg =
            typeof payload?.error === 'string'
              ? payload.error
              : typeof (message as any)?.error === 'string'
                ? (message as any).error
                : 'Import failed';
          floatingIcon?.showDialog({
            kind: 'error',
            title: 'Import Current Conversation',
            message: errMsg,
          });
          sendResponse({ success: true });
        })();
        return true;
      }

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

    // Keep tooltip up to date for SPAs (URL changes without full reload)
    const urlPoller = setInterval(() => {
      const u = location.href;
      if (u !== lastTooltipUrl) {
        lastTooltipUrl = u;
        refreshTooltipState();
      }
    }, 800);

    // Cleanup when the document is being unloaded (policy-safe on modern pages)
    window.addEventListener('pagehide', () => {
      clearInterval(urlPoller);
      if (ephemeralDeleteTimer) {
        clearTimeout(ephemeralDeleteTimer);
        ephemeralDeleteTimer = null;
      }
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.storage.onChanged.removeListener(handleStorageChange);
      launcher?.dispose();
      launcher = null;
      agentBridge?.dispose();
      agentBridge = null;

      // Best-effort: don't leave ephemeral sessions around when persistence is off.
      if (!persistEnabled && ephemeralSessionId) {
        void deleteSessionBestEffort(ephemeralSessionId);
        ephemeralSessionId = null;
      }
      if (floatingIcon) {
        floatingIcon.setWorkflowProgress(null);
        floatingIcon.setWorkflowControls(null);
        floatingIcon.dispose();
        floatingIcon = null;
      }
    });
  },
});
