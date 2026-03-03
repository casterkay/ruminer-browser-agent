import { randomUUID } from 'node:crypto';
import { OpenClawGatewayClient } from '../openclaw/gateway-client';
import { getOpenClawGatewaySettings } from '../openclaw/settings-service';
import type { AgentMessage } from '../types';
import type { AgentEngine, EngineExecutionContext, EngineInitOptions } from './types';

export class OpenClawEngine implements AgentEngine {
  public readonly name = 'openclaw' as const;
  public readonly supportsMcp = false;

  async initializeAndRun(options: EngineInitOptions, ctx: EngineExecutionContext): Promise<void> {
    const { sessionId, instruction, signal, model, requestId } = options;

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
      if (evt.event === 'chat.chunk') {
        const delta =
          typeof evt.payload === 'object' && evt.payload && 'content' in evt.payload
            ? String((evt.payload as any).content || '')
            : '';
        if (!delta) {
          return;
        }
        assistantBuffer += delta;
        emitAssistant(false);
      }
    });

    const handleAbort = (): void => {
      try {
        gateway.close();
      } catch {
        // ignore
      }
    };
    signal?.addEventListener('abort', handleAbort);

    try {
      await gateway.connect();

      const resolvedModel = model?.trim() || 'claude-3-5-sonnet-20241022';
      await gateway.request('chat.send', {
        message: normalizedInstruction,
        session_id: sessionId,
        model: resolvedModel,
      });

      // Flush final snapshot after request resolves.
      emitAssistant(true);
    } finally {
      signal?.removeEventListener('abort', handleAbort);
      off();
      gateway.close();
    }
  }
}
