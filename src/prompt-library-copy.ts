import type { Locale } from './i18n';

export const PROMPT_SAVED_TOAST_DURATION_MS = 3000;

const copy = {
  'zh-CN': { saved: '提示词已保存', suffix: '_副本' },
  en: { saved: 'Prompt saved', suffix: '_copy' },
  ja: { saved: 'プロンプトを保存しました', suffix: '_コピー' },
};

export const promptSavedMessage = (locale: Locale) => copy[locale].saved;

// Both editors reserve only the suffix's length within the existing title limit.
export function promptCopyName(name: string, locale: Locale) {
  const suffix = copy[locale].suffix;
  const base = name.trim().slice(0, 50 - suffix.length).replace(/[\uD800-\uDBFF]$/, '');
  return base + suffix;
}
