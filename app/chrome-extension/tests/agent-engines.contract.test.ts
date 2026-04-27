import { describe, expect, it } from 'vitest';

import {
  getAgentEngineMetadata,
  getSelectableQuickPanelEngines,
  isAgentCliPreference,
  normalizeQuickPanelEngineName,
  resolveDraftEngineName,
  shouldShowAgentModelSelector,
  supportsAgentModelSelection,
} from '@/common/agent-engines';

describe('agent engines metadata (contract)', () => {
  it('recognizes Hermes as a valid CLI preference', () => {
    expect(isAgentCliPreference('hermes')).toBe(true);
  });

  it('exposes Hermes branding and capability flags', () => {
    expect(getAgentEngineMetadata('hermes')).toMatchObject({
      name: 'hermes',
      displayName: 'Hermes',
      supportsMcp: true,
      supportsModelSelection: false,
      supportsChromeMcpToggle: false,
      supportsImages: true,
    });
  });

  it('defaults new drafts to the selected project preferred engine before fallback', () => {
    expect(
      resolveDraftEngineName({
        selectedCli: '',
        projectPreferredCli: 'hermes',
        fallbackEngine: 'openclaw',
      }),
    ).toBe('hermes');
    expect(
      resolveDraftEngineName({
        selectedCli: 'codex',
        projectPreferredCli: 'hermes',
        fallbackEngine: 'openclaw',
      }),
    ).toBe('codex');
  });

  it('includes Hermes in the quick panel engine picker choices', () => {
    expect(getSelectableQuickPanelEngines().map((engine) => engine.name)).toContain('hermes');
  });

  it('normalizes unsupported quick panel defaults back to a runnable engine', () => {
    expect(normalizeQuickPanelEngineName('cursor')).toBe('openclaw');
    expect(normalizeQuickPanelEngineName('qwen')).toBe('openclaw');
    expect(normalizeQuickPanelEngineName('hermes')).toBe('hermes');
  });

  it('exposes model-selection support consistently with engine metadata', () => {
    expect(supportsAgentModelSelection('hermes')).toBe(false);
    expect(supportsAgentModelSelection('codex')).toBe(true);
  });

  it('only shows static model selectors for engines with selectable runtime models', () => {
    expect(shouldShowAgentModelSelector('hermes')).toBe(false);
    expect(shouldShowAgentModelSelector('openclaw')).toBe(false);
    expect(shouldShowAgentModelSelector('codex')).toBe(true);
  });
});
