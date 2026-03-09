/**
 * Quick Panel Launcher (Hover Expand)
 *
 * A lightweight, glassy “quick ask” UI that expands from the floating icon:
 * - Hover icon (or programmatic open) -> expand input bar to the left
 * - Show recent messages above with an upward fade-out mask
 * - Click icon -> open sidepanel (handled by content script via floating icon onClick)
 *
 * This intentionally avoids the old center-screen panel UI.
 */

import type { AgentMessage, RealtimeEvent } from 'chrome-mcp-shared';

import type { QuickPanelAgentBridge } from '../core/agent-bridge';
import type { FloatingIconManager } from './floating-icon';
import { QUICK_PANEL_STYLES } from './styles';

// ============================================================
// Types
// ============================================================

export interface QuickPanelLauncherBranding {
  engineDisplayName?: string;
  brandIconUrl?: string;
  sessionName?: string;
}

export interface QuickPanelLauncherOptions {
  floatingIcon: FloatingIconManager;
  agentBridge: QuickPanelAgentBridge;
  placeholder?: string;
  maxRecentMessages?: number;
}

export interface QuickPanelLauncherManager {
  /** Ensure DOM is mounted into floating icon shadow root. */
  mount: () => void;
  /** Expand the launcher UI. */
  expand: (options?: { focus?: boolean }) => void;
  /** Collapse the launcher UI. */
  collapse: (options?: { force?: boolean }) => void;
  /** Toggle expanded state. */
  toggle: (options?: { focus?: boolean }) => void;
  /** Whether the launcher is expanded. */
  isExpanded: () => boolean;
  /** Update engine/session branding. */
  setBranding: (branding: QuickPanelLauncherBranding) => void;
  /** Dispose DOM and listeners. */
  dispose: () => void;
}

interface QueuedMessage {
  id: string;
  text: string;
}

// ============================================================
// Styling
// ============================================================

const LAUNCHER_WIDTH = 394;
const LAUNCHER_HEIGHT = 600;
const ICON_WIDTH_PLUS_GAP = 74;

