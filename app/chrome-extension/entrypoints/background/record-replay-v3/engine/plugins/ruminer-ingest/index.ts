import type { RRPlugin } from '../types';
import type { PluginRegistry } from '../registry';

import { authCheckNodeDefinition } from './auth-check';
import { extractListNodeDefinition } from './extract-list';
import { extractMessagesNodeDefinition } from './extract-messages';
import { normalizeAndHashNodeDefinition } from './normalize-and-hash';
import { ledgerUpsertNodeDefinition } from './ledger-upsert';
import { emosIngestNodeDefinition } from './emos-ingest';
import { batchingNodeDefinition } from './batching';

export const ruminerIngestPlugin: RRPlugin = {
  name: 'ruminer-ingest',
  register(ctx) {
    ctx.registerNode(authCheckNodeDefinition);
    ctx.registerNode(extractListNodeDefinition);
    ctx.registerNode(extractMessagesNodeDefinition);
    ctx.registerNode(batchingNodeDefinition);
    ctx.registerNode(normalizeAndHashNodeDefinition);
    ctx.registerNode(ledgerUpsertNodeDefinition);
    ctx.registerNode(emosIngestNodeDefinition);
  },
};

export function registerRuminerIngestNodes(registry: PluginRegistry): void {
  registry.registerPlugin(ruminerIngestPlugin);
}
