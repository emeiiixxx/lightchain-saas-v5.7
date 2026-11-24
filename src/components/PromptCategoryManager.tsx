import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from '../i18n';
import type { PromptStoreResult } from '../prompt-storage';
import { getCustomPromptCategoryCount, MAX_CUSTOM_PROMPT_CATEGORIES, promptCategoryCopy, promptCategoryLabel, promptCategoryNameError, resolveCustomPromptCategory } from '../prompt-categories';
import type { PromptCategoryDraftChanges } from '../usePromptCategoryDrafts';
import { TagChip } from './TagChip';
import { PromptCategoryNameInput } from './PromptCategoryNameInput';
import { usePromptCategorySort } from './usePromptCategorySort';
import { Button, Dialog, Icon } from './ui';
import './prompt-category-manager.css';

const copy = {
  'zh-CN': { title: '自定义分类标签管理', description: '删除标签后，与其关联的内容将归类到【全部】分类中', empty: '暂无自定义标签，请点击【+自定义】按钮添加', cancel: '取消', confirm: '确定', close: '关闭', remove: '删除标签', failed: '标签操作失败，请重试' },
  en: { title: 'Manage custom categories', description: 'Prompts in deleted categories will be moved to All.', empty: 'No custom categories. Click “+ Custom” to add one.', cancel: 'Cancel', confirm: 'Confirm', close: 'Close', remove: 'Delete category', failed: 'Could not update categories. Please try again.' },
  ja: { title: 'カスタムカテゴリの管理', description: '削除したカテゴリのプロンプトは「すべて」に移動します。', empty: 'カスタムカテゴリがありません。「＋カスタム」から追加してください。', cancel: 'キャンセル', confirm: '確定', close: '閉じる', remove: 'カテゴリを削除', failed: 'カテゴリを更新できませんでした。もう一度お試しください。' },
};

const sortingCopy = {
  'zh-CN': { label: '拖拽排序', description: '可拖拽标签调整排序', help: '拖动标签调整顺序，也可聚焦标签后按 Alt 加方向键调整。' },
  en: { label: 'Drag to reorder', description: 'Drag categories to reorder.', help: 'Drag categories to reorder, or focus a category and press Alt plus an arrow key.' },
  ja: { label: 'ドラッグして並べ替え', description: 'ドラッグでカテゴリを並べ替えられます', help: 'ドラッグで並べ替えます。カテゴリにフォーカスして Alt と矢印キーでも移動できます。' },
};