const QUICK_LAUNCHER_STYLES = /* css */ `
  ${QUICK_PANEL_STYLES}

  .qp-quick-launcher {
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0px;
    user-select: none;
    -webkit-user-select: none;
  }

  .qp-quick-launcher[data-expanded='true'] {
    width: min(${LAUNCHER_WIDTH}px, 100vw - 80px);
    gap: 10px;
  }

  .qp-quick-launcher-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  /* Keep the icon + input on one visual axis. The icon's hover translateY causes a vertical misalignment/jump
     when the launcher expands from hover, so we override it inside the launcher. */
  .qp-quick-launcher .floating-icon:hover {
    transform: scale(1.06);
  }

  /* Glass tokens (dark, page-agnostic) */
  .qp-quick-launcher {
    /* Match floating icon palette: rich charcoal + warm gold */
    --qp-glass-bg: rgba(23, 21, 19, 0.54);
    --qp-glass-bg-strong: rgba(42, 38, 34, 0.64);
    --qp-glass-border: rgba(255, 200, 100, 0.15);
    --qp-glass-border-strong: rgba(229, 169, 61, 0.32);
    --qp-glass-highlight: rgba(255, 255, 255, 0.06);

    --qp-text: rgba(255, 248, 240, 0.94);
    --qp-text-subtle: rgba(255, 248, 240, 0.7);
    --qp-placeholder: rgba(255, 248, 240, 0.44);

    --qp-accent: #e0a026;
    --qp-accent-2: #d97757;
    --qp-danger: #ef4444;
    --qp-success: #22c55e;
    --qp-shadow:
      0 18px 50px rgba(0, 0, 0, 0.35),
      0 2px 10px rgba(0, 0, 0, 0.25);
  }

  .qp-glass {
    background: linear-gradient(145deg, var(--qp-glass-bg-strong), var(--qp-glass-bg));
    border: 1px solid var(--qp-glass-border);
    box-shadow: var(--qp-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(18px) saturate(1.35);
    -webkit-backdrop-filter: blur(18px) saturate(1.35);
  }

  /* Messages */
  .qp-quick-launcher-messages {
    width: 100%;
    max-width: 0px;
    max-height: 0px;
    opacity: 0;
    transform: translate3d(0, 10px, 0);
    overflow: hidden;
    pointer-events: none;
    transition:
      max-width 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
      max-height 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 280ms ease,
      transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .qp-quick-launcher[data-expanded='true'] .qp-quick-launcher-messages {
    opacity: 1;
    transform: translate3d(0, 0, 0);
    pointer-events: auto;
  }

  .qp-quick-launcher-messages-scroll {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    height: 100%;
    padding: 14px 6px 6px 6px;
    scrollbar-width: none;

    /* Mask is applied dynamically via JS (updateScrollMask) based on scroll position. */
    mask-repeat: no-repeat;
    -webkit-mask-repeat: no-repeat;
  }

  .qp-quick-launcher-messages-scroll::-webkit-scrollbar {
    display: none;
  }

  /* Push messages to the bottom when they don't fill the container,
     without using justify-content: flex-end (which breaks overflow scrolling). */
  .qp-quick-launcher-messages-scroll::before {
    content: '';
    flex: 1;
  }

  .qp-quick-launcher-msg {
    width: fit-content;
    max-width: 100%;
    border-radius: 14px;
    padding: 9px 12px 4px 12px;
    color: var(--qp-text);
    line-height: 1.35;
    letter-spacing: 0.15px;
    font-size: 12px;
    font-weight: 400;
    position: relative;
    background: linear-gradient(145deg, var(--qp-glass-bg-strong), var(--qp-glass-bg));
    border: 1px solid var(--qp-glass-border);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.33), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .qp-quick-launcher-msg[data-role='user'] {
    align-self: flex-end;
    background: linear-gradient(145deg, rgba(100, 72, 22, 0.72), rgba(80, 58, 18, 0.62));
    border: 1px solid rgba(229, 169, 61, 0.48);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.33), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .qp-quick-launcher-msg[data-role='assistant'] {
    align-self: flex-start;
  }

  .qp-quick-launcher-msg--queued {
    opacity: 0.68;
    border-style: dashed;
  }

  .qp-quick-launcher-queued-dot {
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: rgba(255, 200, 100, 0.5);
    flex-shrink: 0;
  }

  .qp-quick-launcher-msg-remove {
    border: none;
    background: transparent;
    padding: 1px 3px;
    cursor: pointer;
    color: rgba(255, 100, 100, 0.5);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: color 120ms ease, background 120ms ease;
    line-height: 1;
  }

  .qp-quick-launcher-msg-remove:hover {
    color: rgba(239, 68, 68, 0.95);
    background: rgba(239, 68, 68, 0.12);
  }

  .qp-quick-launcher-msg-text {
    white-space: pre-wrap;
    word-break: break-word;
    text-shadow: 0 1px 12px rgba(0, 0, 0, 0.38);
  }

  .qp-quick-launcher-msg-meta {
    margin-top: 5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: rgba(255, 255, 255, 0.38);
    font-size: 10.5px;
    font-weight: 300;
    letter-spacing: 0.1px;
  }

  .qp-quick-launcher-stream-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--qp-accent);
    box-shadow: 0 0 0 2px rgba(229, 169, 61, 0.18), 0 0 18px rgba(229, 169, 61, 0.25);
    animation: qp-stream-pulse 900ms ease-in-out infinite;
  }

  @keyframes qp-stream-pulse {
    0%,
    100% {
      transform: scale(0.9);
      opacity: 0.65;
    }
    50% {
      transform: scale(1.1);
      opacity: 1;
    }
  }

  .qp-quick-launcher[data-expanded='true'] .qp-quick-launcher-pill {
    max-height: 48px;
    padding: 6px 10px;
    opacity: 1;
    transform: translate3d(0, 0, 0);
    pointer-events: auto;

    border-width: 1px !important;
    box-shadow: var(--qp-shadow) !important;
    background: linear-gradient(180deg, var(--qp-glass-bg-strong), var(--qp-glass-bg)) !important;
    backdrop-filter: blur(18px) saturate(1.7) brightness(1.03) !important;
    -webkit-backdrop-filter: blur(18px) saturate(1.7) brightness(1.03) !important;
  }

  /* Input */
  .qp-quick-launcher-input {
    width: 0;
    opacity: 0;
    transform: translate3d(18px, 0, 0) scale(0.98);
    overflow: hidden;
    pointer-events: none;
    transition:
      max-width 240ms cubic-bezier(0.2, 0.8, 0.2, 1),
      max-height 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 160ms ease,
      transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .qp-quick-launcher[data-expanded='true'] .qp-quick-launcher-input {
    width: ${LAUNCHER_WIDTH - ICON_WIDTH_PLUS_GAP}px;
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
    pointer-events: auto;
    /* Avoid clipping the inner glass border on high-DPR fractional pixels */
    overflow: visible;
  }

  .qp-quick-launcher-input-shell {
    border-radius: 24px;
    padding: 4px 5px 4px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
    transition:
      border-color 160ms ease,
      box-shadow 180ms ease,
      background 180ms ease;
  }

  .qp-quick-launcher-input-shell:focus-within {
    border-color: var(--qp-glass-border-strong);
    box-shadow:
      var(--qp-shadow),
      0 0 0 4px rgba(229, 169, 61, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .qp-quick-launcher-input-area {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .qp-quick-launcher-textarea {
    width: 100%;
    resize: none;
    border: none;
    outline: none;
    background: transparent;
    color: var(--qp-text);
    font-family: var(--ac-font-body, ui-sans-serif, system-ui);
    font-size: 13px;
    line-height: 18px;
    min-height: 18px;
    padding: 0;
    margin: 0;
    caret-color: var(--qp-accent);
  }

  .qp-quick-launcher-textarea::placeholder {
    color: rgba(255, 248, 240, 0.44);
  }

  .qp-quick-launcher-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .qp-quick-launcher-btn {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    border: 1px solid rgba(255, 200, 100, 0.18);
    background: rgba(255, 255, 255, 0.06);
    color: var(--qp-text);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1),
      background 140ms ease,
      border-color 140ms ease,
      opacity 140ms ease;
  }

  .qp-quick-launcher-btn:hover {
    transform: translate3d(0, -1px, 0) scale(1.02);
    background: rgba(255, 255, 255, 0.09);
    border-color: rgba(229, 169, 61, 0.35);
  }

  .qp-quick-launcher-btn:active {
    transform: scale(0.96);
  }

  .qp-quick-launcher-btn[disabled] {
    cursor: not-allowed;
    opacity: 0.45;
    transform: none;
  }

  .qp-quick-launcher-btn--send {
    border-color: rgba(229, 169, 61, 0.32);
    background: linear-gradient(
      180deg,
      rgba(229, 169, 61, 0.2),
      rgba(229, 169, 61, 0.1)
    );
    color: rgba(245, 230, 211, 0.98);
  }

  .qp-quick-launcher-btn--stop {
    border-color: rgba(239, 68, 68, 0.26);
    background: linear-gradient(180deg, rgba(239, 68, 68, 0.22), rgba(239, 68, 68, 0.12));
    color: rgba(245, 230, 211, 0.95);
  }

  .qp-quick-launcher-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--qp-text-subtle);
    font-size: 12px;
    margin-right: 4px;
    min-width: 0;
  }

  .qp-quick-launcher-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 200, 100, 0.14);
  }

  .qp-quick-launcher[data-busy='true'] .qp-quick-launcher-status-dot {
    background: var(--qp-accent);
    box-shadow: 0 0 0 2px rgba(229, 169, 61, 0.18), 0 0 18px rgba(229, 169, 61, 0.3);
    animation: qp-stream-pulse 900ms ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .qp-quick-launcher-messages,
    .qp-quick-launcher-input,
    .qp-quick-launcher-btn,
    .qp-quick-launcher-status-dot,
    .qp-quick-launcher-stream-dot {
      transition: none !important;
      animation: none !important;
    }
  }
`;

