/**
 * @fileoverview Shared Utilities Index
 * @description Utility functions shared between UI entrypoints
 */

// Flow conversion utilities
export {
  flowV2ToV3ForRpc,
  flowV3ToV2ForBuilder,
  isFlowV3,
  isFlowV2,
  extractFlowCandidates,
  type FlowConversionResult,
} from './rr-flow-convert';

// OpenClaw settings and tool-group helpers
export {
  getGatewaySettings,
  setGatewaySettings,
  getGatewayStatus,
  setGatewayStatus,
  getOrCreateGatewayDeviceId,
  isGatewayConfigured,
  getEmosSettings,
  setEmosSettings,
  getDefaultGatewaySettings,
  getDefaultEmosSettings,
  type GatewayConnectionSettings,
  type GatewayConnectionStatus,
  type EmosConnectionSettings,
} from './openclaw-settings';
export {
  buildToolGroupRestrictionText,
  clearIndividualToolOverrides,
  getDefaultToolGroupState,
  getEffectiveEnabledToolIds,
  getIndividualToolState,
  getToolGroupState,
  setIndividualToolOverride,
  setToolGroupState,
  setToolGroupEnabled,
  isToolGroupEnabled,
  getDisabledToolGroups,
  type IndividualToolState,
  type ToolGroupId,
  type ToolGroupState,
} from './tool-groups';

export { stableJson } from './stable-json';
