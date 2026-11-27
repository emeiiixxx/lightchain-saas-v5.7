import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from '../i18n';
import type { PromptCategoryIdentities, PromptStoreResult } from '../prompt-storage';
import { MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH, promptCategoryLabel, promptCategoryNameError } from '../prompt-categories';
import type { PromptCategoryDraftChanges } from '../usePromptCategoryDrafts';
import { TagChip } from './TagChip';
import { Button, Dialog, Icon } from './ui';
import './prompt-categories.css';
import './prompt-category-manager.css';

const copy = {
  'zh-CN': { title: '管理分类', description: '删除标签后，与其关联的内容将归类到【全部】分类中', empty: '暂无可管理的分类', cancel: '取消', confirm: '确定', close: '关闭', remove: '删除标签', rename: '重命名分类', hint: '双击分类名称重命名', required: '请输入分类名称', failed: '标签操作失败，请重试' },
  en: { title: 'Manage custom categories', description: 'Prompts in deleted categories will be moved to All.', empty: 'No categories to manage.', cancel: 'Cancel', confirm: 'Confirm', close: 'Close', remove: 'Delete category', rename: 'Rename category', hint: 'Double-click a category name to rename it', required: 'Enter a category name.', failed: 'Could not update categories. Please try again.' },
  ja: { title: 'カスタムカテゴリの管理', description: '削除したカテゴリのプロンプトは「すべて」に移動します。', empty: '管理できるカテゴリはありません。', cancel: 'キャンセル', confirm: '確定', close: '閉じる', remove: 'カテゴリを削除', rename: 'カテゴリ名を変更', hint: 'カテゴリ名をダブルクリックして名前を変更', required: 'カテゴリ名を入力してください。', failed: 'カテゴリを更新できませんでした。もう一度お試しください。' },
};

type CategoryDraft = { original: string; category: string };

