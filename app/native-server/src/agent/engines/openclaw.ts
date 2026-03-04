import { randomUUID } from 'node:crypto';
import { OpenClawGatewayClient } from '../openclaw/gateway-client';
import { getOpenClawGatewaySettings } from '../openclaw/settings-service';
import type { AgentMessage } from '../types';
import type { AgentEngine, EngineExecutionContext, EngineInitOptions } from './types';

export class OpenClawEngine implements AgentEngine {
  public readonly name = 'openclaw' as const;
  public readonly supportsMcp = false;

  async initializeAndRun(options: EngineInitOptions, ctx: EngineExecutionContext): Promise<void> {
    const { sessionId, instruction, signal, requestId, optionsConfig } = options;

    const isDebugEnabled = true;
    const debugLog = (...args: unknown[]): void => {
      if (!isDebugEnabled) return;
      console.error('[OpenClawEngine]', ...args);
    };

    if (signal?.aborted) {
      throw new Error('OpenClawEngine: execution was cancelled');
    }

    const normalizedInstruction = instruction.trim();
    if (!normalizedInstruction) {
      throw new Error('OpenClawEngine: instruction must not be empty');
    }

    if (signal?.aborted) {
      return;
    }

    const settings = await getOpenClawGatewaySettings();
    const gateway = new OpenClawGatewayClient({
      wsUrl: settings.wsUrl,
      authToken: settings.authToken,
      clientInfo: {
        id: 'node-host',
        version: '0.1.0',
        platform: process.platform,
        mode: 'node',
      },
    });

    let assistantMessageId: string | null = null;
    let assistantCreatedAt: string | null = null;
    let assistantBuffer = '';
    let lastEmitted: { content: string; isFinal: boolean } | null = null;

    const getString = (value: unknown): string => (typeof value === 'string' ? value : '');

    const doesSessionKeyMatch = (
      payloadSessionKey: string,
      expectedSessionKey: string,
    ): boolean => {
      const normalizedPayload = payloadSessionKey.trim();
      const normalizedExpected = expectedSessionKey.trim();
      if (!normalizedPayload || !normalizedExpected) return false;
      if (normalizedPayload === normalizedExpected) return true;
      const parts = normalizedPayload.split(':');
      return parts[1] === normalizedExpected;
    };

    const getStatus = (payload: any): string => {
      // Gateway payloads evolved over time:
      // - older: { state: 'final' | 'error' | ... }
      // - current: { status: 'completed' | 'ok' | 'error' | ... }
      const status = getString(payload?.status).toLowerCase();
      if (status) return status;
      const state = getString(payload?.state).toLowerCase();
      if (state === 'final') return 'completed';
      return state;
    };

    const isTerminalStatus = (status: string): boolean => {
      return status === 'completed' || status === 'ok' || status === 'final';
    };

    const isErrorStatus = (status: string): boolean => {
      return status === 'error' || status === 'failed';
    };

    const isAbortedStatus = (status: string): boolean => {
      return status === 'aborted' || status === 'cancelled' || status === 'canceled';
    };

    const extractTextFromPayload = (payload: any): { text: string; isDelta: boolean } => {
      if (!payload || typeof payload !== 'object') {
        return { text: '', isDelta: false };
      }

      const direct =
        getString(payload.content) || getString(payload.message) || getString(payload.text) || '';
      if (direct) {
        return { text: direct, isDelta: false };
      }

      const delta = getString(payload.delta);
      if (delta) {
        return { text: delta, isDelta: true };
      }

      // OpenAI-style content blocks: payload.message.content[0].text
      const contentBlocks = Array.isArray(payload?.message?.content) ? payload.message.content : [];
      const firstText =
        contentBlocks.length > 0 &&
        contentBlocks[0] &&
        typeof contentBlocks[0] === 'object' &&
        contentBlocks[0].type === 'text' &&
        typeof contentBlocks[0].text === 'string'
          ? String(contentBlocks[0].text)
          : '';
      if (firstText) {
        return { text: firstText, isDelta: false };
      }

      return { text: '', isDelta: false };
    };

    const extractHistoryList = (historyResponse: any): any[] => {
      if (Array.isArray(historyResponse)) return historyResponse;
      if (!historyResponse || typeof historyResponse !== 'object') return [];
      if (Array.isArray(historyResponse.messages)) return historyResponse.messages;
      if (Array.isArray(historyResponse.items)) return historyResponse.items;
      return [];
    };

    const requestChatHistory = async (): Promise<any> => {
      try {
        return await gateway.request<any>('chat.history', { sessionKey: openClawSessionKey });
      } catch (err) {
        debugLog('chat.history object-param failed; retrying string-param', {
          error: err instanceof Error ? err.message : String(err),
        });
        return gateway.request<any>('chat.history', openClawSessionKey);
      }
    };

    const requestChatAbort = async (runId?: string): Promise<any> => {
      const params = runId
        ? { sessionKey: openClawSessionKey, runId }
        : { sessionKey: openClawSessionKey };
      try {
        return await gateway.request<any>('chat.abort', params);
      } catch (err) {
        debugLog('chat.abort object-param failed; retrying fallback', {
          error: err instanceof Error ? err.message : String(err),
        });
        // Some gateway builds accept abort(sessionKey) or abort({sessionKey}) only.
        if (!runId) {
          return gateway.request<any>('chat.abort', { sessionKey: openClawSessionKey });
        }
        try {
          return await gateway.request<any>('chat.abort', { sessionKey: openClawSessionKey });
        } catch {
          return gateway.request<any>('chat.abort', openClawSessionKey);
        }
      }
    };

    // OpenClaw `chat.send` expects `sessionKey` to be the agent id (e.g. "main").
    // Ruminer `sessionId` is the DB session UUID, so do NOT pass it through.
    const openClawSessionKey = (() => {
      const fromOptionsConfig = (optionsConfig as any)?.openclaw?.sessionKey;
      if (typeof fromOptionsConfig === 'string' && fromOptionsConfig.trim()) {
        return fromOptionsConfig.trim();
      }
      const fromLegacyKey = (optionsConfig as any)?.openclawSessionKey;
      if (typeof fromLegacyKey === 'string' && fromLegacyKey.trim()) {
        return fromLegacyKey.trim();
      }
      return 'main';
    })();

    // IMPORTANT (upstream OpenClaw behavior): Gateway `chat` push events use the
    // *client run id* (idempotencyKey) as `payload.runId` (see `server-chat.ts`).
    // The `chat.send` ACK may return a different identifier, so do not overwrite
    // the client run id used for event correlation.
    const clientRunId = (requestId?.trim() || randomUUID()).trim();
    let ackRunId: string | null = null;

    debugLog('init', {
      sessionId,
      requestId,
      openClawSessionKey,
      clientRunId,
    });

    // Snapshot transcript head so we can poll for a new assistant reply
    // in case we miss `chat` push events.
    let baselineLastMessageId: string | null = null;

    let resolveDone: (() => void) | null = null;
    let rejectDone: ((err: Error) => void) | null = null;
    const donePromise = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });

    const doneTimer = setTimeout(
      () => {
        rejectDone?.(new Error('OpenClawEngine: timed out waiting for final chat event'));
      },
      10 * 60 * 1000,
    );

    const emitAssistant = (isFinal: boolean): void => {
      const content = assistantBuffer;
      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      if (lastEmitted && lastEmitted.content === trimmed && lastEmitted.isFinal === isFinal) {
        return;
      }
      lastEmitted = { content: trimmed, isFinal };

      if (!assistantMessageId) {
        assistantMessageId = randomUUID();
      }
      if (!assistantCreatedAt) {
        assistantCreatedAt = new Date().toISOString();
      }

      const message: AgentMessage = {
        id: assistantMessageId,
        sessionId,
        role: 'assistant',
        content: trimmed,
        messageType: 'chat',
        cliSource: this.name,
        requestId,
        isStreaming: !isFinal,
        isFinal,
        createdAt: assistantCreatedAt,
      };

      ctx.emit({ type: 'message', data: message });
    };

    const off = gateway.onEvent((evt) => {
      if (evt.event !== 'chat' && evt.event !== 'openclaw') return;

      let shouldLog = isDebugEnabled;
      const payloadAny = evt.payload as any;
      const payloadSessionKeyDebug =
        typeof payloadAny?.sessionKey === 'string' ? payloadAny.sessionKey : undefined;
      const payloadRunIdDebug =
        typeof payloadAny?.runId === 'string'
          ? payloadAny.runId
          : typeof payloadAny?.requestId === 'string'
            ? payloadAny.requestId
            : undefined;
      const statusDebug = getStatus(payloadAny);
      if (
        !shouldLog &&
        (isErrorStatus(statusDebug) ||
          isAbortedStatus(statusDebug) ||
          isTerminalStatus(statusDebug))
      ) {
        shouldLog = true;
      }
      if (shouldLog) {
        debugLog('event', {
          event: evt.event,
          sessionKey: payloadSessionKeyDebug,
          runId: payloadRunIdDebug,
          status: statusDebug,
          hasMessage: !!payloadAny?.message,
        });
      }

      // We only care about completion signals from the tool-stream channel;
      // assistant text is expected on `chat`.
      const isChatEvent = evt.event === 'chat';

      const payload = evt.payload as any;
      const payloadRunId =
        typeof payload?.runId === 'string'
          ? payload.runId
          : typeof payload?.requestId === 'string'
            ? payload.requestId
            : '';

      const payloadSessionKey = typeof payload?.sessionKey === 'string' ? payload.sessionKey : '';
      const isCorrelatedRun =
        !!payloadRunId &&
        (payloadRunId === clientRunId || (!!ackRunId && payloadRunId === ackRunId));
      const isMatchingSessionKey = doesSessionKeyMatch(payloadSessionKey, openClawSessionKey);

      // Prefer strict sessionKey matching, but allow runId-correlated events even when
      // the gateway emits a composite session key format.
      if (!isMatchingSessionKey && !isCorrelatedRun) {
        debugLog('ignore: sessionKey mismatch', {
          got: payloadSessionKey,
          expected: openClawSessionKey,
          runId: payloadRunId,
          clientRunId,
          ackRunId,
        });
        return;
      }

      // Prefer strict runId matching when present.
      // - pushed `chat` events typically use clientRunId
      // - some gateway implementations may use the ACK's run id
      // Do not block completion if the gateway omits runId on terminal status events.
      if (
        payloadRunId &&
        payloadRunId !== clientRunId &&
        (!ackRunId || payloadRunId !== ackRunId)
      ) {
        if (isDebugEnabled) {
          debugLog('ignore: runId mismatch', {
            got: payloadRunId,
            clientRunId,
            ackRunId,
          });
        }
        return;
      }

      const status = getStatus(payload);
      if (isErrorStatus(status)) {
        const msg =
          typeof payload?.errorMessage === 'string' && payload.errorMessage.trim()
            ? payload.errorMessage.trim()
            : 'OpenClaw chat run errored';
        rejectDone?.(new Error(`OpenClawEngine: ${msg}`));
        return;
      }
      if (isAbortedStatus(status)) {
        rejectDone?.(new Error('OpenClawEngine: chat run aborted'));
        return;
      }

      if (!isChatEvent) {
        // Tool-stream channel (`agent` upstream) can carry completion status.
        if (isTerminalStatus(status)) {
          debugLog('resolve: terminal status from tool stream', { status });
          resolveDone?.();
        }
        return;
      }

      const roleRaw = String(
        payload.role || payload.sender || payload.type || 'assistant',
      ).toLowerCase();
      const isAssistant = roleRaw !== 'user' && roleRaw !== 'tool';

      const { text, isDelta } = extractTextFromPayload(payload);
      if (text && isAssistant) {
        if (!assistantMessageId) {
          assistantMessageId =
            getString(payload.id) || getString(payload.messageId) || payloadRunId || randomUUID();
        }

        assistantBuffer = isDelta ? `${assistantBuffer}${text}` : text;
        emitAssistant(isTerminalStatus(status));
      }

      if (isTerminalStatus(status)) {
        // Terminal can omit message for silent replies; still consider the run done.
        debugLog('resolve: terminal status from chat', { status });
        resolveDone?.();
      }
    });

    const handleAbort = (): void => {
      try {
        // Best-effort: request abort for the active run.
        // Do not block abort handling on gateway connectivity.
        void requestChatAbort(clientRunId).catch(() => undefined);
        gateway.close();
      } catch {
        // ignore
      }

      rejectDone?.(new Error('OpenClawEngine: execution was cancelled'));
    };
    signal?.addEventListener('abort', handleAbort);

    try {
      debugLog('connect: start');
      await gateway.connect();
      debugLog('connect: ok');

      // Baseline transcript head for fallback polling.
      try {
        const baseline = await requestChatHistory();
        const list = extractHistoryList(baseline);
        const last = list.length > 0 ? list[list.length - 1] : null;
        const lastId = last && typeof last === 'object' ? getString((last as any).id) : '';
        baselineLastMessageId = lastId || null;
        debugLog('history: baseline', {
          baselineLastMessageId,
          baselineCount: list.length,
        });
      } catch (err) {
        debugLog('history: baseline failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        // ignore baseline failures; events should still work
      }

      debugLog('chat.send: start', { clientRunId, openClawSessionKey });
      const sendAck = await gateway.request<any>('chat.send', {
        sessionKey: openClawSessionKey,
        message: normalizedInstruction,
        idempotencyKey: clientRunId,
      });
      debugLog('chat.send: ack', {
        hasAck: !!sendAck,
        ackRunId: sendAck && typeof sendAck === 'object' ? getString((sendAck as any).runId) : '',
        status: sendAck && typeof sendAck === 'object' ? getString((sendAck as any).status) : '',
      });

      if (sendAck && typeof sendAck === 'object') {
        const receivedAckRunId = typeof sendAck.runId === 'string' ? sendAck.runId.trim() : '';
        if (receivedAckRunId) {
          ackRunId = receivedAckRunId;
        }
      }

      // Best-effort fallback: if push events are missed, poll history briefly
      // to avoid the UI being stuck in a "running" state.
      const pollHistory = async (): Promise<void> => {
        const startedAt = Date.now();
        while (!signal?.aborted && Date.now() - startedAt < 30_000) {
          await new Promise((r) => setTimeout(r, 1_000));
          try {
            const history = await requestChatHistory();
            const list = extractHistoryList(history);
            if (list.length === 0) continue;

            const last = list[list.length - 1];
            if (!last || typeof last !== 'object') continue;

            const lastId = getString((last as any).id);
            if (baselineLastMessageId && lastId && lastId === baselineLastMessageId) {
              continue;
            }

            const roleRaw = String(
              (last as any).role || (last as any).sender || (last as any).type || '',
            ).toLowerCase();
            if (roleRaw && roleRaw !== 'assistant') {
              continue;
            }

            const { text } = extractTextFromPayload(last);
            if (!text.trim()) continue;

            assistantBuffer = text;
            emitAssistant(true);
            debugLog('resolve: pollHistory found assistant', {
              lastId,
              baselineLastMessageId,
              textLen: text.length,
            });
            resolveDone?.();
            return;
          } catch {
            // ignore; try again until timeout
          }
        }

        debugLog('pollHistory: gave up', { aborted: !!signal?.aborted });
      };

      void pollHistory();

      // `chat.send` only ACKs; wait for `chat` state=final for this run.
      await donePromise;

      // Ensure the last buffered content is marked final.
      emitAssistant(true);
    } finally {
      clearTimeout(doneTimer);
      signal?.removeEventListener('abort', handleAbort);
      off();
      gateway.close();
    }
  }
}
