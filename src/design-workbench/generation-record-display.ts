import type { GenerationRecord } from './components/CanvasLeftPanel';
import type { Locale } from '../i18n';
import { commerceCropPlatformLabel } from '../commerce-crop-presets';

// Old in-session print records predate supportsPrompt; do not expose their generated summary as a prompt.
const isPrintRecord = (record: GenerationRecord) => record.title === '款式 - 印花上身';
export function recordHasPrompt(record: GenerationRecord) {
  return (record.supportsPrompt ?? !isPrintRecord(record)) && !!record.prompt?.trim();
}
export function recordHasPromptActions(record: GenerationRecord) {
  return recordHasPrompt(record) && !record.textEdit && record.title !== '文字编辑';
}
export function recordDisplayTags(record: GenerationRecord, locale: Locale = 'zh-CN') {
  if (record.title === '智能裁图') return record.tags.map(tag => tag.image ? tag
    : { ...tag, label: commerceCropPlatformLabel(tag.label, locale) });
  if (!isPrintRecord(record) || record.tags.some(tag => tag.label === '指定位置' || tag.label === '满印')) return record.tags;
  const mode = record.printMode ?? (record.prompt?.includes('满印') ? 'repeat' : record.prompt?.includes('指定位置') ? 'position' : undefined);
  if (!mode) return record.tags;
  const tags = [...record.tags];
  const index = tags.findIndex(tag => tag.label === '印花图');
  tags.splice(index < 0 ? tags.length : index + 1, 0, { label: mode === 'repeat' ? '满印' : '指定位置' });
  return tags;
}
