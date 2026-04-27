import { getModelsForCli } from '@/common/agent-models';
import type { AgentCliPreference } from 'chrome-mcp-shared';

export type AgentEngineIconFallback = 'cpu' | 'pointer' | 'sparkles' | 'brain' | 'feather';

export interface AgentEngineMetadata {
  name: string;
  displayName: string;
  iconPath: string;
  iconFallback: AgentEngineIconFallback;
  supportsMcp: boolean;
  supportsImages: boolean;
  supportsModelSelection: boolean;
  supportsChromeMcpToggle: boolean;
}

const UNKNOWN_ENGINE_METADATA: AgentEngineMetadata = {
  name: '',
  displayName: 'Agent',
  iconPath: '',
  iconFallback: 'cpu',
  supportsMcp: false,
  supportsImages: false,
  supportsModelSelection: false,
  supportsChromeMcpToggle: false,
};

const ENGINE_METADATA_BY_NAME: Record<AgentCliPreference, AgentEngineMetadata> = {
  openclaw: {
    name: 'openclaw',
    displayName: 'OpenClaw',
    iconPath: 'engine-icons/openclaw.svg',
    iconFallback: 'cpu',
    supportsMcp: false,
    supportsImages: true,
    supportsModelSelection: true,
    supportsChromeMcpToggle: false,
  },
  claude: {
    name: 'claude',
    displayName: 'Claude Code',
    iconPath: 'engine-icons/claude.png',
    iconFallback: 'cpu',
    supportsMcp: true,
    supportsImages: true,
    supportsModelSelection: true,
    supportsChromeMcpToggle: true,
  },
  codex: {
    name: 'codex',
    displayName: 'Codex',
    iconPath: 'engine-icons/codex.svg',
    iconFallback: 'cpu',
    supportsMcp: false,
    supportsImages: true,
    supportsModelSelection: true,
    supportsChromeMcpToggle: true,
  },
  hermes: {
    name: 'hermes',
    displayName: 'Hermes',
    iconPath: 'engine-icons/hermes.svg',
    iconFallback: 'feather',
    supportsMcp: true,
    supportsImages: true,
    supportsModelSelection: false,
    supportsChromeMcpToggle: false,
  },
  cursor: {
    name: 'cursor',
    displayName: 'Cursor',
    iconPath: '',
    iconFallback: 'pointer',
    supportsMcp: false,
    supportsImages: false,
    supportsModelSelection: true,
    supportsChromeMcpToggle: false,
  },
  qwen: {
    name: 'qwen',
    displayName: 'Qwen',
    iconPath: '',
    iconFallback: 'sparkles',
    supportsMcp: false,
    supportsImages: false,
    supportsModelSelection: true,
    supportsChromeMcpToggle: false,
  },
  glm: {
    name: 'glm',
    displayName: 'GLM',
    iconPath: '',
    iconFallback: 'brain',
    supportsMcp: false,
    supportsImages: false,
    supportsModelSelection: true,
    supportsChromeMcpToggle: false,
  },
};

const QUICK_PANEL_ENGINE_NAMES = ['openclaw', 'claude', 'codex', 'hermes'] as const;
const QUICK_PANEL_ENGINE_NAME_SET = new Set<string>(QUICK_PANEL_ENGINE_NAMES);

export type QuickPanelEngineName = (typeof QUICK_PANEL_ENGINE_NAMES)[number];

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isAgentCliPreference(value: unknown): value is AgentCliPreference {
  const normalized = normalizeString(value);
  return normalized in ENGINE_METADATA_BY_NAME;
}

export function getAgentEngineMetadata(engineName: unknown): AgentEngineMetadata {
  const normalized = normalizeString(engineName);
  if (!isAgentCliPreference(normalized)) {
    return {
      ...UNKNOWN_ENGINE_METADATA,
      name: normalized,
      displayName: normalized || UNKNOWN_ENGINE_METADATA.displayName,
    };
  }
  return ENGINE_METADATA_BY_NAME[normalized];
}

export function isQuickPanelEngineName(value: unknown): value is QuickPanelEngineName {
  const normalized = normalizeString(value);
  return QUICK_PANEL_ENGINE_NAME_SET.has(normalized);
}

export function normalizeQuickPanelEngineName(
  value: unknown,
  fallback: QuickPanelEngineName = 'openclaw',
): QuickPanelEngineName {
  const normalized = normalizeString(value);
  return isQuickPanelEngineName(normalized) ? normalized : fallback;
}

export function getAgentEngineDisplayName(engineName: unknown): string {
  return getAgentEngineMetadata(engineName).displayName;
}

export function getAgentEngineIconPath(engineName: unknown): string {
  return getAgentEngineMetadata(engineName).iconPath;
}

export function getAgentEngineIconUrl(engineName: unknown): string {
  const path = getAgentEngineIconPath(engineName);
  if (!path) return '';

  try {
    if (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) {
      return chrome.runtime.getURL(path);
    }
  } catch {
    // ignore
  }

  return `/${path}`;
}

export function resolveDraftEngineName(input: {
  selectedCli?: string | null;
  projectPreferredCli?: string | null;
  fallbackEngine?: string | null;
}): string {
  return (
    normalizeString(input.selectedCli) ||
    normalizeString(input.projectPreferredCli) ||
    normalizeString(input.fallbackEngine) ||
    ''
  );
}

export function getSelectableQuickPanelEngines(): AgentEngineMetadata[] {
  return QUICK_PANEL_ENGINE_NAMES.map((name) => ENGINE_METADATA_BY_NAME[name]);
}

export function supportsAgentModelSelection(engineName: unknown): boolean {
  return getAgentEngineMetadata(engineName).supportsModelSelection;
}

export function shouldShowAgentModelSelector(engineName: unknown): boolean {
  const normalized = normalizeString(engineName);
  return supportsAgentModelSelection(normalized) && getModelsForCli(normalized).length > 0;
}