// ============================================================
// Helpers
// ============================================================

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function formatTime(isoString?: string): string {
  const raw = (isoString || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function isStreamingMessage(message: AgentMessage): boolean {
  return message.isStreaming === true && message.isFinal !== true;
}

function resolveMessageText(message: AgentMessage): string {
  const content = normalizeText((message as any)?.content);
  if (content) return content;
  const error = normalizeText((message as any)?.error);
  if (error) return error;
  return '';
}

function createSvgIcon(pathD: string): string {
  return /* html */ `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="${pathD}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

const ICON_SEND_2 = createSvgIcon('M22 2L15 22L11 13L2 9L22 2');
const ICON_STOP = createSvgIcon('M7 7H17V17H7z');
const ICON_X_MINI = /* html */ `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ============================================================
// Main
// ============================================================

export function createQuickPanelLauncher(
  options: QuickPanelLauncherOptions,
): QuickPanelLauncherManager {
  const maxRecentMessages = options.maxRecentMessages ?? 200;

  let disposed = false;
  let mounted = false;

  let launcherEl: HTMLDivElement | null = null;
  let messagesWrapEl: HTMLDivElement | null = null;
  let messagesScrollEl: HTMLDivElement | null = null;

  let inputWrapEl: HTMLDivElement | null = null;
  let inputShellEl: HTMLDivElement | null = null;
  let textareaEl: HTMLTextAreaElement | null = null;
  let statusEl: HTMLDivElement | null = null;
  let statusLabelEl: HTMLSpanElement | null = null;
  let sendBtnEl: HTMLButtonElement | null = null;
  let stopBtnEl: HTMLButtonElement | null = null;

  let originalIconParent: Node | null = null;
  let originalIconNextSibling: Node | null = null;

  let expanded = false;
  let hoverWithin = false;
  let activeSessionId: string | null = null;
  let branding: QuickPanelLauncherBranding = {};

  let requestState:
    | 'idle'
    | 'starting'
    | 'ready'
    | 'running'
    | 'completed'
    | 'cancelled'
    | 'error' = 'idle';
  let currentRequestId: string | null = null;
  let unsubscribeRequestEvents: (() => void) | null = null;

  const messageById = new Map<string, AgentMessage>();
  const messageOrder: string[] = [];
  const messageQueue: QueuedMessage[] = [];
  let historyLoaded = false;

  function isTerminalState(state: typeof requestState): boolean {
    return state === 'completed' || state === 'cancelled' || state === 'error';
  }

  function hasDraftText(): boolean {
    return (textareaEl?.value || '').trim().length > 0;
  }

  function isBusy(): boolean {
    return requestState === 'starting' || requestState === 'ready' || requestState === 'running';
  }

  function setBusyUi(nextBusy: boolean): void {
    if (!launcherEl) return;
    launcherEl.dataset.busy = nextBusy ? 'true' : 'false';
  }

  function applyExpanded(next: boolean): void {
    expanded = next;
    if (launcherEl) {
      launcherEl.dataset.expanded = next ? 'true' : 'false';
    }

    if (next) {
      // Animate to content height
      requestAnimationFrame(() => {
        updateDynamicHeights();
        if (options.floatingIcon.getElements().icon) {
          // Cosmetic: stop pulsing while in-use
          options.floatingIcon.getElements().icon?.classList.remove('pulsing');
        }
      });
    } else {
      updateDynamicHeights();
    }
  }

  function updateDynamicHeights(): void {
    if (!launcherEl || !messagesWrapEl || !messagesScrollEl || !inputWrapEl) return;

    const hasMessages = messagesScrollEl.childElementCount > 0;

    // Use fixed pixel width during expand to avoid jumping when parent width changes during collapse.
    // LAUNCHER_WIDTH - ICON_WIDTH_PLUS_GAP = 394 - 74 = 320px for messages.
    messagesWrapEl.style.maxWidth = expanded && hasMessages ? `${LAUNCHER_WIDTH}px` : '0px';
    messagesWrapEl.style.maxHeight = expanded && hasMessages ? `${LAUNCHER_HEIGHT}px` : '0px';
    messagesScrollEl.style.height = expanded && hasMessages ? `${LAUNCHER_HEIGHT}px` : '0px';

    // Input wrapper: one-line bar + potential multi-line growth
    const shellRectHeight = inputShellEl?.getBoundingClientRect().height ?? 0;
    // Add a small safety buffer to avoid clipping the inner pill border due to fractional pixels.
    const shellHeight = Math.ceil(shellRectHeight) + 8;
    const targetInputMax = expanded ? Math.min(180, Math.max(44, shellHeight || 44)) : 0;
    inputWrapEl.style.maxHeight = `${targetInputMax}px`;
  }

  function updateStatus(): void {
    if (!statusEl || !statusLabelEl) return;
    const label =
      requestState === 'starting'
        ? 'Starting…'
        : requestState === 'ready'
          ? 'Ready…'
          : requestState === 'running'
            ? 'Thinking…'
            : requestState === 'cancelled'
              ? 'Cancelled'
              : requestState === 'error'
                ? 'Error'
                : '';

    statusLabelEl.textContent = label;
    statusEl.hidden = !label;
  }

  function updateButtons(): void {
    if (!sendBtnEl || !stopBtnEl) return;
    const hasText = !!textareaEl && textareaEl.value.trim().length > 0;
    // Show send whenever there is text — if busy the message will be enqueued instead of sent immediately.
    sendBtnEl.disabled = !hasText;
    sendBtnEl.hidden = !hasText;
    stopBtnEl.hidden = !isBusy();
  }

  function resizeTextarea(): void {
    if (!textareaEl) return;
    if (textareaEl.value.trim().length === 0) {
      textareaEl.style.height = '18px';
      updateDynamicHeights();
      return;
    }
    textareaEl.style.height = '0px';
    const next = clampInt(textareaEl.scrollHeight, 18, 96);
    textareaEl.style.height = `${next}px`;
    updateDynamicHeights();
  }

  function shouldCollapseOnLeave(): boolean {
    if (hasDraftText()) return false;
    if (textareaEl && document.activeElement === textareaEl) return false;
    if (isBusy()) return false;
    return true;
  }

  let collapseTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleCollapse(): void {
    if (collapseTimer) clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => {
      collapseTimer = null;
      if (hoverWithin) return;
      if (!shouldCollapseOnLeave()) return;
      applyExpanded(false);
    }, 120);
  }

  let activationInFlight: Promise<void> | null = null;
  let lastActivationAt = 0;

  async function ensureActiveSession(): Promise<void> {
    const now = Date.now();
    if (activationInFlight) return activationInFlight;

    // Avoid hammering activation on micro hover jitter.
    if (now - lastActivationAt < 1500) return;
    lastActivationAt = now;

    activationInFlight = (async () => {
      const result = await options.agentBridge.activateSession({ reason: 'expand' });
      if (!result.success) return;

      const sessionChanged = activeSessionId !== result.sessionId;
      activeSessionId = result.sessionId;
      branding = {
        ...branding,
        sessionName: result.sessionName,
        engineDisplayName: result.engineDisplayName,
        brandIconUrl: result.brandIconUrl,
      };

      if (Array.isArray(result.recentMessages)) {
        if (sessionChanged || !historyLoaded) {
          setHistory(result.recentMessages);
        }
      }
    })().finally(() => {
      activationInFlight = null;
    });

    return activationInFlight;
  }

  function setHistory(messages: AgentMessage[]): void {
    historyLoaded = true;
    messageById.clear();
    messageOrder.length = 0;

    for (const msg of messages) {
      if (!msg?.id) continue;
      messageById.set(msg.id, msg);
      messageOrder.push(msg.id);
    }

    // Do not trim — preserve full session history.
    renderMessages();
  }

  function upsertMessage(msg: AgentMessage): void {
    if (!msg?.id) return;
    const existed = messageById.has(msg.id);
    messageById.set(msg.id, msg);
    if (!existed) {
      messageOrder.push(msg.id);
    }
    trimMessages();
    renderMessages();
  }

  function trimMessages(): void {
    while (messageOrder.length > maxRecentMessages) {
      const id = messageOrder.shift();
      if (!id) continue;
      messageById.delete(id);
    }
  }

  function renderMessages(): void {
    if (!messagesScrollEl) return;

    const frag = document.createDocumentFragment();

    for (const id of messageOrder) {
      const msg = messageById.get(id);
      if (!msg) continue;
      frag.appendChild(renderMessageCard(msg));
    }

    for (const queued of messageQueue) {
      frag.appendChild(renderQueuedCard(queued));
    }

    messagesScrollEl.replaceChildren(frag);

    // Keep bottom visible
    try {
      messagesScrollEl.scrollTop = messagesScrollEl.scrollHeight;
    } catch {
      // ignore
    }

    updateDynamicHeights();
    // Update mask after content change + scroll-to-bottom so boundary state is correct.
    requestAnimationFrame(updateScrollMask);
  }

  function renderQueuedCard(queued: QueuedMessage): HTMLElement {
    const card = document.createElement('div');
    card.className = 'qp-quick-launcher-msg qp-quick-launcher-msg--queued';
    card.dataset.role = 'user';

    const text = document.createElement('div');
    text.className = 'qp-quick-launcher-msg-text';
    text.textContent = queued.text;

    const meta = document.createElement('div');
    meta.className = 'qp-quick-launcher-msg-meta';

    const left = document.createElement('div');
    left.style.display = 'inline-flex';
    left.style.alignItems = 'center';
    left.style.gap = '6px';

    const dot = document.createElement('span');
    dot.className = 'qp-quick-launcher-queued-dot';
    left.appendChild(dot);

    const label = document.createElement('span');
    label.textContent = 'Queued';
    left.appendChild(label);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'qp-quick-launcher-msg-remove';
    removeBtn.type = 'button';
    removeBtn.title = 'Remove from queue';
    removeBtn.innerHTML = ICON_X_MINI;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = messageQueue.findIndex((q) => q.id === queued.id);
      if (idx !== -1) messageQueue.splice(idx, 1);
      renderMessages();
    });

    meta.append(left, removeBtn);
    card.append(text, meta);
    return card;
  }

  function renderMessageCard(message: AgentMessage): HTMLElement {
    const card = document.createElement('div');
    const role = (message.role || 'assistant') as string;
    card.className = 'qp-quick-launcher-msg';
    card.dataset.role = role;

    const text = document.createElement('div');
    text.className = 'qp-quick-launcher-msg-text';
    text.textContent = resolveMessageText(message);

    const meta = document.createElement('div');
    meta.className = 'qp-quick-launcher-msg-meta';

    const left = document.createElement('div');
    left.style.display = 'inline-flex';
    left.style.alignItems = 'center';
    left.style.gap = '8px';

    if (isStreamingMessage(message)) {
      const dot = document.createElement('span');
      dot.className = 'qp-quick-launcher-stream-dot';
      left.appendChild(dot);
    }

    const time = document.createElement('span');
    time.textContent = formatTime((message as any)?.createdAt) || '—';
    left.appendChild(time);

    const right = document.createElement('span');
    const engineName = normalizeText(branding.engineDisplayName) || 'Agent';
    right.textContent = role === 'user' ? 'Me' : role === 'assistant' ? engineName : role;

    meta.append(left, right);
    card.append(text, meta);
    return card;
  }

  function handleRealtimeEvent(event: RealtimeEvent): void {
    if (!event) return;

    switch (event.type) {
      case 'message': {
        upsertMessage(event.data as AgentMessage);
        break;
      }
      case 'status': {
        const status = (event.data as any)?.status as typeof requestState | undefined;
        if (status) requestState = status;
        setBusyUi(isBusy());
        updateStatus();
        updateButtons();

        if (isTerminalState(requestState)) {
          currentRequestId = null;
          unsubscribeRequestEvents?.();
          unsubscribeRequestEvents = null;
          setBusyUi(false);
          updateButtons();
          void processQueue();
        }
        break;
      }
      case 'error': {
        requestState = 'error';
        currentRequestId = null;
        unsubscribeRequestEvents?.();
        unsubscribeRequestEvents = null;
        setBusyUi(false);
        updateStatus();
        updateButtons();
        void processQueue();
        break;
      }
    }
  }

  function getContext(): any {
    const selection = normalizeText(window.getSelection?.()?.toString?.());
    return {
      url: location.href,
      title: document.title || '',
      selection: selection ? selection.slice(0, 4000) : '',
    };
  }

  async function sendInstruction(instruction: string): Promise<void> {
    await ensureActiveSession();

    requestState = 'starting';
    setBusyUi(true);
    updateStatus();
    updateButtons();

    const result = await options.agentBridge.sendToAI({
      instruction,
      context: getContext(),
    });

    if (!result.success) {
      requestState = 'error';
      setBusyUi(false);
      updateStatus();
      updateButtons();
      void processQueue();
      return;
    }

    activeSessionId = result.sessionId;
    currentRequestId = result.requestId;

    // Subscribe to streaming events for this request
    unsubscribeRequestEvents?.();
    unsubscribeRequestEvents = options.agentBridge.onRequestEvent(
      result.requestId,
      handleRealtimeEvent,
    );
  }

  async function processQueue(): Promise<void> {
    if (isBusy()) return;
    const next = messageQueue.shift();
    if (!next) return;
    renderMessages(); // Remove the dequeued card from the UI immediately
    await sendInstruction(next.text);
  }

  async function send(): Promise<void> {
    if (!textareaEl) return;
    const instruction = textareaEl.value.trim();
    if (!instruction) return;

    // Clear textarea immediately regardless of busy state
    textareaEl.value = '';
    resizeTextarea();
    updateButtons();

    if (isBusy()) {
      // Agent is busy — enqueue and show in UI
      const id = `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      messageQueue.push({ id, text: instruction });
      renderMessages();
      return;
    }

    await sendInstruction(instruction);
  }

  async function cancel(): Promise<void> {
    if (!currentRequestId) return;
    const sessionId = activeSessionId || undefined;
    await options.agentBridge.cancelRequest(currentRequestId, sessionId);
  }

  function onPointerEnter(): void {
    hoverWithin = true;
    if (!expanded) {
      expand();
    }
  }

  function onPointerLeave(): void {
    hoverWithin = false;
    scheduleCollapse();
  }

  function updateScrollMask(): void {
    const el = messagesScrollEl;
    if (!el) return;
    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    // Build a gradient that fades at each end if there's hidden content there.
    // Top fade: transparent 0% → opaque 20%
    // Bottom fade: opaque 80% → transparent 100%
    const topStop = atTop ? 'rgba(0,0,0,1) 0%' : 'transparent 0%, rgba(0,0,0,1) 20%';
    const bottomStop = atBottom ? 'rgba(0,0,0,1) 100%' : 'rgba(0,0,0,1) 80%, transparent 100%';
    const gradient = `linear-gradient(to bottom, ${topStop}, ${bottomStop})`;
    el.style.webkitMaskImage = gradient;
    el.style.maskImage = gradient;
    el.style.webkitMaskSize = '100% 100%';
    el.style.maskSize = '100% 100%';
  }

  function onScrollWheel(e: WheelEvent): void {
    const el = messagesScrollEl;
    if (!el) return;
    // Always stop propagation so the page never receives the event.
    e.stopPropagation();
    // If the container is not actually scrollable in the given direction,
    // prevent the default action too (avoids browser "overscroll" chaining).
    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
      e.preventDefault();
    }
    updateScrollMask();
  }

  function onTextareaFocus(): void {
    if (!expanded) expand({ focus: false });
    resizeTextarea();
  }

  function onTextareaBlur(): void {
    if (!hoverWithin) scheduleCollapse();
  }

  function onTextareaInput(): void {
    resizeTextarea();
    updateButtons();
    if (!expanded) expand({ focus: false });
    if (!hoverWithin && !hasDraftText()) scheduleCollapse();
  }

  function stopPageShortcuts(e: KeyboardEvent): void {
    // Keyboard events are composed and will cross the shadow boundary.
    // Stop propagation so page-level shortcut handlers don't trigger while typing.
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  function onTextareaKeydown(e: KeyboardEvent): void {
    stopPageShortcuts(e);

    if (e.key === 'Escape') {
      if (!hasDraftText() && !isBusy()) {
        e.preventDefault();
        textareaEl?.blur();
        collapse({ force: true });
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function onTextareaKeyup(e: KeyboardEvent): void {
    stopPageShortcuts(e);
  }

  function onTextareaKeypress(e: KeyboardEvent): void {
    stopPageShortcuts(e);
  }

  function onSendClick(): void {
    void send();
  }

  function onStopClick(): void {
    void cancel();
  }

  function setBranding(next: QuickPanelLauncherBranding): void {
    branding = { ...branding, ...next };
  }

  function mount(): void {
    if (disposed || mounted) return;

    const { shadowRoot, container, icon } = options.floatingIcon.getElements();
    if (!shadowRoot || !container || !icon) return;

    // One-time style injection
    const styleId = 'qp-quick-launcher-styles';
    if (!shadowRoot.querySelector(`#${CSS.escape(styleId)}`)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = QUICK_LAUNCHER_STYLES;
      shadowRoot.appendChild(style);
    }

    // Create launcher root
    launcherEl = document.createElement('div');
    launcherEl.className = 'qp-quick-launcher';
    launcherEl.dataset.expanded = 'false';
    launcherEl.dataset.busy = 'false';

    // Messages wrapper
    messagesWrapEl = document.createElement('div');
    messagesWrapEl.className = 'qp-quick-launcher-messages';

    const scroll = document.createElement('div');
    scroll.className = 'qp-quick-launcher-messages-scroll';
    // Trap wheel events so scrolling the message list doesn't scroll the page.
    scroll.addEventListener('wheel', onScrollWheel, { passive: false });
    scroll.addEventListener('scroll', updateScrollMask, { passive: true });
    messagesScrollEl = scroll;

    messagesWrapEl.appendChild(scroll);

    // Input wrapper
    inputWrapEl = document.createElement('div');
    inputWrapEl.className = 'qp-quick-launcher-input';

    const shell = document.createElement('div');
    shell.className = 'qp-quick-launcher-input-shell qp-glass';
    inputShellEl = shell;

    const inputArea = document.createElement('div');
    inputArea.className = 'qp-quick-launcher-input-area';

    textareaEl = document.createElement('textarea');
    textareaEl.className = 'qp-quick-launcher-textarea';
    textareaEl.rows = 1;
    textareaEl.placeholder = options.placeholder || 'Ask…';
    textareaEl.addEventListener('focus', onTextareaFocus);
    textareaEl.addEventListener('blur', onTextareaBlur);
    textareaEl.addEventListener('input', onTextareaInput);
    textareaEl.addEventListener('keydown', onTextareaKeydown);
    textareaEl.addEventListener('keyup', onTextareaKeyup);
    textareaEl.addEventListener('keypress', onTextareaKeypress);

    inputArea.append(textareaEl);

    const actions = document.createElement('div');
    actions.className = 'qp-quick-launcher-actions';

    statusEl = document.createElement('div');
    statusEl.className = 'qp-quick-launcher-status';
    statusEl.hidden = true;

    const statusDot = document.createElement('span');
    statusDot.className = 'qp-quick-launcher-status-dot';
    statusEl.appendChild(statusDot);

    statusLabelEl = document.createElement('span');
    statusLabelEl.textContent = '';
    statusEl.appendChild(statusLabelEl);

    sendBtnEl = document.createElement('button');
    sendBtnEl.className = 'qp-quick-launcher-btn qp-quick-launcher-btn--send';
    sendBtnEl.type = 'button';
    sendBtnEl.innerHTML = ICON_SEND_2;
    sendBtnEl.title = 'Send (Enter)';
    sendBtnEl.addEventListener('click', onSendClick);

    stopBtnEl = document.createElement('button');
    stopBtnEl.className = 'qp-quick-launcher-btn qp-quick-launcher-btn--stop';
    stopBtnEl.type = 'button';
    stopBtnEl.innerHTML = ICON_STOP;
    stopBtnEl.title = 'Stop';
    stopBtnEl.hidden = true;
    stopBtnEl.addEventListener('click', onStopClick);

    actions.append(statusEl, sendBtnEl, stopBtnEl);
    shell.append(inputArea, actions);
    inputWrapEl.appendChild(shell);

    // Row: input on the left, icon on the right
    const row = document.createElement('div');
    row.className = 'qp-quick-launcher-row';
    // Capture original icon placement before moving it (so we can restore on dispose)
    originalIconParent = icon.parentNode;
    originalIconNextSibling = icon.nextSibling;
    row.append(inputWrapEl, icon);

    launcherEl.append(messagesWrapEl, row);

    // Attach launcher under floating icon container
    container.appendChild(launcherEl);

    // Hover retention region (includes icon + input + messages)
    launcherEl.addEventListener('pointerenter', onPointerEnter);
    launcherEl.addEventListener('pointerleave', onPointerLeave);

    mounted = true;
    updateButtons();
    updateDynamicHeights();
  }

  function expand(expandOptions?: { focus?: boolean }): void {
    if (disposed) return;
    mount();
    if (!launcherEl) return;

    applyExpanded(true);
    void ensureActiveSession();

    if (expandOptions?.focus && textareaEl) {
      textareaEl.focus();
      resizeTextarea();
    }
  }

  function collapse(collapseOptions?: { force?: boolean }): void {
    if (disposed) return;
    if (!launcherEl) return;

    if (!collapseOptions?.force) {
      if (!shouldCollapseOnLeave()) return;
    }

    applyExpanded(false);
  }

  function toggle(toggleOptions?: { focus?: boolean }): void {
    if (expanded) collapse({ force: true });
    else expand({ focus: toggleOptions?.focus });
  }

  function isExpanded(): boolean {
    return expanded;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;

    if (collapseTimer) clearTimeout(collapseTimer);
    collapseTimer = null;

    unsubscribeRequestEvents?.();
    unsubscribeRequestEvents = null;

    if (launcherEl) {
      launcherEl.removeEventListener('pointerenter', onPointerEnter);
      launcherEl.removeEventListener('pointerleave', onPointerLeave);
      launcherEl.remove();
      launcherEl = null;
    }

    // Restore icon to its original parent if possible
    const { icon } = options.floatingIcon.getElements();
    if (icon && originalIconParent) {
      try {
        if (originalIconNextSibling && originalIconNextSibling.parentNode === originalIconParent) {
          originalIconParent.insertBefore(icon, originalIconNextSibling);
        } else {
          originalIconParent.appendChild(icon);
        }
      } catch {
        // ignore
      }
    }

    mounted = false;
  }

  return {
    mount,
    expand,
    collapse,
    toggle,
    isExpanded,
    setBranding,
    dispose,
  };
}
