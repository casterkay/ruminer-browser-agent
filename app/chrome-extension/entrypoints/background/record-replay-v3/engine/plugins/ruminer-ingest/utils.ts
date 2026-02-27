import type { JsonObject, JsonValue } from '../../../domain/json';
import { RR_ERROR_CODES, createRRError, type RRError } from '../../../domain/errors';
import type { NodeExecutionResult } from '../types';

type ScriptSuccess = { ok: true; value: unknown };
type ScriptFailure = { ok: false; error: string };
type ScriptExecutionResult = ScriptSuccess | ScriptFailure;

interface ScriptArgs {
  script: string;
  input: unknown;
  vars: Record<string, JsonValue>;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function ensureObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

export function toStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const list = value.filter((item): item is string => typeof item === 'string');
  return list.length > 0 ? list : undefined;
}

export function toErrorResult(
  code: RRError['code'],
  message: string,
  data?: JsonValue,
  retryable?: boolean,
): NodeExecutionResult {
  return {
    status: 'failed',
    error: createRRError(code, message, {
      data,
      retryable,
    }),
  };
}

export function toScriptFailedResult(message: string, data?: JsonValue): NodeExecutionResult {
  return toErrorResult(RR_ERROR_CODES.SCRIPT_FAILED, message, data);
}

export async function runWorkflowScriptInTab(
  tabId: number,
  args: ScriptArgs,
): Promise<ScriptExecutionResult> {
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (payload: ScriptArgs): Promise<ScriptExecutionResult> => {
        try {
          const runner = new Function(
            'input',
            'vars',
            'context',
            `"use strict";\n${payload.script}`,
          ) as (input: unknown, vars: Record<string, unknown>, context: JsonObject) => unknown;

          const context: JsonObject = {
            url: window.location.href,
            title: document.title,
            timestamp: new Date().toISOString(),
          };
          const value = await Promise.resolve(runner(payload.input, payload.vars, context));
          return { ok: true, value };
        } catch (error) {
          return { ok: false, error: stringifyError(error) };
        }
      },
      args: [args],
    });
    const result = injected[0]?.result;
    if (!result) {
      return { ok: false, error: 'Script execution returned no result' };
    }
    return result;
  } catch (error) {
    return { ok: false, error: stringifyError(error) };
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
