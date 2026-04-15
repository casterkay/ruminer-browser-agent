/**
 * @fileoverview Shared Utilities Index
 * @description Utility functions shared between UI entrypoints
 */

// Flow conversion utilities
export {
  extractFlowCandidates,
  flowV2ToV3ForRpc,
  flowV3ToV2ForBuilder,
  isFlowV2,
  isFlowV3,
  type FlowConversionResult,
} from './rr-flow-convert';

// Gateway/OpenClaw settings
export {
  getDefaultGatewaySettings,
  getGatewaySettings,
  getGatewayStatus,
  getOrCreateGatewayDeviceId,
  isGatewayConfigured,
  setGatewaySettings,
  setGatewayStatus,
  type GatewayConnectionSettings,
  type GatewayConnectionStatus,
} from './gateway-settings';

// EverMemOS settings
export {
  getDefaultEmosSettings,
  getEmosSettings,
  setEmosSettings,
  type EmosConnectionSettings,
} from './emos-settings';
export {
  getDefaultMemorySettings,
  getMemorySettings,
  setMemorySettings,
  type MemoryConnectionSettings,
} from './memory-settings';
export {
  clearIndividualToolOverrides,
  getDefaultToolGroupState,
  getEffectiveEnabledToolIds,
  getIndividualToolState,
  getToolGroupState,
  isToolGroupEnabled,
  setIndividualToolOverride,
  setToolGroupEnabled,
  setToolGroupState,
  type IndividualToolState,
  type ToolGroupId,
  type ToolGroupState,
} from './tool-groups';

export { stableJson } from './stable-json';
