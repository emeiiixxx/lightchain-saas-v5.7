import { useEffect, useRef, type Ref } from 'react';
import type { Locale } from '../i18n';
import { MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH, promptCategoryCopy } from '../prompt-categories';
import { Button } from './ui';

export function PromptCategoryNameInput({ name, locale, size = 'l', disabled, inputRef, onChange, onCancel, onAdd }: {
  name: string;
  locale: Locale;
  size?: 's' | 'm' | 'l';
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (name: string) => void;
  onCancel: () => void;
  onAdd: () => void;
}) {
  const t = promptCategoryCopy[locale];
  const actionSize = size === 's' ? 'xs' : size === 'l' ? 'm' : 's';
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (disabled) return;
    const inputRow = row.current;
    const surface = inputRow?.closest<HTMLElement>('dialog, [role="dialog"]');
    if (!inputRow || !surface) return;
    const dismissOnBlank = (event: PointerEvent) => {
      const target = event.target;
      if (event.button !== 0 || !(target instanceof Element) || inputRow.contains(target)) return;
      if (target.closest('dialog, [role="dialog"]') !== surface) return;
      // Controls (including disabled actions) are not blank space; clicking
      // them must not discard the name or unlock the prompt's footer actions.
      if (target.closest('button, input, textarea, select, label, summary, a[href], [role="button"], [role="tab"], [role="option"], [tabindex], [contenteditable]:not([contenteditable="false"])')) return;
      onCancel();
    };
    surface.addEventListener('pointerdown', dismissOnBlank, true);
    return () => surface.removeEventListener('pointerdown', dismissOnBlank, true);
  }, [disabled, onCancel]);
  return <div ref={row} className="prompt-category-custom" data-node-id={size === 's' ? '152:13054' : undefined} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); if (!disabled) onAdd(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!disabled) onCancel(); }
  }}>
    <div className="prompt-category-name-input" data-node-id={size === 's' ? '152:13059' : '152:12118'}><input ref={inputRef} autoFocus aria-label={t.customName} placeholder={t.placeholder} value={name} maxLength={MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH} disabled={disabled} onChange={event => onChange(event.target.value)} /><span>{name.length}/{MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH}</span></div>
    <div className="prompt-category-custom-actions" data-node-id={size === 's' ? '152:13091' : undefined}>
      <Button variant="primary" size={actionSize} disabled={disabled || !name.trim()} onClick={onAdd}>{t.add}</Button>
    </div>
  </div>;
}