export function PromptCategoryManager({ categories, categoryIdentities, locale, phase, onClose, onSave }: {
  categories: string[];
  categoryIdentities?: PromptCategoryIdentities;
  locale: Locale;
  phase: 'enter' | 'exit';
  onClose: () => void;
  onSave: (changes: PromptCategoryDraftChanges) => Promise<PromptStoreResult>;
}) {
  const t = copy[locale];
  const titleId = useId();
  const errorId = useId();
  // Name edits and deletions remain local until this dialog's Confirm succeeds.
  const [initialCategories] = useState(() => categories.filter(category => category.startsWith('custom:')));
  const [initialIdentities] = useState(categoryIdentities);
  const [shown, setShown] = useState<CategoryDraft[]>(() => initialCategories.map(category => ({ original: category, category })));
  const shownRef = useRef(shown);
  const updateShown = (next: CategoryDraft[]) => { shownRef.current = next; setShown(next); };
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const tagsDisabled = busy || phase === 'exit';
  const list = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const actions = useRef<HTMLElement>(null);
  const nextFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    const index = nextFocus.current;
    if (index === null) return;
    nextFocus.current = null;
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('.prompt-category-manager-remove');
    const target = buttons?.[Math.min(index, buttons.length - 1)] ?? actions.current?.querySelector<HTMLButtonElement>('[data-manager-save]');
    target?.focus({ preventScroll: true });
  }, [shown]);
  useLayoutEffect(() => { if (editing) { input.current?.focus({ preventScroll: true }); input.current?.select(); } }, [editing]);
  const finishRename = (): boolean => {
    if (!editing) return true;
    const clean = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
    const invalid = !clean ? t.required : promptCategoryNameError(clean, shownRef.current.filter(item => item.original !== editing).map(item => item.category), locale);
    if (invalid) { setError(invalid); return false; }
    updateShown(shownRef.current.map(item => item.original === editing ? { ...item, category: `custom:${clean}` } : item));
    setEditing(null); setName(''); setError('');
    return true;
  };
  const finishRef = useRef(finishRename);
  finishRef.current = finishRename;
  useEffect(() => {
    if (!editing || tagsDisabled) return;
    const dialog = form.current?.closest('dialog');
    if (!dialog) return;
    const confirmOnBlank = (event: PointerEvent) => {
      const target = event.target;
      if (event.button !== 0 || !(target instanceof Element) || target.closest('dialog') !== dialog) return;
      if (target.closest('button,input,textarea,select,label,a[href],[role="button"],[tabindex]')) return;
      finishRef.current();
    };
    dialog.addEventListener('pointerdown', confirmOnBlank, true);
    return () => dialog.removeEventListener('pointerdown', confirmOnBlank, true);
  }, [editing, tagsDisabled]);
  const beginRename = (item: CategoryDraft) => {
    if (tagsDisabled || (editing && !finishRename())) return;
    setEditing(item.original); setName(promptCategoryLabel(item.category, locale)); setError('');
  };
  const close = () => { if (!busyRef.current) onClose(); };
  const save = async () => {
    if (busyRef.current || phase === 'exit' || !finishRename()) return;
    const current = shownRef.current;
    const deleted = initialCategories.filter(category => !current.some(item => item.original === category));
    const renamed = current.filter(item => item.original !== item.category).map(item => ({ from: item.original, to: item.category }));
    if (!deleted.length && !renamed.length) { onClose(); return; }
    busyRef.current = true; setBusy(true); setError('');
    try {
      const result = await onSave({ created: [], deleted, renamed, identities: initialIdentities });
      if (result.ok) onClose(); else setError(result.message);
    } catch { setError(t.failed); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return createPortal(<div data-overlay data-select-popup data-node-id="413:35663">
    <Dialog isolateEvents title={t.title} closeLabel={t.close} labelledBy={titleId} phase={phase} onClose={close} className="prompt-category-manager"
      header={<header className="prompt-category-manager-heading"><div className="prompt-category-manager-title"><h2 id={titleId}>{t.title}</h2><Button disabled={busy} aria-label={t.close} onClick={close}><Icon name="promptSaveClose" size={16}/></Button></div><p>{shown.length ? t.hint : t.empty}</p></header>}>
      {(initialCategories.length > 0 || error) && <div ref={form} className="prompt-category-field prompt-category-field--l prompt-category-manager-form">
        <div className="prompt-category-manager-categories">
          {shown.length > 0 && <div ref={list} className="prompt-category-manager-list">
            {shown.map((item, index) => editing === item.original ? <div key={item.original} className="prompt-category-create-input prompt-category-manager-name-input" data-invalid={Boolean(error) || undefined}>
              <input ref={input} aria-label={t.rename} value={name} maxLength={MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH} disabled={tagsDisabled}
                aria-invalid={Boolean(error) || undefined} aria-describedby={error ? errorId : undefined}
                onChange={event => { setName(event.target.value); setError(''); }}
                onKeyDown={event => { if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); finishRename(); } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditing(null); setName(''); setError(''); } }}/>
              <span>{name.length}/{MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH}</span>
            </div> : <TagChip key={item.original} size="m" appearance="outline" disabled={tagsDisabled} title={promptCategoryLabel(item.category, locale)}
              trailing={<Button className="prompt-category-manager-remove" disabled={tagsDisabled || editing !== null} aria-label={`${t.remove} · ${promptCategoryLabel(item.category, locale)}`} title={t.remove} onClick={() => {
                if (busyRef.current || phase === 'exit' || editing) return;
                nextFocus.current = index;
                updateShown(shownRef.current.filter(other => other.original !== item.original));
                setError('');
              }}><Icon name="promptCategoryRemove" size={16}/></Button>}>
              <span className="prompt-category-manager-name" role="button" tabIndex={tagsDisabled ? -1 : 0} aria-label={`${t.rename} · ${promptCategoryLabel(item.category, locale)}`}
                onDoubleClick={() => beginRename(item)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); beginRename(item); } }}>{promptCategoryLabel(item.category, locale)}</span>
            </TagChip>)}
          </div>}
          {initialCategories.length > 0 && <div className="prompt-category-manager-warning" data-node-id="194:17762"><Icon name="promptCategoryInfo" size={16}/><p>{t.description}</p></div>}
        </div>
        {error && <p id={errorId} className="prompt-category-manager-error" role="alert">{error}</p>}
      </div>}
      <footer ref={actions} className="prompt-category-manager-actions" data-node-id="162:15568">
        <div className="prompt-category-manager-action-group"><Button variant="secondary" size="m" disabled={busy} onClick={close}>{t.cancel}</Button><Button data-manager-save variant="primary" size="m" disabled={busy} onClick={() => void save()}>{t.confirm}</Button></div>
      </footer>
    </Dialog>
  </div>, document.body);
}
