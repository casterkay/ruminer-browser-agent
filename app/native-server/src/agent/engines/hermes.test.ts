import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { RealtimeEvent } from '../types';
import { HermesEngine } from './hermes';

const getHermesSettingsMock = jest.fn<() => Promise<any>>();

jest.mock('../hermes/settings-service', () => ({
  getHermesSettings: () => getHermesSettingsMock(),
}));

function createSseResponse(
  chunks: Array<{
    event?: string;
    data: unknown;
  }>,
): Response {
  const encoder = new TextEncoder();
  const body = chunks
    .map((chunk) => {
      const lines: string[] = [];
      if (chunk.event) {
        lines.push(`event: ${chunk.event}`);
      }
      lines.push(
        `data: ${typeof chunk.data === 'string' ? chunk.data : JSON.stringify(chunk.data)}`,
        '',
      );
      return lines.join('\n');
    })
    .join('\n');

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
      },
    },
  );
}

describe('HermesEngine', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getHermesSettingsMock.mockResolvedValue({
      baseUrl: 'http://127.0.0.1:8642',
      apiKey: 'hermes-test-key',
      updatedAt: new Date(0).toISOString(),
      lastTestOkAt: null,
      lastTestError: null,
    });
  });

  test('sends a resumable Responses API request and streams assistant text', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      createSseResponse([
        {
          event: 'response.output_text.delta',
          data: { delta: 'Hello' },
        },
        {
          event: 'response.output_text.delta',
          data: { delta: ' world' },
        },
        {
          event: 'response.completed',
          data: {
            response: {
              id: 'resp_latest',
              usage: {
                input_tokens: 12,
                output_tokens: 4,
              },
            },
          },
        },
        {
          data: '[DONE]',
        },
      ]),
    );
    global.fetch = fetchMock;

    const events: RealtimeEvent[] = [];
    const persistEngineSessionId = jest
      .fn<(...args: [string]) => Promise<void>>()
      .mockResolvedValue();
    const engine = new HermesEngine();

    await engine.initializeAndRun(
      {
        sessionId: 'session-1',
        requestId: 'request-1',
        instruction: 'Say hello',
        projectRoot: '/tmp/project',
        resumeEngineSessionId: 'resp_prev',
      },
      {
        emit: (event) => events.push(event),
        persistEngineSessionId,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:8642/v1/responses');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer hermes-test-key',
      'Content-Type': 'application/json',
    });

    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: 'hermes-agent',
      stream: true,
      store: true,
      previous_response_id: 'resp_prev',
    });
    expect(body.conversation).toBeUndefined();
    expect(body.input).toEqual([
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'Say hello' }],
      },
    ]);

    const messageEvents = events.filter((event) => event.type === 'message');
    expect(messageEvents).toHaveLength(3);
    expect(messageEvents[0]).toMatchObject({
      type: 'message',
      data: {
        role: 'assistant',
        messageType: 'chat',
        content: 'Hello',
        isStreaming: true,
        isFinal: false,
      },
    });
    expect(messageEvents[2]).toMatchObject({
      type: 'message',
      data: {
        role: 'assistant',
        messageType: 'chat',
        content: 'Hello world',
        isStreaming: false,
        isFinal: true,
      },
    });

    expect(events).toContainEqual({
      type: 'usage',
      data: {
        sessionId: 'session-1',
        requestId: 'request-1',
        inputTokens: 12,
        outputTokens: 4,
        totalCostUsd: 0,
        durationMs: expect.any(Number),
        numTurns: 1,
      },
    });
    expect(persistEngineSessionId).toHaveBeenCalledWith('resp_latest');
  });

  test('emits tool lifecycle messages from function call output items', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      createSseResponse([
        {
          event: 'response.output_item.added',
          data: {
            item: {
              id: 'fc_1',
              type: 'function_call',
              name: 'terminal',
              call_id: 'call_1',
              arguments: '{"command":"ls"}',
            },
          },
        },
        {
          event: 'response.output_item.added',
          data: {
            item: {
              id: 'fco_1',
              type: 'function_call_output',
              call_id: 'call_1',
              output: 'README.md\nsrc',
            },
          },
        },
        {
          event: 'response.completed',
          data: {
            response: {
              id: 'resp_tools',
              usage: {
                input_tokens: 8,
                output_tokens: 3,
              },
            },
          },
        },
      ]),
    );
    global.fetch = fetchMock;

    const events: RealtimeEvent[] = [];
    const engine = new HermesEngine();

    await engine.initializeAndRun(
      {
        sessionId: 'session-tools',
        requestId: 'request-tools',
        instruction: 'List files',
      },
      {
        emit: (event) => events.push(event),
        persistEngineSessionId: jest.fn<(...args: [string]) => Promise<void>>().mockResolvedValue(),
      },
    );

    const toolMessages = events.filter(
      (event): event is Extract<RealtimeEvent, { type: 'message' }> =>
        event.type === 'message' &&
        (event.data.messageType === 'tool_use' || event.data.messageType === 'tool_result'),
    );

    expect(toolMessages).toHaveLength(2);
    expect(toolMessages[0]).toMatchObject({
      data: {
        role: 'tool',
        messageType: 'tool_use',
        content: 'Running: ls',
        metadata: expect.objectContaining({
          toolName: 'terminal',
          command: 'ls',
          callId: 'call_1',
        }),
      },
    });
    expect(toolMessages[1]).toMatchObject({
      data: {
        role: 'tool',
        messageType: 'tool_result',
        content: 'README.md\nsrc',
        metadata: expect.objectContaining({
          toolName: 'terminal',
          callId: 'call_1',
          output: 'README.md\nsrc',
        }),
      },
    });
  });
});
