import { z } from 'zod';

import { RR_ERROR_CODES } from '../../../../domain/errors';
import type { NodeDefinition } from '../../types';
import { toErrorResult } from '../utils';

const TAB_ID_VAR = '__rr_v2__tabId';

const scanAndEnqueueConfigSchema = z.object({
  limit: z.number().int().min(1).max(200).default(100),
  tailSize: z.number().int().min(0).max(20).default(6),
});

type scanAndEnqueueConfig = z.infer<typeof scanAndEnqueueConfigSchema>;

type InjectedSuccess = {
  ok: true;
  scanned: number;
  enqueued: number;
  sawMissing: boolean;
  unchangedStopAt: string | null;
  durationMs: number;
};

type InjectedFailure = { ok: false; error: string };
type InjectedResult = InjectedSuccess | InjectedFailure;

function readNumberVar(vars: Record<string, unknown>, key: string): number | null {
  const v = vars[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;
}

export const scanAndEnqueueNodeDefinition: NodeDefinition<
  'ruminer.scan_and_enqueue_conversations',
  scanAndEnqueueConfig
> = {
  kind: 'ruminer.scan_and_enqueue_conversations',
  schema: scanAndEnqueueConfigSchema,
  async execute(ctx, node) {
    const vars = ctx.vars as unknown as Record<string, unknown>;
    const backgroundTabId = readNumberVar(vars, TAB_ID_VAR);
    const effectiveTabId = backgroundTabId ?? ctx.tabId;

    let injectedResult: InjectedResult | null = null;

    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: effectiveTabId },
        world: 'ISOLATED',
        func: async (payload: {
          runId: string;
          limit: number;
          tailSize: number;
        }): Promise<InjectedResult> => {
          try {
            const PLATFORM = 'chatgpt';
            const FLOW_ID = 'chatgpt.conversation_scan.v1';
            const INGEST_FLOW_ID = 'chatgpt.conversation_ingest.v1';
            const LIMIT = typeof payload.limit === 'number' ? payload.limit : 100;
            const TAIL_SIZE = typeof payload.tailSize === 'number' ? payload.tailSize : 6;

            const runId = typeof payload.runId === 'string' ? payload.runId.trim() : '';
            if (!runId) throw new Error('Missing runId');

            const sendMessageWithTimeout = <T>(msg: unknown, timeoutMs: number): Promise<T> => {
              return new Promise((resolve, reject) => {
                const timer = setTimeout(
                  () => {
                    reject(new Error(`chrome.runtime.sendMessage timed out after ${timeoutMs}ms`));
                  },
                  Math.max(1_000, Math.floor(timeoutMs)),
                );

                try {
                  chrome.runtime.sendMessage(msg as any, (resp: any) => {
                    clearTimeout(timer);
                    const err = chrome.runtime.lastError?.message;
                    if (err) {
                      reject(new Error(err));
                      return;
                    }
                    resolve(resp as T);
                  });
                } catch (e) {
                  clearTimeout(timer);
                  reject(e);
                }
              });
            };

            const notify = (title: string, message: string) => {
              try {
                chrome.runtime.sendMessage({
                  type: 'ruminer.workflow.notify',
                  title,
                  message,
                } as any);
              } catch {
                // ignore
              }
            };

            const progress = (data: unknown) => {
              try {
                chrome.runtime.sendMessage({
                  type: 'ruminer.workflow.progress',
                  runId,
                  flowId: FLOW_ID,
                  payload: data,
                } as any);
              } catch {
                // ignore
              }
            };

            const safeJson = async (response: Response) => {
              try {
                return await response.json();
              } catch {
                return null;
              }
            };

            const getAccessToken = async (): Promise<string> => {
              const url = new URL('/api/auth/session', location.origin).toString();
              const resp = await fetch(url, { credentials: 'include' });
              if (!resp.ok) throw new Error('Not logged in to ChatGPT');
              const session = await safeJson(resp);
              const token =
                session && typeof session.accessToken === 'string' ? session.accessToken : '';
              if (!token.trim()) throw new Error('ChatGPT session missing access token');
              return token.trim();
            };

            const getCookie = (key: string): string => {
              try {
                const m = document.cookie.match('(^|;)\\s*' + key + '\\s*=\\s*([^;]+)');
                return m ? String(m.pop() || '') : '';
              } catch {
                return '';
              }
            };

            const getTeamAccountId = async (accessToken: string): Promise<string | null> => {
              const workspaceId = getCookie('_account');
              if (!workspaceId) return null;
              const url = new URL(
                '/backend-api/accounts/check/v4-2023-04-27',
                location.origin,
              ).toString();
              const resp = await fetch(url, {
                headers: {
                  Authorization: 'Bearer ' + accessToken,
                  'X-Authorization': 'Bearer ' + accessToken,
                },
                credentials: 'include',
              });
              if (!resp.ok) return null;
              const payload = await safeJson(resp);
              try {
                const account = payload && payload.accounts && payload.accounts[workspaceId];
                const accountId = account && account.account && account.account.account_id;
                return typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null;
              } catch {
                return null;
              }
            };

            const fetchBackendApi = async (
              path: string,
              query: Record<string, unknown>,
              accessToken: string,
              accountId: string | null,
            ): Promise<any> => {
              const url = new URL('/backend-api' + path, location.origin);
              for (const [k, v] of Object.entries(query || {})) {
                if (v === undefined || v === null) continue;
                url.searchParams.set(k, String(v));
              }

              const headers: Record<string, string> = {
                Authorization: 'Bearer ' + accessToken,
                'X-Authorization': 'Bearer ' + accessToken,
              };
              if (accountId) headers['Chatgpt-Account-Id'] = accountId;

              const resp = await fetch(url.toString(), { headers, credentials: 'include' });
              if (!resp.ok) {
                const body = await safeJson(resp);
                const msg =
                  body && (body.detail || body.error) ? String(body.detail || body.error) : '';
                throw new Error(
                  'ChatGPT backend API failed (' +
                    resp.status +
                    '): ' +
                    (msg || resp.statusText || 'request failed'),
                );
              }
              return safeJson(resp);
            };

            const listConversations = async (
              offset: number,
              accessToken: string,
              accountId: string | null,
            ): Promise<any> => {
              return fetchBackendApi(
                '/conversations',
                { offset, limit: LIMIT, order: 'updated' },
                accessToken,
                accountId,
              );
            };

            const fetchConversation = async (
              id: string,
              accessToken: string,
              accountId: string | null,
            ): Promise<any> => {
              return fetchBackendApi(
                '/conversation/' + encodeURIComponent(id),
                {},
                accessToken,
                accountId,
              );
            };

            const extractContentText = (content: any): string => {
              if (!content || typeof content !== 'object') return '';
              const t = content.content_type;
              if (t === 'text') {
                const parts = Array.isArray(content.parts) ? content.parts : [];
                return parts.filter((p: any) => typeof p === 'string').join('');
              }
              if (t === 'code') return typeof content.text === 'string' ? content.text : '';
              if (t === 'execution_output')
                return typeof content.text === 'string' ? content.text : '';
              if (t === 'multimodal_text') {
                const parts = Array.isArray(content.parts) ? content.parts : [];
                return parts
                  .map((p: any) => {
                    if (typeof p === 'string') return p;
                    if (p && typeof p === 'object' && typeof p.text === 'string') return p.text;
                    return '';
                  })
                  .join('');
              }
              if (t === 'tether_quote') {
                const bits: string[] = [];
                if (typeof content.title === 'string') bits.push(content.title);
                if (typeof content.text === 'string') bits.push(content.text);
                if (typeof content.url === 'string') bits.push(content.url);
                return bits.join('\\n');
              }
              return '';
            };

            const extractConversationMessages = (conversation: any) => {
              const mapping = conversation && conversation.mapping ? conversation.mapping : null;
              const current =
                conversation && conversation.current_node ? conversation.current_node : null;
              if (!mapping || typeof mapping !== 'object' || !current) return [];

              const chain: any[] = [];
              const visited = new Set<string>();
              let nodeId = String(current);
              while (nodeId && (mapping as any)[nodeId] && !visited.has(nodeId)) {
                visited.add(nodeId);
                const node = (mapping as any)[nodeId];
                chain.push(node);
                const parent = node && node.parent ? String(node.parent) : '';
                nodeId = parent || '';
              }
              chain.reverse();

              const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
              for (const node of chain) {
                const msg = node && node.message ? node.message : null;
                const role =
                  msg && typeof msg.author === 'object' && typeof msg.author.role === 'string'
                    ? msg.author.role
                    : '';
                if (role !== 'user' && role !== 'assistant') continue;
                const content = extractContentText(msg && msg.content ? msg.content : null)
                  .replace(/\\r\\n/g, '\\n')
                  .trim();
                if (!content) continue;
                out.push({ role, content });
              }
              return out;
            };

            const bytesToHex = (buffer: ArrayBuffer) =>
              Array.from(new Uint8Array(buffer))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');

            const sha256Hex = async (input: string) => {
              const enc = new TextEncoder();
              const digest = await crypto.subtle.digest('SHA-256', enc.encode(String(input || '')));
              return bytesToHex(digest);
            };

            const hashMessage = async (role: string, content: string) => {
              return sha256Hex(
                JSON.stringify({
                  content: String(content || '')
                    .replace(/\\r\\n/g, '\\n')
                    .trim(),
                  role,
                }),
              );
            };

            const tailHashes = async (messages: Array<{ role: string; content: string }>) => {
              const tail = messages.slice(-TAIL_SIZE);
              const out: string[] = [];
              for (const m of tail) out.push(await hashMessage(m.role, m.content));
              return out;
            };

            const getConversationStates = async (groupIds: string[]) => {
              const resp = await sendMessageWithTimeout<any>(
                {
                  type: 'ruminer.ledger.getConversationStates',
                  groupIds,
                  tailSize: TAIL_SIZE,
                },
                60_000,
              );
              if (!resp || !resp.ok) {
                const err =
                  resp && resp.error ? String(resp.error) : 'ledger.getConversationStates failed';
                throw new Error(err);
              }
              return resp.result || {};
            };

            const enqueueRuns = async (items: any[]) => {
              const resp = await sendMessageWithTimeout<any>(
                { type: 'ruminer.rr_v3.enqueueRuns', items },
                60_000,
              );
              if (!resp || !resp.ok) {
                const err = resp && resp.error ? String(resp.error) : 'enqueueRuns failed';
                throw new Error(err);
              }
              return resp.result || {};
            };

            const startedAt = Date.now();
            const accessToken = await getAccessToken();
            const accountId = await getTeamAccountId(accessToken);

            let sawMissing = false;
            let stopOnUnchanged = false;
            let unchangedStopAt: string | null = null;

            let scanned = 0;
            let enqueued = 0;

            progress({ kind: 'chatgpt.scanner.started', limit: LIMIT, tailSize: TAIL_SIZE });

            let offset = 0;
            while (!stopOnUnchanged) {
              const list = await listConversations(offset, accessToken, accountId);
              const items = list && Array.isArray(list.items) ? list.items : [];
              if (items.length === 0) break;

              const rows = items
                .map((it: any) => {
                  const id = String(it && it.id ? it.id : '').trim();
                  if (!id) return null;
                  const title = typeof it.title === 'string' ? it.title : null;
                  const url = 'https://chatgpt.com/c/' + id;
                  return { id, title, url, groupId: PLATFORM + ':' + id };
                })
                .filter(Boolean) as Array<{
                id: string;
                title: string | null;
                url: string;
                groupId: string;
              }>;

              const groupIds = rows.map((r) => r.groupId);
              const states = await getConversationStates(groupIds);

              const toEnqueue: any[] = [];

              for (const row of rows) {
                scanned += 1;
                const state =
                  states && states[row.groupId] ? states[row.groupId] : { exists: false };

                if (!state.exists) {
                  sawMissing = true;
                  toEnqueue.push({
                    flowId: INGEST_FLOW_ID,
                    args: {
                      ruminerPlatform: PLATFORM,
                      ruminerConversationId: row.id,
                      ruminerConversationUrl: row.url,
                      ...(row.title ? { ruminerConversationTitle: row.title } : {}),
                    },
                  });
                  continue;
                }

                if (state.status === 'skipped') continue;

                if (state.status === 'failed') {
                  toEnqueue.push({
                    flowId: INGEST_FLOW_ID,
                    args: {
                      ruminerPlatform: PLATFORM,
                      ruminerConversationId: row.id,
                      ruminerConversationUrl: row.url,
                      ...(row.title ? { ruminerConversationTitle: row.title } : {}),
                    },
                  });
                  continue;
                }

                if (!sawMissing) {
                  const conv = await fetchConversation(row.id, accessToken, accountId);
                  const msgs = extractConversationMessages(conv);
                  const currentTail = await tailHashes(msgs);
                  const ledgerTail = Array.isArray(state.tailHashes) ? state.tailHashes : [];
                  const unchanged =
                    ledgerTail.length === currentTail.length &&
                    ledgerTail.every((h: string, i: number) => h === currentTail[i]);

                  if (unchanged) {
                    stopOnUnchanged = true;
                    unchangedStopAt = row.id;
                    break;
                  }

                  toEnqueue.push({
                    flowId: INGEST_FLOW_ID,
                    args: {
                      ruminerPlatform: PLATFORM,
                      ruminerConversationId: row.id,
                      ruminerConversationUrl: row.url,
                      ...(row.title ? { ruminerConversationTitle: row.title } : {}),
                    },
                  });
                }
              }

              if (toEnqueue.length > 0) {
                progress({
                  kind: 'chatgpt.scanner.enqueued',
                  conversations: toEnqueue.map((item) => {
                    const args = item && item.args ? item.args : {};
                    const cid = String(args.ruminerConversationId || '').trim();
                    return {
                      platform: PLATFORM,
                      sessionId: PLATFORM + ':' + cid,
                      conversationId: cid,
                      title: args.ruminerConversationTitle || null,
                      url: args.ruminerConversationUrl || null,
                    };
                  }),
                });
                const r = await enqueueRuns(toEnqueue);
                enqueued += Number(r.enqueued || 0);
              }

              progress({
                kind: 'chatgpt.scanner.page',
                offset,
                scanned,
                enqueued,
                sawMissing,
                stopOnUnchanged,
                ...(unchangedStopAt ? { unchangedStopAt } : {}),
              });

              if (stopOnUnchanged) break;
              offset += items.length;
            }

            const durationMs = Date.now() - startedAt;
            notify(
              'ChatGPT – Import All',
              'enqueued ' +
                enqueued +
                ', scanned ' +
                scanned +
                (unchangedStopAt ? ', stopped at unchanged ' + unchangedStopAt : '') +
                ' (' +
                durationMs +
                'ms)',
            );

            progress({
              kind: 'chatgpt.scanner.finished',
              scanned,
              enqueued,
              sawMissing,
              unchangedStopAt,
              durationMs,
            });

            return { ok: true, scanned, enqueued, sawMissing, unchangedStopAt, durationMs };
          } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
        args: [{ runId: ctx.runId, limit: node.config.limit, tailSize: node.config.tailSize }],
      });

      injectedResult = (
        Array.isArray(injected) ? injected[0]?.result : null
      ) as InjectedResult | null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return toErrorResult(RR_ERROR_CODES.SCRIPT_FAILED, `ChatGPT scan injection failed: ${msg}`, {
        error: msg,
      });
    }

    if (!injectedResult) {
      return toErrorResult(RR_ERROR_CODES.SCRIPT_FAILED, 'ChatGPT scan returned no result');
    }

    if (!injectedResult.ok) {
      return toErrorResult(
        RR_ERROR_CODES.SCRIPT_FAILED,
        injectedResult.error || 'ChatGPT scan failed',
        {
          error: injectedResult.error || 'ChatGPT scan failed',
        },
      );
    }

    return {
      status: 'succeeded',
      outputs: {
        scanned: injectedResult.scanned,
        enqueued: injectedResult.enqueued,
      },
    };
  },
};
