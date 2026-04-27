/**
 * Chrome Extension i18n utility
 * Provides safe access to chrome.i18n.getMessage with fallbacks
 */

// Fallback messages for when Chrome APIs aren't available (English)
const fallbackMessages: Record<string, string> = {
  // Extension metadata
  extensionName: 'ruminer-browser-agent',
  extensionDescription: 'Exposes browser capabilities with your own chrome',

  // Section headers
  nativeServerConfigLabel: 'Native Server Configuration',
  semanticEngineLabel: 'Semantic Engine',
  embeddingModelLabel: 'Embedding Model',
  indexDataManagementLabel: 'Index Data Management',
  modelCacheManagementLabel: 'Model Cache Management',

  // Status labels
  statusLabel: 'Status',
  runningStatusLabel: 'Running Status',
  connectionStatusLabel: 'Connection Status',
  lastUpdatedLabel: 'Last Updated:',

  // Connection states
  connectButton: 'Connect',
  disconnectButton: 'Disconnect',
  connectingStatus: 'Connecting...',
  connectedStatus: 'Connected',
  disconnectedStatus: 'Disconnected',
  detectingStatus: 'Detecting...',

  // Server states
  serviceRunningStatus: 'Service Running (Port: {0})',
  serviceNotConnectedStatus: 'Service Not Connected',
  connectedServiceNotStartedStatus: 'Connected, Service Not Started',

  // Configuration labels
  mcpServerConfigLabel: 'MCP Server Configuration',
  connectionPortLabel: 'Connection Port',
  refreshStatusButton: 'Refresh Status',
  copyConfigButton: 'Copy Configuration',

  // Action buttons
  retryButton: 'Retry',
  cancelButton: 'Cancel',
  confirmButton: 'Confirm',
  saveButton: 'Save',
  closeButton: 'Close',
  resetButton: 'Reset',

  // Progress states
  initializingStatus: 'Initializing...',
  processingStatus: 'Processing...',
  loadingStatus: 'Loading...',
  clearingStatus: 'Clearing...',
  cleaningStatus: 'Cleaning...',
  downloadingStatus: 'Downloading...',

  // Semantic engine states
  semanticEngineReadyStatus: 'Semantic Engine Ready',
  semanticEngineInitializingStatus: 'Semantic Engine Initializing...',
  semanticEngineInitFailedStatus: 'Semantic Engine Initialization Failed',
  semanticEngineNotInitStatus: 'Semantic Engine Not Initialized',
  initSemanticEngineButton: 'Initialize Semantic Engine',
  reinitializeButton: 'Reinitialize',

  // Model states
  downloadingModelStatus: 'Downloading Model... {0}%',
  switchingModelStatus: 'Switching Model...',
  modelLoadedStatus: 'Model Loaded',
  modelFailedStatus: 'Model Failed to Load',

  // Model descriptions
  lightweightModelDescription: 'Lightweight Multilingual Model',
  betterThanSmallDescription: 'Slightly larger than e5-small, but better performance',
  multilingualModelDescription: 'Multilingual Semantic Model',

  // Performance levels
  fastPerformance: 'Fast',
  balancedPerformance: 'Balanced',
  accuratePerformance: 'Accurate',

  // Error messages
  networkErrorMessage: 'Network connection error, please check network and retry',
  modelCorruptedErrorMessage: 'Model file corrupted or incomplete, please retry download',
  unknownErrorMessage: 'Unknown error, please check if your network can access HuggingFace',
  permissionDeniedErrorMessage: 'Permission denied',
  timeoutErrorMessage: 'Operation timed out',

  // Data statistics
  indexedPagesLabel: 'Indexed Pages',
  indexSizeLabel: 'Index Size',
  activeTabsLabel: 'Active Tabs',
  vectorDocumentsLabel: 'Vector Documents',
  cacheSizeLabel: 'Cache Size',
  cacheEntriesLabel: 'Cache Entries',

  // Data management
  clearAllDataButton: 'Clear All Data',
  clearAllCacheButton: 'Clear All Cache',
  cleanExpiredCacheButton: 'Clean Expired Cache',
  exportDataButton: 'Export Data',
  importDataButton: 'Import Data',

  // Dialog titles
  confirmClearDataTitle: 'Confirm Clear Data',
  settingsTitle: 'Settings',
  aboutTitle: 'About',
  helpTitle: 'Help',

  // Dialog messages
  clearDataWarningMessage:
    'This operation will clear all indexed webpage content and vector data, including:',
  clearDataList1: 'All webpage text content index',
  clearDataList2: 'Vector embedding data',
  clearDataList3: 'Search history and cache',
  clearDataIrreversibleWarning:
    'This operation is irreversible! After clearing, you need to browse webpages again to rebuild the index.',
  confirmClearButton: 'Confirm Clear',

  // Cache states
  cacheDetailsLabel: 'Cache Details',
  noCacheDataMessage: 'No cache data',
  loadingCacheInfoStatus: 'Loading cache information...',
  processingCacheStatus: 'Processing cache...',
  expiredLabel: 'Expired',

  // Browser integration
  bookmarksBarLabel: 'Bookmarks Bar',
  newTabLabel: 'New Tab',
  currentPageLabel: 'Current Page',

  // Accessibility
  menuLabel: 'Menu',
  navigationLabel: 'Navigation',
  mainContentLabel: 'Main Content',

  // Future features
  languageSelectorLabel: 'Language',
  themeLabel: 'Theme',
  lightTheme: 'Light',
  darkTheme: 'Dark',
  autoTheme: 'Auto',
  advancedSettingsLabel: 'Advanced Settings',
  debugModeLabel: 'Debug Mode',
  verboseLoggingLabel: 'Verbose Logging',

  // Notifications
  successNotification: 'Operation completed successfully',
  warningNotification: 'Warning: Please review before proceeding',
  infoNotification: 'Information',
  configCopiedNotification: 'Configuration copied to clipboard',
  dataClearedNotification: 'Data cleared successfully',

  // Units
  bytesUnit: 'bytes',
  kilobytesUnit: 'KB',
  megabytesUnit: 'MB',
  gigabytesUnit: 'GB',
  itemsUnit: 'items',
  pagesUnit: 'pages',

  // Legacy keys for backwards compatibility
  nativeServerConfig: 'Native Server Configuration',
  runningStatus: 'Running Status',
  refreshStatus: 'Refresh Status',
  lastUpdated: 'Last Updated:',
  mcpServerConfig: 'MCP Server Configuration',
  connectionPort: 'Connection Port',
  connecting: 'Connecting...',
  disconnect: 'Disconnect',
  connect: 'Connect',
  semanticEngine: 'Semantic Engine',
  embeddingModel: 'Embedding Model',
  retry: 'Retry',
  indexDataManagement: 'Index Data Management',
  clearing: 'Clearing...',
  clearAllData: 'Clear All Data',
  copyConfig: 'Copy Configuration',
  serviceRunning: 'Service Running (Port: {0})',
  connectedServiceNotStarted: 'Connected, Service Not Started',
  serviceNotConnected: 'Service Not Connected',
  detecting: 'Detecting...',
  lightweightModel: 'Lightweight Multilingual Model',
  betterThanSmall: 'Slightly larger than e5-small, but better performance',
  multilingualModel: 'Multilingual Semantic Model',
  fast: 'Fast',
  balanced: 'Balanced',
  accurate: 'Accurate',
  semanticEngineReady: 'Semantic Engine Ready',
  semanticEngineInitializing: 'Semantic Engine Initializing...',
  semanticEngineInitFailed: 'Semantic Engine Initialization Failed',
  semanticEngineNotInit: 'Semantic Engine Not Initialized',
  downloadingModel: 'Downloading Model... {0}%',
  switchingModel: 'Switching Model...',
  networkError: 'Network connection error, please check network and retry',
  modelCorrupted: 'Model file corrupted or incomplete, please retry download',
  unknownError: 'Unknown error, please check if your network can access HuggingFace',
  reinitialize: 'Reinitialize',
  initializing: 'Initializing...',
  initSemanticEngine: 'Initialize Semantic Engine',
  indexedPages: 'Indexed Pages',
  indexSize: 'Index Size',
  activeTabs: 'Active Tabs',
  vectorDocuments: 'Vector Documents',
  confirmClearData: 'Confirm Clear Data',
  clearDataWarning:
    'This operation will clear all indexed webpage content and vector data, including:',
  clearDataIrreversible:
    'This operation is irreversible! After clearing, you need to browse webpages again to rebuild the index.',
  confirmClear: 'Confirm Clear',
  cancel: 'Cancel',
  confirm: 'Confirm',
  processing: 'Processing...',
  modelCacheManagement: 'Model Cache Management',
  cacheSize: 'Cache Size',
  cacheEntries: 'Cache Entries',
  cacheDetails: 'Cache Details',
  noCacheData: 'No cache data',
  loadingCacheInfo: 'Loading cache information...',
  processingCache: 'Processing cache...',
  cleaning: 'Cleaning...',
  cleanExpiredCache: 'Clean Expired Cache',
  clearAllCache: 'Clear All Cache',
  expired: 'Expired',
  bookmarksBar: 'Bookmarks Bar',

  // Chat composer placeholders
  chatPlaceholderEmpty: 'Type to search memory or chat with AI...',
  chatPlaceholderNonempty: 'Send a message to assistant...',

  // System settings notifications
  settingsGatewaySavedNotification: 'Gateway settings saved',
  settingsEmosSavedNotification: 'Memory settings saved',
  settingsQuickPanelSavedNotification: 'Quick Panel settings saved',
  settingsAnthropicSavedNotification: 'Anthropic settings saved',
  settingsHermesSavedNotification: 'Hermes settings saved',
  settingsLanguageSavedNotification: 'Language preference saved',
  settingsFloatingIconSizeSavedNotification: 'Floating icon size saved: {0}px',
  refreshStatusButtonAria: 'Refresh status',
  testConnectionButtonAria: 'Test connection',

  // Settings cards and fields
  settingsCardMcpServerTitle: 'MCP Server',
  settingsCardQuickChatTitle: 'Quick Chat',
  settingsCardGatewayTitle: 'OpenClaw Gateway',
  settingsCardMemoryTitle: 'Memory',
  settingsCardLanguageTitle: 'Language',
  settingsCardClaudeCodeTitle: 'Claude Code',
  settingsCardHermesTitle: 'Hermes',
  settingsStatusRunning: 'Running',
  settingsStatusStopped: 'Stopped',
  settingsPortLabel: 'Port',
  settingsPortDefaultValuePrefix: 'Default:',
  settingsQuickChatShowInPageButtonLabel: 'Show in-page button',
  settingsQuickChatFloatingIconSizeLabel: 'Floating icon size',
  settingsFieldGatewayWsUrlLabel: 'Gateway WS URL',
  settingsFieldAuthTokenLabel: 'Auth Token',
  settingsFieldBackendLabel: 'Backend',
  settingsFieldDirectoryPathLabel: 'Directory Path',
  settingsFieldQmdIndexLabel: 'QMD Index',
  settingsFieldBaseUrlLabel: 'Base URL',
  settingsFieldApiKeyLabel: 'API Key',
  settingsFieldWorkspaceRootLabel: 'Workspace Root',
  settingsBackendLocalFileSystemOption: 'Local File System',
  settingsBackendEvermemosOption: 'EverMemOS',
  settingsMemoryLegacyNotice:
    'Legacy remote backend. Ruminer still routes memory operations through the native server.',
  settingsHermesServerHint:
    'Ruminer connects to an existing Hermes API server. Start it separately with `hermes api-server`.',
  settingsHermesWorkspaceHint:
    'Set this to the exact workspace root used by your Hermes API server. Ruminer will only use Hermes when it matches the selected project.',
  settingsPlaceholderGatewayWsUrl: 'ws://127.0.0.1:18789',
  settingsPlaceholderGatewayAuthToken: 'gateway token',
  settingsPlaceholderMemoryLocalRootPath: 'User-global app data directory',
  settingsPlaceholderEvermemosBaseUrl: 'https://api.evermind.ai',
  settingsPlaceholderEvermemosApiKey: 'legacy EverMemOS API key',
  settingsPlaceholderAnthropicBaseUrl: 'https://api.anthropic.com',
  settingsPlaceholderAnthropicApiKey: 'your Anthropic API key',
  settingsPlaceholderHermesBaseUrl: 'http://127.0.0.1:8642',
  settingsPlaceholderHermesApiKey: 'your Hermes API server key',
  settingsPlaceholderHermesWorkspaceRoot: '/absolute/path/to/project',
  settingsLanguageOptionAuto: 'Follow browser language',
  settingsLanguageOptionEnglish: 'English',
  settingsLanguageOptionGerman: 'Deutsch',
  settingsLanguageOptionJapanese: 'Japanese',
  settingsLanguageOptionKorean: 'Korean',
  settingsLanguageOptionSimplifiedChinese: 'Simplified Chinese',
  settingsLanguageOptionTraditionalChinese: 'Traditional Chinese',
  settingsLanguageHint:
    'Language preference is saved locally. Reopen extension pages to apply updates.',

  // Welcome page
  welcomeBadgeText: 'Chrome MCP • Memory • OpenClaw • Claude Code • Codex • Hermes',
  welcomeTitle: 'Ruminer Browser Agent',
  welcomeSubtitle:
    'One browser, one memory, many agents. This page helps you wire up Ruminer across OpenClaw, Claude Code, Codex, and Hermes for browser automation.',
  welcomeStepInstallTitle: '1) Run the Installation Command',
  welcomeStepInstallSubtitle:
    'This registers the native MCP server in Claude Code, Codex, Hermes, and installs an OpenClaw plugin as MCP client.',
  welcomeInstallTipPrefix: 'Tip: you can review the script in your browser first.',
  welcomeInstallTipSuffix: 'is powerful - apply it with care.',
  welcomeStepLanguageTitle: '2) Choose Interface Language',
  welcomeStepLanguageSubtitle: 'Set your preferred language for Ruminer extension interfaces.',
  welcomeStepGatewayTitle: '3) Configure OpenClaw Gateway',
  welcomeStepGatewaySubtitle: 'If used as AI agent backend.',
  welcomeStepMemoryTitle: '4) Configure Memory Store',
  welcomeStepMemorySubtitle: 'Storage of your conversations and agent memories.',
  welcomeStepHermesTitle: '5) Configure Hermes Agent',
  welcomeStepHermesSubtitle:
    'Connect Ruminer to a running Hermes API server. Ruminer does not launch or supervise Hermes for you.',
  welcomeTestingButtonLabel: 'Testing...',
  welcomeTestButtonLabel: 'Test',
  welcomeChecklistTitle: 'Checklist',
  welcomeTroubleshootingButtonLabel: 'Troubleshooting',
  welcomeChecklistItemInstall: 'Run the one-liner installation command.',
  welcomeChecklistItemVerifyConnectionPrefix:
    'Start Claude Code / Codex CLI and confirm you see a successful connection to the MCP server',
  welcomeChecklistItemRunTools:
    'Ask your agent to call some browser tools, like "What tabs are there in my browser?"',
  welcomeChecklistItemHermesServer:
    'If you use Hermes Agent, start it with `hermes api-server` and verify the connection here.',
  welcomeChecklistItemQuickChat:
    "Click the floating button at the bottom right to toggle Ruminer's side panel or hover on it to open the quick chat UI!",
  welcomeCopyButtonLabel: 'Copy',
  welcomeCopiedButtonLabel: 'Copied',
};

/**
 * Safe i18n message getter with fallback support
 * @param key Message key
 * @param substitutions Optional substitution values
 * @returns Localized message or fallback
 */
export function getMessage(key: string, substitutions?: string[]): string {
  try {
    // Check if Chrome extension APIs are available
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
      const message = chrome.i18n.getMessage(key, substitutions);
      if (message) {
        return message;
      }
    }
  } catch (error) {
    console.warn(`Failed to get i18n message for key "${key}":`, error);
  }

  // Fallback to English messages
  let fallback = fallbackMessages[key] || key;

  // Handle substitutions in fallback messages
  if (substitutions && substitutions.length > 0) {
    substitutions.forEach((value, index) => {
      fallback = fallback.replace(`{${index}}`, value);
    });
  }

  return fallback;
}

/**
 * Check if Chrome extension i18n APIs are available
 */
export function isI18nAvailable(): boolean {
  try {
    return (
      typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function'
    );
  } catch {
    return false;
  }
}
