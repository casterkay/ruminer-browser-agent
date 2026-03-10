/**
 * @fileoverview FlowV3 持久化
 * @description 实现 Flow 的 CRUD 操作
 */

import { normalizeToolList } from '@/common/flow-approvals';
import { sha256Hex } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/hash';
import { stableJson } from '@/entrypoints/shared/utils/stable-json';
import { RR_ERROR_CODES, createRRError } from '../domain/errors';
import type { FlowV3 } from '../domain/flow';
import { FLOW_SCHEMA_VERSION } from '../domain/flow';
import type { FlowId } from '../domain/ids';
import type { FlowsStore } from '../engine/storage/storage-port';
import { RR_V3_STORES, withTransaction } from './db';

async function computeFlowVersionHash(flow: FlowV3): Promise<string> {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = flow;

  const meta = rest.meta ? { ...rest.meta } : undefined;
  if (meta) {
    delete (meta as Partial<typeof meta>).versionHash;
  }

  const payload: Omit<FlowV3, 'createdAt' | 'updatedAt'> = {
    ...rest,
    ...(meta ? { meta } : {}),
  } as Omit<FlowV3, 'createdAt' | 'updatedAt'>;

  return sha256Hex(stableJson(payload));
}

/**
 * 校验 Flow 结构
 */
function validateFlow(flow: FlowV3): void {
  // 校验 schema 版本
  if (flow.schemaVersion !== FLOW_SCHEMA_VERSION) {
    throw createRRError(
      RR_ERROR_CODES.VALIDATION_ERROR,
      `Invalid schema version: expected ${FLOW_SCHEMA_VERSION}, got ${flow.schemaVersion}`,
    );
  }

  // 校验必填字段
  if (!flow.id) {
    throw createRRError(RR_ERROR_CODES.VALIDATION_ERROR, 'Flow id is required');
  }
  if (!flow.name) {
    throw createRRError(RR_ERROR_CODES.VALIDATION_ERROR, 'Flow name is required');
  }
  if (!flow.entryNodeId) {
    throw createRRError(RR_ERROR_CODES.VALIDATION_ERROR, 'Flow entryNodeId is required');
  }

  // 校验 entryNodeId 存在
  const nodeIds = new Set(flow.nodes.map((n) => n.id));
  if (!nodeIds.has(flow.entryNodeId)) {
    throw createRRError(
      RR_ERROR_CODES.VALIDATION_ERROR,
      `Entry node "${flow.entryNodeId}" does not exist in flow`,
    );
  }

  // 校验边引用
  for (const edge of flow.edges) {
    if (!nodeIds.has(edge.from)) {
      throw createRRError(
        RR_ERROR_CODES.VALIDATION_ERROR,
        `Edge "${edge.id}" references non-existent source node "${edge.from}"`,
      );
    }
    if (!nodeIds.has(edge.to)) {
      throw createRRError(
        RR_ERROR_CODES.VALIDATION_ERROR,
        `Edge "${edge.id}" references non-existent target node "${edge.to}"`,
      );
    }
  }
}

/**
 * 创建 FlowsStore 实现
 */
export function createFlowsStore(): FlowsStore {
  return {
    async list(): Promise<FlowV3[]> {
      return withTransaction(RR_V3_STORES.FLOWS, 'readonly', async (stores) => {
        const store = stores[RR_V3_STORES.FLOWS];
        return new Promise<FlowV3[]>((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result as FlowV3[]);
          request.onerror = () => reject(request.error);
        });
      });
    },

    async get(id: FlowId): Promise<FlowV3 | null> {
      return withTransaction(RR_V3_STORES.FLOWS, 'readonly', async (stores) => {
        const store = stores[RR_V3_STORES.FLOWS];
        return new Promise<FlowV3 | null>((resolve, reject) => {
          const request = store.get(id);
          request.onsuccess = () => resolve((request.result as FlowV3) ?? null);
          request.onerror = () => reject(request.error);
        });
      });
    },

    async save(flow: FlowV3): Promise<void> {
      // TODO(FR-032): Consider inferring `meta.requiredTools` for V3 flows when missing/empty.
      // Today we only normalize the provided list, which means flows edited/created via the
      // builder/RPC can accidentally omit tools and bypass user re-approval expectations.
      const requiredTools = normalizeToolList(flow.meta?.requiredTools);

      const withoutVersionHash: FlowV3 = {
        ...flow,
        meta: {
          ...(flow.meta ?? {}),
          ...(requiredTools.length > 0 ? { requiredTools } : {}),
        },
      };

      const versionHash = await computeFlowVersionHash(withoutVersionHash);
      const normalized: FlowV3 = {
        ...withoutVersionHash,
        meta: {
          ...(withoutVersionHash.meta ?? {}),
          versionHash,
        },
      };

      // 校验
      validateFlow(normalized);

      return withTransaction(RR_V3_STORES.FLOWS, 'readwrite', async (stores) => {
        const store = stores[RR_V3_STORES.FLOWS];
        return new Promise<void>((resolve, reject) => {
          const request = store.put(normalized);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      });
    },

    async delete(id: FlowId): Promise<void> {
      return withTransaction(RR_V3_STORES.FLOWS, 'readwrite', async (stores) => {
        const store = stores[RR_V3_STORES.FLOWS];
        return new Promise<void>((resolve, reject) => {
          const request = store.delete(id);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      });
    },
  };
}
