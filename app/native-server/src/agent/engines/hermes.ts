import { randomUUID } from 'node:crypto';
import { getHermesSettings } from '../hermes/settings-service';
import type { AgentAttachment, AgentMessage } from '../types';
import type { AgentEngine, EngineExecutionContext, EngineInitOptions } from './types';

type HermesToolCall = {
  id?: string;
  callId: string;
  toolName: string;
  argumentsText?: string;
  parsedArguments?: Record<string, unknown>;
};

type HermesSseEvent = {
  event?: string;
  data?: unknown;
};

/**
 * HermesEngine integrates the Hermes API server through the OpenAI-compatible
 * Responses API surface exposed by `hermes api-server`.
 */
export class HermesEngine implements AgentEngine {
  public readonly name = 'hermes' as const;
  public readonly supportsMcp = true;

  async initializeAndRun(options: EngineInitOptions, ctx: EngineExecutionContext): Promise<void> {
    const { sessionId, instruction, requestId, signal, attachments, resumeEngineSessionId } =
      options;

    if (signal?.aborted) {
      throw new Error('HermesEngine: execution was cancelled');
    }

    const normalizedInstruction = instruction.trim();
    if (!normalizedInstruction) {
      throw new Error('HermesEngine: instruction must not be empty');
    }

    const settings = await getHermesSettings();
    const baseUrl = this.normalizeBaseUrl(settings.baseUrl);
    if (!baseUrl) {
      throw new Error('HermesEngine: Hermes API server base URL is not configured');
    }
    if (!settings.apiKey.trim()) {
      throw new Error('HermesEngine: Hermes API server key is not configured');
    }

    const startedAtMs = Date.now();
    const assistantMessageId = randomUUID();
    const assistantCreatedAt = new Date().toISOString();
    let assistantBuffer = '';
    let lastAssistantEmission: { content: string; isFinal: boolean } | null = null;

    const toolCallsByCallId = new Map<string, HermesToolCall>();
    const emittedToolUseCallIds = new Set<string>();
    const emittedToolResultKeys = new Set<string>();

    const emitAssistant = (isFinal: boolean): void => {
      const content = assistantBuffer.trim();
      if (!content) return;

      if (
        lastAssistantEmission &&
        lastAssistantEmission.content === content &&
        lastAssistantEmission.isFinal === isFinal
      ) {
        return;
      }
      lastAssistantEmission = { content, isFinal };

      const message: AgentMessage = {
        id: assistantMessageId,
        sessionId,
        role: 'assistant',
        content,
        messageType: 'chat',
        cliSource: this.name,
        requestId,
        isStreaming: !isFinal,
        isFinal,
        createdAt: assistantCreatedAt,
      };

      ctx.emit({ type: 'message', data: message });
    };

    const emitToolMessage = (input: {
      messageType: 'tool_use' | 'tool_result';
      content: string;
      metadata: Record<string, unknown>;
      isStreaming?: boolean;
    }): void => {
      const content = input.content.trim();
      if (!content) return;

      const message: AgentMessage = {
        id: randomUUID(),
        sessionId,
        role: 'tool',
        content,
        messageType: input.messageType,
        cliSource: this.name,
        requestId,
        isStreaming: input.isStreaming === true,
        isFinal: input.isStreaming === true ? false : true,
        createdAt: new Date().toISOString(),
        metadata: {
          cli_type: 'hermes',
          ...input.metadata,
        },
      };

      ctx.emit({ type: 'message', data: message });
    };

    const response = await fetch(`${baseUrl}/v1/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'hermes-agent',
        input: [
          {
            role: 'user',
            content: this.buildInputContent(normalizedInstruction, attachments),
          },
        ],
        stream: true,
        store: true,
        ...(resumeEngineSessionId ? { previous_response_id: resumeEngineSessionId } : {}),
      }),
      signal,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`HermesEngine: ${message || `HTTP ${response.status}`}`);
    }

    if (!response.body) {
      throw new Error('HermesEngine: missing response body from Hermes API server');
    }

    for await (const event of this.readSseEvents(response.body)) {
      if (signal?.aborted) {
        throw new Error('HermesEngine: execution was cancelled');
      }

      const eventName = event.event?.trim();
      const payload = event.data;

      if (payload === '[DONE]') {
        break;
      }

      switch (eventName) {
        case 'response.output_text.delta': {
          const delta = this.pickString(payload, 'delta');
          if (!delta) {
            break;
          }
          assistantBuffer += delta;
          emitAssistant(false);
          break;
        }

        case 'response.output_item.added':
        case 'response.output_item.done': {
          const item = this.pickRecord(payload, 'item');
          if (!item) {
            break;
          }
          this.handleOutputItem(item, {
            toolCallsByCallId,
            emittedToolUseCallIds,
            emittedToolResultKeys,
            emitToolMessage,
            setAssistantText: (content) => {
              assistantBuffer = content;
            },
            emitAssistantFinal: () => emitAssistant(true),
          });
          break;
        }

        case 'response.completed': {
          const responseRecord = this.pickRecord(payload, 'response');
          const latestResponseId = this.pickString(responseRecord, 'id');
          if (latestResponseId && ctx.persistEngineSessionId) {
            await ctx.persistEngineSessionId(latestResponseId);
          }

          if (assistantBuffer.trim()) {
            emitAssistant(true);
          }

          const usage = this.pickRecord(responseRecord, 'usage');
          ctx.emit({
            type: 'usage',
            data: {
              sessionId,
              requestId,
              inputTokens: this.pickNumber(usage, 'input_tokens'),
              outputTokens: this.pickNumber(usage, 'output_tokens'),
              totalCostUsd: 0,
              durationMs: Math.max(0, Date.now() - startedAtMs),
              numTurns: 1,
            },
          });
          break;
        }

        case 'response.failed': {
          const errorMessage =
            this.pickString(payload, 'message') ||
            this.pickString(this.pickRecord(payload, 'error'), 'message') ||
            'Hermes response failed';
          throw new Error(`HermesEngine: ${errorMessage}`);
        }

        case 'error': {
          const errorMessage =
            this.pickString(this.pickRecord(payload, 'error'), 'message') ||
            this.pickString(payload, 'message') ||
            'Unknown Hermes API error';
          throw new Error(`HermesEngine: ${errorMessage}`);
        }

        default:
          break;
      }
    }
  }

  private buildInputContent(
    instruction: string,
    attachments: AgentAttachment[] | undefined,
  ): Array<Record<string, unknown>> {
    const content: Array<Record<string, unknown>> = [
      {
        type: 'input_text',
        text: instruction,
      },
    ];

    for (const attachment of attachments ?? []) {
      if (attachment.type !== 'image') {
        continue;
      }
      const mimeType = attachment.mimeType?.trim() || 'image/png';
      const dataBase64 = attachment.dataBase64?.trim();
      if (!dataBase64) {
        continue;
      }
      content.push({
        type: 'input_image',
        image_url: `data:${mimeType};base64,${dataBase64}`,
      });
    }

    return content;
  }

  private normalizeBaseUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.replace(/\/+$/, '');
  }

  private async *readSseEvents(
    body: ReadableStream<Uint8Array>,
  ): AsyncGenerator<HermesSseEvent, void, unknown> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const event = this.parseSseEvent(part);
          if (event) {
            yield event;
          }
        }
      }

      buffer += decoder.decode();
      const finalEvent = this.parseSseEvent(buffer);
      if (finalEvent) {
        yield finalEvent;
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseSseEvent(chunk: string): HermesSseEvent | null {
    const trimmed = chunk.trim();
    if (!trimmed) {
      return null;
    }

    let event: string | undefined;
    const dataLines: string[] = [];

    for (const line of trimmed.split(/\r?\n/)) {
      if (line.startsWith(':')) {
        continue;
      }
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim();
        continue;
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim());
      }
    }

    if (dataLines.length === 0) {
      return null;
    }

    const rawData = dataLines.join('\n');
    if (rawData === '[DONE]') {
      return { event, data: '[DONE]' };
    }

    try {
      return {
        event,
        data: JSON.parse(rawData) as unknown,
      };
    } catch {
      return {
        event,
        data: rawData,
      };
    }
  }

  private handleOutputItem(
    item: Record<string, unknown>,
    state: {
      toolCallsByCallId: Map<string, HermesToolCall>;
      emittedToolUseCallIds: Set<string>;
      emittedToolResultKeys: Set<string>;
      emitToolMessage: (input: {
        messageType: 'tool_use' | 'tool_result';
        content: string;
        metadata: Record<string, unknown>;
        isStreaming?: boolean;
      }) => void;
      setAssistantText: (content: string) => void;
      emitAssistantFinal: () => void;
    },
  ): void {
    const itemType = this.pickString(item, 'type');
    if (!itemType) {
      return;
    }

    if (itemType === 'message') {
      const messageContent = this.extractAssistantText(item);
      if (messageContent) {
        state.setAssistantText(messageContent);
        state.emitAssistantFinal();
      }
      return;
    }

    if (itemType === 'function_call') {
      const callId = this.pickString(item, 'call_id');
      const toolName = this.pickString(item, 'name');
      if (!callId || !toolName) {
        return;
      }

      const argumentsText = this.pickString(item, 'arguments');
      const parsedArguments = this.parseJsonRecord(argumentsText);
      const toolCall: HermesToolCall = {
        id: this.pickString(item, 'id'),
        callId,
        toolName,
        argumentsText,
        parsedArguments,
      };
      state.toolCallsByCallId.set(callId, toolCall);

      if (!state.emittedToolUseCallIds.has(callId)) {
        state.emittedToolUseCallIds.add(callId);
        const command = this.pickString(parsedArguments, 'command');
        state.emitToolMessage({
          messageType: 'tool_use',
          content: command ? `Running: ${command}` : `Calling ${toolName}`,
          metadata: {
            toolName,
            tool_name: toolName,
            callId,
            command,
            rawArguments: argumentsText,
          },
          isStreaming: true,
        });
      }
      return;
    }

    if (itemType === 'function_call_output') {
      const callId = this.pickString(item, 'call_id');
      if (!callId) {
        return;
      }

      const toolCall = state.toolCallsByCallId.get(callId);
      const toolName = toolCall?.toolName || 'tool';
      const output = this.serializeUnknown(item.output);
      const dedupeKey = `${callId}:${output}`;
      if (state.emittedToolResultKeys.has(dedupeKey)) {
        return;
      }
      state.emittedToolResultKeys.add(dedupeKey);

      state.emitToolMessage({
        messageType: 'tool_result',
        content: output || `Completed ${toolName}`,
        metadata: {
          toolName,
          tool_name: toolName,
          callId,
          output,
          command: this.pickString(toolCall?.parsedArguments, 'command'),
        },
      });
    }
  }

  private extractAssistantText(item: Record<string, unknown>): string {
    const content = item.content;
    if (!Array.isArray(content)) {
      return '';
    }

    const parts: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== 'object') {
        continue;
      }
      const record = block as Record<string, unknown>;
      const type = this.pickString(record, 'type');
      if (type !== 'output_text') {
        continue;
      }
      const text =
        this.pickString(record, 'text') ??
        this.pickString(this.pickRecord(record, 'text'), 'value') ??
        '';
      if (text) {
        parts.push(text);
      }
    }
    return parts.join('').trim();
  }

  private parseJsonRecord(value: string | undefined): Record<string, unknown> | undefined {
    if (!value) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private pickRecord(value: unknown, key: string): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const result = (value as Record<string, unknown>)[key];
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return undefined;
    }
    return result as Record<string, unknown>;
  }

  private pickString(value: unknown, key?: string): string | undefined {
    const raw =
      key === undefined
        ? value
        : value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)[key]
          : undefined;
    return typeof raw === 'string' && raw.trim() ? raw : undefined;
  }

  private pickNumber(value: unknown, key: string): number {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return 0;
    }
    const raw = (value as Record<string, unknown>)[key];
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  }

  private serializeUnknown(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (value === null || value === undefined) {
      return '';
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}
