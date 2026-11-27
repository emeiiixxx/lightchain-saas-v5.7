import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from '../i18n';
import { promptCategoryCopy, promptCategoryLabel } from '../prompt-categories';
import { usePresence } from '../usePresence';
import { SettingSelect } from './SettingSelect';
import { Button, Dialog, Icon } from './ui';
import './prompt-library-batch.css';

const copy = {
  'zh-CN': { all: '全选', send: '移动至', remove: '删除', done: '完成', close: '关闭', cancel: '取消', title: '删除提示词', question: (n: number) => `确定删除选中的 ${n} 条提示词？删除后无法恢复。` },
  en: { all: 'Select all', send: 'Move to', remove: 'Delete', done: 'Done', close: 'Close', cancel: 'Cancel', title: 'Delete prompts', question: (n: number) => `Delete ${n} selected ${n === 1 ? 'prompt' : 'prompts'}? This cannot be undone.` },
  ja: { all: '全選択', send: '移動先', remove: '削除', done: '完了', close: '閉じる', cancel: 'キャンセル', title: 'プロンプトを削除', question: (n: number) => `選択した${n}件のプロンプトを削除しますか？削除後は元に戻せません。` },
};

type CheckProps = {
  checked: boolean;
  mixed?: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
};

function PromptBatchCheck({ checked, mixed = false, disabled, label, onChange }: CheckProps) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (input.current) input.current.indeterminate = mixed;
  }, [mixed]);

  return <span className="prompt-batch-check">
    <input type="checkbox" ref={input} checked={checked} disabled={disabled} aria-label={label} onChange={onChange} />
    {checked && !mixed && <Icon name="selectionCheck" size={20} />}
  </span>;
}

export function PromptBatchRow({ active, children, ...check }: CheckProps & { active: boolean; children: ReactNode }) {
  return <div className="prompt-batch-row" data-active={active}>
    <span className="prompt-batch-choice" inert={!active} aria-hidden={!active}>
      <PromptBatchCheck {...check} disabled={!active || check.disabled}/>
    </span>
    {children}
  </div>;
}

type FooterProps = {
  active: boolean;
  locale: Locale;
  categories: string[];
  selectedCount: number;
  visibleCount: number;
  allSelected: boolean;
  mixed?: boolean;
  disabled?: boolean;
  onToggleAll: () => void;
  onSend: (category: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onDone: () => void;
};

export function PromptBatchFooter({ active, locale, categories, selectedCount, visibleCount, allSelected, mixed, disabled, onToggleAll, onSend, onDelete, onDone }: FooterProps) {
  const t = copy[locale];
  const footer = useRef<HTMLElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (selectedCount === 0) setConfirming(false);
  }, [selectedCount]);
  const confirmation = usePresence(confirming && selectedCount > 0 ? selectedCount : null);
  const blocked = !active || disabled || busy;
  const canAct = selectedCount > 0 && !blocked;

  async function submit(operation: () => Promise<boolean>) {
    if (!canAct || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if (await operation()) setConfirming(false);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const closeConfirm = () => { if (!pending.current) setConfirming(false); };
  return <footer ref={footer} className="prompt-batch-footer" data-active={active} inert={!active} aria-hidden={!active} aria-busy={busy}>
    <div className="prompt-batch-footer-clip"><div className="prompt-batch-toolbar">
    <label className="prompt-batch-select-all">
      <PromptBatchCheck checked={allSelected} mixed={mixed} disabled={!visibleCount || blocked} label={t.all} onChange={onToggleAll} />
      <span>{t.all}</span>
    </label>
    <div className="prompt-batch-actions">
      <SettingSelect className="prompt-batch-send" popupClassName="prompt-library-category-menu" label={t.send}
        value="" placeholder={t.send} chevron={false} triggerVariant="secondary-button" placement="top" menuTitle={promptCategoryCopy[locale].chooseCategory}
        menuWidth={200} portalContainer={footer.current} showSelectedCheck={false} disabled={!canAct}
        options={['all', ...categories].map(category => ({ value: category, label: promptCategoryLabel(category, locale) }))}
        onChange={category => void submit(() => onSend(category))} />
      <Button variant="secondary" disabled={!canAct} onClick={() => setConfirming(true)}>{t.remove}</Button>
      <Button variant="primary" disabled={blocked} onClick={onDone}>{t.done}</Button>
    </div>
    </div></div>
    {confirmation.value !== null && createPortal(<div data-overlay data-select-popup>
      <Dialog isolateEvents className="prompt-batch-confirm" title={t.title} closeLabel={t.close} phase={confirmation.phase} onClose={closeConfirm}>
        <p>{t.question(confirmation.value)}</p>
        <div className="prompt-batch-confirm-actions">
          <Button variant="secondary" size="m" disabled={blocked} onClick={closeConfirm}>{t.cancel}</Button>
          <Button variant="danger" size="m" disabled={!canAct} onClick={() => void submit(onDelete)}>{t.remove}</Button>
        </div>
      </Dialog>
    </div>, document.body)}
  </footer>;
}
