/**
 * Composable for managing floating icon preference
 *
 * Handles showing/hiding the floating icon on web pages.
 */
import { ref, type Ref } from 'vue';

/** Storage key for persisting floating icon preference */
const STORAGE_KEY_FLOATING_ICON = 'floatingIconEnabled';

/** Default value when none is set */
const DEFAULT_ENABLED = true;

export interface UseFloatingIconPreference {
  /** Whether floating icon is enabled */
  enabled: Ref<boolean>;
  /** Whether preference has been loaded from storage */
  ready: Ref<boolean>;
  /** Set and persist floating icon preference */
  setEnabled: (value: boolean) => Promise<void>;
  /** Load preference from storage (call on mount) */
  initPreference: () => Promise<void>;
  /** Toggle the preference */
  toggle: () => Promise<void>;
}

/**
 * Composable for managing floating icon preference
 */
export function useFloatingIconPreference(): UseFloatingIconPreference {
  const enabled = ref(DEFAULT_ENABLED);
  const ready = ref(false);

  /**
   * Load preference from chrome.storage.local
   */
  async function initPreference(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY_FLOATING_ICON);
      const stored = result[STORAGE_KEY_FLOATING_ICON];

      if (typeof stored === 'boolean') {
        enabled.value = stored;
      }
    } catch (error) {
      console.error('[useFloatingIconPreference] Failed to load preference:', error);
    } finally {
      ready.value = true;
    }
  }

  /**
   * Set and persist preference
   */
  async function setEnabled(value: boolean): Promise<void> {
    enabled.value = value;

    try {
      await chrome.storage.local.set({ [STORAGE_KEY_FLOATING_ICON]: value });
    } catch (error) {
      console.error('[useFloatingIconPreference] Failed to save preference:', error);
    }
  }

  /**
   * Toggle the preference
   */
  async function toggle(): Promise<void> {
    await setEnabled(!enabled.value);
  }

  return {
    enabled,
    ready,
    setEnabled,
    initPreference,
    toggle,
  };
}
