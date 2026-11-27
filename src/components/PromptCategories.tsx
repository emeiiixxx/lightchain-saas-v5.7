import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { Locale } from '../i18n';
import type { PromptCategoryCreateResult } from '../prompt-storage';
import { promptCategoryCopy, promptCategoryLabel, normalizePromptCategory } from '../prompt-categories';
import { Button, type IconName } from './ui';
import { usePresence } from '../usePresence';
import { SettingSelect } from './SettingSelect';
import { PromptCategoryCreateDialog } from './PromptCategoryCreateDialog';
import './prompt-categories.css';

type CategoryFieldProps = {
  categories: string[];
  value: string;
  locale: Locale;
  onChange: (value: string) => void;
  disabled?: boolean;
  size?: 's' | 'm' | 'l';
  addIcon?: IconName;
  onCreateCategory: (name: string) => Promise<PromptCategoryCreateResult>;
  onConfirmationActiveChange?: (active: boolean) => void;
  onAddingChange?: (adding: boolean) => void;
};

export function PromptCategoryField({ categories, value, locale, onChange, disabled, onCreateCategory, onConfirmationActiveChange, onAddingChange, size = 'l', addIcon = 'promptCategoryAdd' }: CategoryFieldProps) {
  const t = promptCategoryCopy[locale];
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const create = usePresence(adding ? true : null);
  const field = useRef<HTMLDivElement>(null);
  const confirmationCallback = useRef(onConfirmationActiveChange);
  const addingCallback = useRef(onAddingChange);
  confirmationCallback.current = onConfirmationActiveChange;
  addingCallback.current = onAddingChange;
  const modalActive = !!create.value;
  useLayoutEffect(() => {
    confirmationCallback.current?.(modalActive || selectOpen);
    return () => confirmationCallback.current?.(false);
  }, [modalActive, selectOpen]);
  useLayoutEffect(() => {
    addingCallback.current?.(modalActive);
    return () => addingCallback.current?.(false);
  }, [modalActive]);
  const normalized = normalizePromptCategory(value);
  const selected = categories.includes(normalized) ? normalized : 'all';
  return <div ref={field} className={`prompt-category-field prompt-category-field--${size}`}>
    <div className="prompt-category-heading">
      <div id={id} className="prompt-category-label">{t.label} <em className="prompt-required">*</em></div>
      <Button variant="text" size={size === 's' ? 'xs' : 's'} icon={addIcon} className="prompt-category-create-action" disabled={disabled || modalActive}
        onClick={() => { confirmationCallback.current?.(true); setAdding(true); }}>{t.addCategory}</Button>
    </div>
    <SettingSelect className="prompt-category-select" popupClassName="prompt-category-select-menu" label={t.label} value={selected}
      options={['all', ...categories].map(category => ({ value: category, label: promptCategoryLabel(category, locale) }))}
      disabled={disabled || modalActive} onChange={onChange} portalContainer={field.current}
      onOpenChange={open => { confirmationCallback.current?.(open || modalActive); setSelectOpen(open); }}/>
    {create.value && <PromptCategoryCreateDialog categories={categories} locale={locale} phase={create.phase}
      onCreateCategory={onCreateCategory} onCreated={onChange} onClose={() => setAdding(false)}/>}
  </div>;
}

export function PromptCategoryBadge({ category, locale }: { category?: string; locale: Locale }) {
  const label = promptCategoryLabel(normalizePromptCategory(category), locale) || promptCategoryCopy[locale].all;
  return <span className="prompt-category-badge" data-node-id="160:14583" title={label}><span>{label}</span></span>;
}
