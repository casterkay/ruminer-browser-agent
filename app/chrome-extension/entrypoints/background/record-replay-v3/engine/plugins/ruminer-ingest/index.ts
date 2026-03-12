import type { PluginRegistry } from '../registry';
import type { RRPlugin } from '../types';

import { authCheckNodeDefinition } from './auth-check';
import { batchingNodeDefinition } from './batching';
import { emosIngestNodeDefinition } from './emos-ingest';
import { extractListNodeDefinition } from './extract-list';
import { ledgerUpsertNodeDefinition } from './ledger-upsert';
import { ensureConversationTabNodeDefinition } from './nodes/ensure-conversation-tab';
import { ingestCurrentNodeDefinition } from './nodes/ingest-conversation';
import { scanAndEnqueueNodeDefinition } from './nodes/scan-and-enqueue';
import { normalizeAndHashNodeDefinition } from './normalize-and-hash';
import { pageAuthCheckNodeDefinition } from './page-auth-check';
import { randomDelayNodeDefinition } from './random-delay';

export const ruminerIngestPlugin: RRPlugin = {
  name: 'ruminer-ingest',
  register(ctx) {
    ctx.registerNode(authCheckNodeDefinition);
    ctx.registerNode(pageAuthCheckNodeDefinition);
    ctx.registerNode(extractListNodeDefinition);
    ctx.registerNode(randomDelayNodeDefinition);
    ctx.registerNode(batchingNodeDefinition);
    ctx.registerNode(normalizeAndHashNodeDefinition);
    ctx.registerNode(ledgerUpsertNodeDefinition);
    ctx.registerNode(emosIngestNodeDefinition);
    ctx.registerNode(ingestCurrentNodeDefinition);
    ctx.registerNode(scanAndEnqueueNodeDefinition);
    ctx.registerNode(ensureConversationTabNodeDefinition);
  },
};

export function registerRuminerIngestNodes(registry: PluginRegistry): void {
  registry.registerPlugin(ruminerIngestPlugin);
}
