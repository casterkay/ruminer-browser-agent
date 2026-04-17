import { STORAGE_KEYS } from '@/common/constants';

export const UI_LANGUAGE_OPTIONS = ['auto', 'en', 'de', 'ja', 'ko', 'zh_CN', 'zh_TW'] as const;

export type UiLanguage = (typeof UI_LANGUAGE_OPTIONS)[number];

const DEFAULT_UI_LANGUAGE: UiLanguage = 'auto';

function normalizeUiLanguage(value: unknown): UiLanguage {
  if (typeof value !== 'string') {
    return DEFAULT_UI_LANGUAGE;
  }

  const normalized = value.trim().replace('-', '_');
  if (UI_LANGUAGE_OPTIONS.includes(normalized as UiLanguage)) {
    return normalized as UiLanguage;
  }

  return DEFAULT_UI_LANGUAGE;
}

export async function getUiLanguage(): Promise<UiLanguage> {
  const raw = (await chrome.storage.local.get(STORAGE_KEYS.UI_LANGUAGE))[STORAGE_KEYS.UI_LANGUAGE];
  return normalizeUiLanguage(raw);
}

export async function setUiLanguage(next: UiLanguage): Promise<UiLanguage> {
  const normalized = normalizeUiLanguage(next);
  await chrome.storage.local.set({ [STORAGE_KEYS.UI_LANGUAGE]: normalized });
  return normalized;
}
