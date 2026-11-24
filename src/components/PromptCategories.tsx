import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Locale } from '../i18n';
import { promptCategoryCopy, promptCategoryLabel, promptCategoryNameError, resolveCustomPromptCategory, normalizePromptCategory, getCustomPromptCategoryCount, MAX_CUSTOM_PROMPT_CATEGORIES } from '../prompt-categories';
import { ChoiceChip } from './ChoiceChip';
import { Button, type IconName } from './ui';
import { easeOut, getMotionDurationMs } from '../motion';
import { usePresence } from '../usePresence';
import { PromptCategoryManager } from './PromptCategoryManager';
import { PromptCategoryNameInput } from './PromptCategoryNameInput';
import type { PromptCategoryDraftChanges } from '../usePromptCategoryDrafts';
import './prompt-categories.css';

type CategoryProps = { categories: string[]; value: string; locale: Locale; onChange: (value: string) => void; disabled?: boolean };

export function PromptCategoryTabs({ categories, value, locale, onChange, disabled, panelId }: CategoryProps & { panelId: string }) {
  const t = promptCategoryCopy[locale];
  const values = ['all', ...categories];
  const track = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const stopScrolling = () => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;
  };
  useEffect(() => stopScrolling, []);
  const revealTab = (button: HTMLButtonElement) => {
    stopScrolling();
    const element = track.current;
    if (!element) return;
    const styles = getComputedStyle(element);
    const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
    const start = element.scrollLeft;
    const left = button.offsetLeft - paddingLeft;
    const right = button.offsetLeft + button.offsetWidth + paddingRight;
    const wanted = left < start || right - left > element.clientWidth ? left
      : right > start + element.clientWidth ? right - element.clientWidth : start;
    const target = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, wanted));
    if (Math.abs(target - start) < 1) return;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : getMotionDurationMs();
    if (!duration) { element.scrollLeft = target; return; }
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      element.scrollLeft = start + (target - start) * easeOut(progress);
      scrollFrame.current = progress < 1 ? requestAnimationFrame(step) : null;
    };
    scrollFrame.current = requestAnimationFrame(step);
  };
  const choose = (category: string, button: HTMLButtonElement) => {
    onChange(category);
    revealTab(button);
  };
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + values.length) % values.length;
    const button = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
    if (button) { choose(values[next], button); button.focus({ preventScroll: true }); }
  };
  return <div ref={track} className="prompt-category-tabs" role="tablist" aria-label={t.filter} data-node-id="160:14556"
    onPointerDownCapture={stopScrolling} onWheelCapture={stopScrolling} onTouchMove={stopScrolling}>
    {values.map((category, index) => <Button key={category} className="prompt-category-tab" role="tab"
      aria-selected={value === category} aria-controls={panelId} disabled={disabled} tabIndex={value === category ? 0 : -1}
      onMouseDown={event => { if (event.button === 0) { event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); } }}
      onClick={event => choose(category, event.currentTarget)} onKeyDown={event => navigate(event, index)}>
      {category === 'all' ? t.all : promptCategoryLabel(category, locale)}
    </Button>)}
  </div>;
}

type CategoryMutationResult = { ok: true } | { ok: false; message: string };
type CategorySelectionResult = { ok: true; category: string } | { ok: false; message: string };
type CategoryFieldProps = CategoryProps & {
  size?: 's' | 'm' | 'l'; addIcon?: IconName;
  onCreateCategory: (name: string) => Promise<{ ok: true; category: string } | { ok: false; message: string }>;
  onManageCategories?: (changes: PromptCategoryDraftChanges) => Promise<CategoryMutationResult>;
  onConfirmationActiveChange?: (active: boolean) => void;
  onAddingChange?: (adding: boolean) => void;
};

