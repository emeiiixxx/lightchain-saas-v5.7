import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from '../i18n';
import type { PromptCategoryCreateResult } from '../prompt-storage';
import { getCustomPromptCategoryCount, MAX_CUSTOM_PROMPT_CATEGORIES, MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH, promptCategoryCopy, promptCategoryNameError } from '../prompt-categories';
import { Button, Dialog, Icon } from './ui';

type PresencePhase = 'enter' | 'exit';

type Props = {
  locale: Locale;
  categories: string[];
  onCreateCategory: (name: string) => Promise<PromptCategoryCreateResult>;
  onCreated: (category: string) => void;
  onClose: () => void;
  phase?: PresencePhase;
};

const copy = {
  'zh-CN': { title: '添加分类', placeholder: '请输入分类名称', confirm: '确认', close: '关闭' },
  en: { title: 'Add category', placeholder: 'Enter a category name', confirm: 'Confirm', close: 'Close' },
  ja: { title: 'カテゴリを追加', placeholder: 'カテゴリ名を入力してください', confirm: '確定', close: '閉じる' },
};

// Figma 405:3032: shared Modal, Input L and Button M. Creation is committed by
// the caller before this dialog selects the new category or closes.
export function PromptCategoryCreateDialog({ locale, categories, onCreateCategory, onCreated, onClose, phase = 'enter' }: Props) {
  const t = copy[locale];
  const categoryText = promptCategoryCopy[locale];
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const blocked = busy || phase === 'exit';
  const cleanName = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const close = () => { if (!busyRef.current && phase !== 'exit') onClose(); };

  const createCategory = async () => {
    if (!cleanName || busyRef.current || phase === 'exit') return;
    const invalid = promptCategoryNameError(cleanName, categories, locale);
    if (invalid) { setError(invalid); return; }
    if (getCustomPromptCategoryCount(categories) >= MAX_CUSTOM_PROMPT_CATEGORIES) {
      setError(categoryText.limitReachedWithManager);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    let result: PromptCategoryCreateResult;
    try {
      result = await onCreateCategory(cleanName);
    } catch {
      result = { ok: false, message: categoryText.failed };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    if (!result.ok) { setError(result.message === categoryText.limitReached ? categoryText.limitReachedWithManager : result.message); return; }
    onCreated(result.category);
    onClose();
  };

  return createPortal(<div data-overlay data-select-popup data-node-id="405:3032">
    <Dialog isolateEvents title={t.title} closeLabel={t.close} labelledBy={titleId} phase={phase} onClose={close} className="prompt-category-create"
      header={<header className="prompt-category-create-header"><h2 id={titleId}>{t.title}</h2><Button aria-label={t.close} disabled={blocked} onClick={close}><Icon name="promptSaveClose" size={20} /></Button></header>}>
      <div className="prompt-category-create-body" aria-busy={busy}>
        <label htmlFor={inputId}>{categoryText.customName}</label>
        <div className="prompt-category-create-input" data-invalid={Boolean(error) || undefined}>
          <input ref={input} id={inputId} autoFocus value={name} placeholder={t.placeholder} maxLength={MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH} disabled={blocked}
            aria-invalid={Boolean(error) || undefined} aria-describedby={error ? errorId : undefined}
            onChange={event => { setName(event.target.value); setError(''); }}
            onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void createCategory(); } }} />
          <span>{name.length}/{MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH}</span>
        </div>
        {error && <p id={errorId} className="prompt-category-create-error" role="alert">{error}</p>}
      </div>
      <footer className="prompt-category-create-footer">
        <Button variant="secondary" size="m" disabled={blocked} onClick={close}>{categoryText.cancel}</Button>
        <Button variant="primary" size="m" disabled={blocked || !cleanName} onClick={() => void createCategory()}>{t.confirm}</Button>
      </footer>
    </Dialog>
  </div>, document.body);
}