export function PromptCategoryManager({ categories, locale, phase, onClose, onSave }: {
  categories: string[];
  locale: Locale;
  phase: 'enter' | 'exit';
  onClose: () => void;
  onSave: (changes: PromptCategoryDraftChanges) => Promise<PromptStoreResult>;
}) {
  const t = copy[locale];
  const categoryText = promptCategoryCopy[locale];
  const titleId = useId();
  const sortHelpId = useId();
  // This nested draft is applied to the parent only on Confirm, never to storage.
  const [initialCategories] = useState(() => categories.filter(category => category.startsWith('custom:')));
  const [shown, setShown] = useState(initialCategories);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const sorting = usePromptCategorySort(shown, setShown, busy || phase === 'exit');
  const list = sorting.list;
  const actions = useRef<HTMLElement>(null);
  const form = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const nextFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    const index = nextFocus.current;
    if (index === null) return;
    nextFocus.current = null;
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('.prompt-category-manager-remove');
    const target = buttons?.[Math.min(index, buttons.length - 1)] ?? actions.current?.querySelector<HTMLButtonElement>('[data-manager-save]');
    target?.focus({ preventScroll: true });
  }, [shown]);
  const cancelAdding = () => {
    setAdding(false); setName(''); setError('');
    requestAnimationFrame(() => form.current?.querySelector<HTMLButtonElement>('.prompt-category-add')?.focus({ preventScroll: true }));
  };
  const startAdding = () => {
    const canRestoreOriginal = initialCategories.some(category => !shown.includes(category)) && shown.every(category => initialCategories.includes(category));
    if (getCustomPromptCategoryCount(shown) >= MAX_CUSTOM_PROMPT_CATEGORIES && !canRestoreOriginal) { setError(categoryText.limitReached); return; }
    setName(''); setError(''); setAdding(true);
  };
  const withPendingName = (): { ok: true; categories: string[] } | { ok: false; message: string } => {
    const clean = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!clean) return { ok: true, categories: shown };
    const error = promptCategoryNameError(clean, shown, locale);
    if (error) return { ok: false, message: error };
    // Re-adding an item removed in this dialog restores its original spelling.
    const category = resolveCustomPromptCategory(clean, [...initialCategories, ...shown], locale);
    if (category.startsWith('custom:') && !shown.includes(category)) {
      const next = [...shown, category];
      const hasNewCategory = next.some(item => !initialCategories.includes(item));
      if (getCustomPromptCategoryCount(next) > MAX_CUSTOM_PROMPT_CATEGORIES && hasNewCategory) return { ok: false, message: categoryText.limitReached };
      return { ok: true, categories: next };
    }
    return { ok: true, categories: shown };
  };
  const addCategory = () => {
    if (!name.trim() || busyRef.current) return;
    const result = withPendingName();
    if (!result.ok) { setError(result.message); return; }
    setShown(result.categories); cancelAdding();
  };
  const close = () => { if (!busyRef.current) onClose(); };
  const save = async () => {
    if (busyRef.current || adding) return;
    const orderChanged = shown.length !== initialCategories.length || shown.some((category, index) => category !== initialCategories[index]);
    const changes: PromptCategoryDraftChanges = { created: shown.filter(category => !initialCategories.includes(category)), deleted: initialCategories.filter(category => !shown.includes(category)), order: orderChanged ? shown : undefined };
    if (!changes.created.length && !changes.deleted.length && !orderChanged) { onClose(); return; }
    busyRef.current = true; setBusy(true); setError('');
    try {
      const result = await onSave(changes);
      if (result.ok) onClose(); else setError(result.message);
    } catch { setError(t.failed); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return createPortal(<div data-overlay data-select-popup data-node-id={adding ? '190:1127' : shown.length ? '162:15543' : '194:17672'}>
    <Dialog isolateEvents title={t.title} closeLabel={t.close} labelledBy={titleId} phase={phase} onClose={close} className="prompt-category-manager"
      header={<header className="prompt-category-manager-heading"><div className="prompt-category-manager-title"><h2 id={titleId}>{t.title}</h2><Button disabled={busy} aria-label={t.close} onClick={close}><Icon name="promptSaveClose" size={16}/></Button></div><p>{shown.length ? sortingCopy[locale].description : t.empty}</p></header>}>
      <div ref={form} className="prompt-category-field prompt-category-field--l prompt-category-manager-form">
      {shown.length > 0 && <div className="prompt-category-manager-categories">
      <span id={sortHelpId} className="prompt-category-manager-sr-only">{sortingCopy[locale].help}</span>
      <div ref={list} className="prompt-category-manager-list" style={{ minHeight: sorting.minHeight }} onDragEnter={sorting.enter} onDragOver={sorting.over} onDrop={sorting.drop}>
        {shown.map((category, index) => <div key={category} className="prompt-category-manager-item" data-category-id={category}
          role="group" tabIndex={busy ? -1 : 0} aria-label={`${promptCategoryLabel(category, locale)} · ${sorting.order.indexOf(category) + 1}/${shown.length}`} aria-describedby={sortHelpId}
          data-sortable={!busy && shown.length > 1} data-dragging={sorting.dragging === category}
          style={{ order: sorting.order.indexOf(category) }}
          draggable={!busy && shown.length > 1} onPointerDownCapture={sorting.prepare}
          onDragStart={event => sorting.begin(event, category)} onDragEnd={sorting.end} onKeyDown={event => sorting.keyDown(event, category)}>
        <TagChip size="m" appearance="outline" disabled={busy} title={`${promptCategoryLabel(category, locale)} · ${sortingCopy[locale].label}`}
          trailing={<Button className="prompt-category-manager-remove" disabled={busy} draggable={false} aria-label={`${t.remove} · ${promptCategoryLabel(category, locale)}`} title={t.remove} onClick={() => { nextFocus.current = index; setShown(previous => previous.filter(item => item !== category)); setError(''); }}><Icon name="promptCategoryRemove" size={16}/></Button>}>
          {promptCategoryLabel(category, locale)}
        </TagChip></div>)}
      </div>
      <div className="prompt-category-manager-warning" data-node-id="194:17762"><Icon name="promptCategoryInfo" size={16}/><p>{t.description}</p></div>
      </div>}
      {adding ? <PromptCategoryNameInput inputRef={nameInput} name={name} locale={locale} disabled={busy} onChange={value => { setName(value); setError(''); }} onCancel={cancelAdding} onAdd={addCategory}/>
        : <Button variant="text" size="m" icon="promptCategoryAdd" className="prompt-category-add" data-node-id="185:16451" disabled={busy} onClick={startAdding}>{categoryText.custom}</Button>}
      {error && <p className="prompt-category-manager-error" role="alert">{error}</p>}
      </div>
      <footer ref={actions} className="prompt-category-manager-actions" data-node-id="162:15568">
        <div className="prompt-category-manager-action-group"><Button variant="secondary" size="m" disabled={busy} onClick={close}>{t.cancel}</Button><Button data-manager-save variant="primary" size="m" disabled={busy || adding} onClick={() => void save()}>{t.confirm}</Button></div>
      </footer>
    </Dialog>
  </div>, document.body);
}