export function PromptCategoryField({ categories, value, locale, onChange, disabled, onCreateCategory, onManageCategories, onConfirmationActiveChange, onAddingChange, size = 'l', addIcon = 'promptCategoryAdd' }: CategoryFieldProps) {
  const t = promptCategoryCopy[locale];
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const addingCallback = useRef(onAddingChange);
  addingCallback.current = onAddingChange;
  useLayoutEffect(() => {
    addingCallback.current?.(adding || busy);
    return () => addingCallback.current?.(false);
  }, [adding, busy]);
  const field = useRef<HTMLDivElement>(null);
  const [managementOpen, setManagementOpen] = useState(false);
  const management = usePresence(managementOpen ? true : null);
  const confirmationCallback = useRef(onConfirmationActiveChange);
  confirmationCallback.current = onConfirmationActiveChange;
  const confirmationActive = !!management.value;
  useLayoutEffect(() => {
    confirmationCallback.current?.(confirmationActive);
    return () => confirmationCallback.current?.(false);
  }, [confirmationActive]);
  const selected = categories.includes(normalizePromptCategory(value)) ? normalizePromptCategory(value) : 'all';
  const blocked = disabled || busy;
  const actionSize = size === 's' ? 'xs' : size === 'l' ? 'm' : 's';
  const close = () => { setAdding(false); setName(''); setError(''); requestAnimationFrame(() => field.current?.querySelector<HTMLButtonElement>('.prompt-category-add')?.focus({ preventScroll: true })); };
  const startAdding = () => {
    if (getCustomPromptCategoryCount(categories) >= MAX_CUSTOM_PROMPT_CATEGORIES) { setError(t.limitReachedWithManager); return; }
    setError(''); setName(''); setAdding(true);
  };
  const choose = (category: string) => { onChange(category); if (adding) close(); else setError(''); };
  const confirm = async (): Promise<CategorySelectionResult> => {
    if (busyRef.current || blocked) return { ok: false, message: t.failed };
    const category = resolveCustomPromptCategory(name, categories, locale);
    if (!category) return { ok: true, category: selected };
    const error = promptCategoryNameError(name, categories, locale);
    if (error) { setError(error); return { ok: false, message: error }; }
    if (category.startsWith('custom:') && !categories.includes(category) && getCustomPromptCategoryCount(categories) >= MAX_CUSTOM_PROMPT_CATEGORIES) { setError(t.limitReachedWithManager); return { ok: false, message: t.limitReachedWithManager }; }
    busyRef.current = true; setBusy(true); setError('');
    try {
      const result = await onCreateCategory(name);
      if (!result.ok) { setError(result.message); return result; }
      onChange(result.category); setName(''); setError(''); setAdding(false);
      requestAnimationFrame(() => field.current?.querySelector<HTMLButtonElement>('.prompt-category-add')?.focus({ preventScroll: true }));
      return result;
    } catch { setError(t.failed); return { ok: false, message: t.failed }; }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <div ref={field} className={`prompt-category-field prompt-category-field--${size}`} data-node-id="152:11897" aria-busy={busy}>
    <div className="prompt-category-heading"><div id={id} className="prompt-category-label">{t.label} <em className="prompt-required">*</em></div>
      {onManageCategories && <Button variant="outline" size={size === 's' ? 'xs' : 's'} icon="promptCategoryManage" className="prompt-category-manage" disabled={blocked || confirmationActive} onClick={() => { confirmationCallback.current?.(true); setManagementOpen(true); }}>{t.manage}</Button>}
    </div>
    <div className="prompt-category-options" role="group" aria-labelledby={id}>
      {['all', ...categories].map(category => <ChoiceChip key={category} size={size} className="prompt-category-choice"
          selected={selected === category} disabled={blocked} title={promptCategoryLabel(category, locale)} onClick={() => choose(category)}>
          {promptCategoryLabel(category, locale)}
        </ChoiceChip>)}
      {!adding && <Button variant="text" size={actionSize} icon={addIcon} className="prompt-category-add" disabled={blocked} onClick={startAdding}>
        {t.custom}
      </Button>}
    </div>
    {adding && <PromptCategoryNameInput name={name} locale={locale} size={size} disabled={blocked} onChange={value => { setName(value); setError(''); }} onCancel={close} onAdd={() => void confirm()}/>}
    {error && <p className="prompt-category-error" role="alert">{error}</p>}
    {management.value && onManageCategories && <PromptCategoryManager categories={categories} locale={locale} phase={management.phase} onClose={() => setManagementOpen(false)} onSave={async changes => {
      const result = await onManageCategories(changes);
      if (result.ok) { if (changes.deleted.includes(selected)) onChange('all'); setError(''); }
      return result;
    }}/>}
  </div>;
}

export function PromptCategoryBadge({ category, locale }: { category?: string; locale: Locale }) {
  const label = promptCategoryLabel(normalizePromptCategory(category), locale) || promptCategoryCopy[locale].all;
  return <span className="prompt-category-badge" data-node-id="160:14583" title={label}><span>{label}</span></span>;
}
