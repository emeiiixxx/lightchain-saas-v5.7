import { useRef, useState } from 'react';
import type { Locale } from '../i18n';
import type { PromptCategoryCreateResult, PromptCategoryIdentities, PromptStoreResult } from '../prompt-storage';
import type { PromptCategoryDraftChanges } from '../usePromptCategoryDrafts';
import { getCustomPromptCategoryCount, promptCategoryCopy, promptCategoryLabel } from '../prompt-categories';
import { usePresence } from '../usePresence';
import { Button, Icon } from './ui';
import { IconButton } from '../design-workbench/components/ui';
import { SettingSelect } from './SettingSelect';
import { PromptCategoryCreateDialog } from './PromptCategoryCreateDialog';
import { PromptCategoryManager } from './PromptCategoryManager';
import './prompt-categories.css';

const copy = {
  'zh-CN': { title: '提示词库', batch: '批量管理', addPrompt: '新增提示词', addCategory: '添加自定义分类', manageCategories: '管理分类标签', search: '请输入关键词搜索', clear: '清除搜索' },
  en: { title: 'Prompt library', batch: 'Bulk manage', addPrompt: 'Add prompt', addCategory: 'Add custom category', manageCategories: 'Manage category tags', search: 'Search by keyword', clear: 'Clear search' },
  ja: { title: 'プロンプトライブラリ', batch: '一括管理', addPrompt: 'プロンプトを追加', addCategory: 'カスタムカテゴリを追加', manageCategories: 'カテゴリタグを管理', search: 'キーワードを入力', clear: '検索をクリア' },
};

type Props = {
  categories: string[];
  categoryIdentities?: PromptCategoryIdentities;
  value: string;
  locale: Locale;
  disabled?: boolean;
  addingPromptDisabled?: boolean;
  batchActive?: boolean;
  batchEntryDisabled?: boolean;
  onStartBatch?: () => void;
  onChange: (value: string) => void;
  onAddPrompt: () => void;
  onCreateCategory: (name: string) => Promise<PromptCategoryCreateResult>;
  onOpenManageCategories: () => void;
  onManageCategories: (changes: PromptCategoryDraftChanges) => Promise<PromptStoreResult>;
  query: string;
  onQueryChange: (value: string) => void;
};

// Figma 413:34730 and 434:38658. Shared by both workspaces.
export function PromptLibraryNavigation({ categories, categoryIdentities, value, locale, disabled, addingPromptDisabled, batchActive = false, batchEntryDisabled, onStartBatch, onChange, onAddPrompt, onCreateCategory, onOpenManageCategories, onManageCategories, query, onQueryChange }: Props) {
  const t = copy[locale];
  const c = promptCategoryCopy[locale];
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const create = usePresence(adding ? true : null);
  const management = usePresence(managing ? true : null);
  const searchInput = useRef<HTMLInputElement>(null);
  const header = useRef<HTMLElement>(null);
  const blocked = disabled || !!create.value || !!management.value;
  const manageDisabled = batchActive || getCustomPromptCategoryCount(categories) === 0;
  return <>
    <header ref={header} className="prompt-library-navigation" data-node-id={batchActive ? '434:38659' : '434:38473'}>
      <div className="prompt-library-title-row"><h2>{t.title}</h2></div>
      <div className="prompt-library-add-row"><Button variant="secondary" size="s" icon="promptLibraryAdd" disabled={blocked || addingPromptDisabled || batchActive} onClick={onAddPrompt}>{t.addPrompt}</Button></div>
      <div className="prompt-library-filter-row" data-node-id="413:34240">
        <SettingSelect className="prompt-library-category-select" popupClassName="prompt-library-category-menu" label={c.filter}
          portalContainer={header.current} menuTitle={c.chooseCategory} menuWidth={296} showSelectedCheck={false} value={value} disabled={blocked}
          options={['all', ...categories].map(category => ({ value: category, label: promptCategoryLabel(category, locale) }))}
          onChange={onChange} footerActions={[
            { label: t.addCategory, icon: 'promptLibraryAdd', disabled: batchActive, onClick: () => setAdding(true) },
            { label: t.manageCategories, icon: 'promptCategoryManage', disabled: manageDisabled, onClick: () => { onOpenManageCategories(); setManaging(true); } },
          ]}/>
        {onStartBatch && <Button variant="ghost" size="s" icon="promptBatchManage" disabled={blocked || batchActive || batchEntryDisabled} onClick={onStartBatch}>{t.batch}</Button>}
      </div>
      <div className="prompt-library-search-row" data-collapsed={batchActive} aria-hidden={batchActive} inert={batchActive}><div className="prompt-library-search">
        <Icon name="search" size={20}/><input ref={searchInput} aria-label={t.search} placeholder={t.search} value={query} disabled={blocked} onChange={event => onQueryChange(event.target.value)}/>
        {query && <IconButton variant="bare" size="m" icon={<Icon name="promptSearchClear" size={20}/>} aria-label={t.clear} disabled={blocked} onClick={() => { onQueryChange(''); searchInput.current?.focus({ preventScroll: true }); }}/>}
      </div></div>
    </header>
    {create.value && <PromptCategoryCreateDialog categories={categories} locale={locale} phase={create.phase} onCreateCategory={onCreateCategory}
      onCreated={() => undefined} onClose={() => setAdding(false)}/>}
    {management.value && <PromptCategoryManager categories={categories} categoryIdentities={categoryIdentities} locale={locale} phase={management.phase} onClose={() => setManaging(false)} onSave={onManageCategories}/>}
  </>;
}
