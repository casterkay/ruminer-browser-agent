import {
  createAgentBridge,
  createFloatingIcon,
  createQuickPanelLauncher,
  type FloatingIconManager,
  type QuickPanelAgentBridge,
  type QuickPanelLauncherManager,
} from '@/shared/quick-panel';
// Branding is resolved via the Quick Panel agent bridge.
import { createApp } from 'vue';
import App from './App.vue';

// Tailwind first, then custom tokens
import '../styles/tailwind.css';

createApp(App).mount('#app');

const STORAGE_KEY_FLOATING_ICON_SIZE = 'floatingIconSize';
const STORAGE_KEY_QP_PERSIST_ENABLED = 'quick-panel-persist-enabled';

// Inject floating icon on the welcome page (non-blocking)
void (async () => {
  try {
    let floatingIcon: FloatingIconManager | null = null;
    let launcher: QuickPanelLauncherManager | null = null;
    let agentBridge: QuickPanelAgentBridge | null = null;
    let persistEnabled = false;
    let pendingDeleteSessionId: string | null = null;
    let pendingDeleteTimer: ReturnType<typeof setTimeout> | null = null;
    let currentEngineName = '';
    let currentEngineDisplayName = 'Claude Code';
    let currentEngineIconUrl = '';

    const tabContext: { tabId?: number; windowId?: number } = {};

    function ensureBridge(): QuickPanelAgentBridge {
      if (!agentBridge || agentBridge.isDisposed()) {
        agentBridge = createAgentBridge();
      }
      return agentBridge;
    }

    async function resolveSelectedEngineBranding(): Promise<{
      engineDisplayName: string;
      brandIconUrl: string;
      engineName: string;
    }> {
      try {
        const sessionId = launcher?.getActiveSessionId?.() || undefined;
        const response = await ensureBridge().getBranding(sessionId ? { sessionId } : undefined);

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
      void resolveSelectedEngineBranding().then(
        ({ engineName, engineDisplayName, brandIconUrl }) => {
          currentEngineName = engineName || '';
          currentEngineDisplayName = engineDisplayName || 'Agent';
          currentEngineIconUrl = brandIconUrl || '';
          launcher?.setBranding({
            engineDisplayName: currentEngineDisplayName,
            brandIconUrl: currentEngineIconUrl,
          });
          refreshTooltipState();
        },
      );
    }

    function ensureLauncher(): QuickPanelLauncherManager {
      if (!floatingIcon) throw new Error('Floating icon not initialized');

      if (!launcher) {
        launcher = createQuickPanelLauncher({
          floatingIcon,
          agentBridge: ensureBridge(),
          placeholder: 'Ask Ruminer…',
          maxRecentMessages: 10,
          onSessionChange: () => {
            refreshBranding();
          },
          onExpandedChange: (expanded) => {
            if (pendingDeleteTimer) {
              clearTimeout(pendingDeleteTimer);
              pendingDeleteTimer = null;
            }

            if (expanded) {
              refreshBranding();
              refreshTooltipState();
              return;
            }
            if (!pendingDeleteSessionId) return;

            const idToDelete = pendingDeleteSessionId;
            pendingDeleteTimer = setTimeout(() => {
              pendingDeleteTimer = null;
              if (persistEnabled) return;
              if (!idToDelete) return;
              void deleteSessionBestEffort(idToDelete);
              if (pendingDeleteSessionId === idToDelete) pendingDeleteSessionId = null;
            }, 800);
          },
        });
        launcher.mount();
      }

      refreshBranding();
      return launcher;
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
      if (pendingDeleteTimer) {
        clearTimeout(pendingDeleteTimer);
        pendingDeleteTimer = null;
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
      const activeSessionId = launcher?.getActiveSessionId?.() || null;
      const messageCount = launcher?.exportTranscript?.()?.length ?? 0;
      const canConfigureEngine =
        !!activeSessionId && launcher?.isQuickSession?.() === true && messageCount === 0;

      floatingIcon.setTooltipState({
        platformLabel: null,
        persistEnabled,
        engineName: currentEngineName,
        engineDisplayName: currentEngineDisplayName,
        onSetEngine: canConfigureEngine
          ? (nextEngineName) => {
              void (async () => {
                const resp = await ensureBridge().setSessionEngine({
                  sessionId: activeSessionId,
                  engineName: nextEngineName as any,
                });

                if (!resp.success) {
                  floatingIcon?.showDialog({
                    kind: 'error',
                    title: 'Switch Engine',
                    message: resp.error || 'Failed to switch engine',
                  });
                  return;
                }

                currentEngineName = resp.engineName;
                currentEngineDisplayName = resp.engineDisplayName;
                currentEngineIconUrl = resp.brandIconUrl;
                launcher?.setBranding({
                  engineDisplayName: currentEngineDisplayName,
                  brandIconUrl: currentEngineIconUrl,
                });
                refreshTooltipState();
              })();
            }
          : undefined,
        onTogglePersist: (nextEnabled) => {
          void (async () => {
            const wasEnabled = persistEnabled;

            if (nextEnabled) {
              const sessionId =
                launcher?.isQuickSession?.() === true
                  ? launcher?.getActiveSessionId() || null
                  : null;
              const messages = launcher?.exportTranscript?.() || [];

              if (sessionId) {
                const resp = await ensureBridge().persistSession({
                  sessionId,
                  name: 'Quick Chat (Welcome)',
                  messages,
                });

                if (!resp.success) {
                  floatingIcon?.showDialog({
                    kind: 'error',
                    title: 'Persist Quick Chat',
                    message: resp.error || 'Failed to persist session',
                  });
                  return;
                }
              }

              pendingDeleteSessionId = null;
              await setPersistPreference(true);
              return;
            }

            if (!nextEnabled && wasEnabled) {
              const currentSessionId =
                launcher?.isQuickSession?.() === true
                  ? launcher?.getActiveSessionId() || null
                  : null;
              if (currentSessionId) pendingDeleteSessionId = currentSessionId;
            }

            await setPersistPreference(false);

            if (!(launcher?.isExpanded() ?? false) && pendingDeleteSessionId) {
              if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer);
              const idToDelete = pendingDeleteSessionId;
              pendingDeleteTimer = setTimeout(() => {
                pendingDeleteTimer = null;
                if (persistEnabled) return;
                if (!idToDelete) return;
                void deleteSessionBestEffort(idToDelete);
                if (pendingDeleteSessionId === idToDelete) pendingDeleteSessionId = null;
              }, 800);
            }
          })();
        },
        onNewQuickChat: () => {
          void (async () => {
            if (!floatingIcon) return;
            const ui = ensureLauncher();

            const resp = await ui.newQuickChat({ focus: true });
            if (!resp.success) {
              floatingIcon?.showDialog({
                kind: 'error',
                title: 'New Quick Chat',
                message: resp.error || 'Failed to create quick chat',
              });
              return;
            }

            refreshBranding();
          })();
        },
      });
    }

    function resolveWelcomeTabContext(): Promise<void> {
      return new Promise((resolve) => {
        try {
          if (chrome?.tabs?.getCurrent) {
            chrome.tabs.getCurrent((tab) => {
              if (tab && typeof tab.id === 'number') tabContext.tabId = tab.id;
              if (tab && typeof tab.windowId === 'number') tabContext.windowId = tab.windowId;
              resolve();
            });
            return;
          }
        } catch {
          // ignore
        }

        try {
          if (chrome?.tabs?.query) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              const tab = tabs?.[0];
              if (tab && typeof tab.id === 'number') tabContext.tabId = tab.id;
              if (tab && typeof tab.windowId === 'number') tabContext.windowId = tab.windowId;
              resolve();
            });
            return;
          }
        } catch {
          // ignore
        }

        resolve();
      });
    }

    // Try to read persisted size so the welcome page icon matches user preference
    let size: number | undefined = undefined;
    try {
      const r = await chrome.storage.local.get(STORAGE_KEY_FLOATING_ICON_SIZE);
      const s = r?.[STORAGE_KEY_FLOATING_ICON_SIZE];
      if (typeof s === 'number' && !Number.isNaN(s)) size = Math.round(s);
    } catch {
      // ignore
    }

    await resolveWelcomeTabContext();
    persistEnabled = await loadPersistPreference();

    floatingIcon = createFloatingIcon({
      initialBottom: 24,
      initialRight: 24,
      size,
      onClick: () => {
        const bridge = ensureBridge();
        void bridge
          .openSidepanel({
            tabId: tabContext.tabId,
            windowId: tabContext.windowId,
          })
          .then((resp) => {
            if (!resp.success) {
              floatingIcon?.showDialog({
                kind: 'error',
                title: 'Open Side Panel',
                message: resp.error || 'Failed to open side panel',
              });
            }
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            floatingIcon?.showDialog({
              kind: 'error',
              title: 'Open Side Panel',
              message: msg || 'Failed to open side panel',
            });
          });

        launcher?.collapse({ force: true });
      },
    });

    floatingIcon.show();
    ensureLauncher();
    refreshTooltipState();

    setTimeout(() => {
      floatingIcon?.pulse();
    }, 1200);
  } catch (e) {
    // If anything fails (e.g. missing APIs in a test environment), fail silently
    // and log for diagnostics.
    console.warn('[welcome] Floating icon init failed:', e);
  }
})();
