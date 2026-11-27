import { useRef, useState } from 'react';
import type { Locale } from '../i18n';
import type { PromptCategoryCreateResult, PromptCategoryIdentities, PromptStoreResult } from '../prompt-storage';
import type { PromptCategoryDraftChanges } from '../usePromptCategoryDrafts';
import { promptCategoryCopy, promptCategoryLabel } from '../prompt-categories';
import { usePresence } from '../usePresence';
import { Button, Icon } from './ui';
import { SettingSelect } from './SettingSelect';
import { PromptCategoryCreateDialog } from './PromptCategoryCreateDialog';
import { PromptCategoryManager } from './PromptCategoryManager';
import './prompt-categories.css';

const copy = {
  'zh-CN': { title: '提示词库', addPrompt: '添加提示词', search: '请输入关键词搜索', clear: '清除搜索' },
  en: { title: 'Prompt library', addPrompt: 'Add prompt', search: 'Search by keyword', clear: 'Clear search' },
  ja: { title: 'プロンプトライブラリ', addPrompt: 'プロンプトを追加', search: 'キーワードを入力', clear: '検索をクリア' },
};

type Props = {
  categories: string[];
  categoryIdentities?: PromptCategoryIdentities;
  value: string;
  locale: Locale;
  disabled?: boolean;
  addingPromptDisabled?: boolean;
  onChange: (value: string) => void;
  onAddPrompt: () => void;
  onCreateCategory: (name: string) => Promise<PromptCategoryCreateResult>;
  onOpenManageCategories: () => void;
  onManageCategories: (changes: PromptCategoryDraftChanges) => Promise<PromptStoreResult>;
  query: string;
  onQueryChange: (value: string) => void;
};

// Figma 413:34073 / 413:34510. Shared by the Flow and design workbench libraries.
export function PromptLibraryNavigation({ categories, categoryIdentities, value, locale, disabled, addingPromptDisabled, onChange, onAddPrompt, onCreateCategory, onOpenManageCategories, onManageCategories, query, onQueryChange }: Props) {
  const t = copy[locale];
  const c = promptCategoryCopy[locale];
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const create = usePresence(adding ? true : null);
  const management = usePresence(managing ? true : null);
  const searchInput = useRef<HTMLInputElement>(null);
  const header = useRef<HTMLElement>(null);
  const blocked = disabled || !!create.value || !!management.value;
  return <>
    <header ref={header} className="prompt-library-navigation" data-node-id="413:34073">
      <div className="prompt-library-title-row"><h2>{t.title}</h2></div>
      <div className="prompt-library-add-row"><Button variant="secondary" size="s" icon="promptLibraryAdd" disabled={blocked || addingPromptDisabled} onClick={onAddPrompt}>{t.addPrompt}</Button></div>
      <div className="prompt-library-filter-row" data-node-id="413:34240">
        <SettingSelect className="prompt-library-category-select" popupClassName="prompt-library-category-menu" label={c.filter}
          portalContainer={header.current} menuTitle={c.chooseCategory} menuWidth={288} value={value} disabled={blocked}
          options={['all', ...categories].map(category => ({ value: category, label: promptCategoryLabel(category, locale) }))}
          onChange={onChange} footerAction={{ label: c.manage, icon: 'promptCategoryManage', onClick: () => { onOpenManageCategories(); setManaging(true); } }}/>
        <Button variant="ghost" size="s" aria-label={c.addCategory} disabled={blocked} onClick={() => setAdding(true)} data-node-id="413:34248"><Icon name="promptCategoryCreate" size={20}/></Button>
      </div>
      <div className="prompt-library-search-row"><div className="prompt-library-search">
        <Icon name="search" size={20}/><input ref={searchInput} aria-label={t.search} placeholder={t.search} value={query} disabled={blocked} onChange={event => onQueryChange(event.target.value)}/>
        {query && <Button className="prompt-library-search-clear" aria-label={t.clear} disabled={blocked} onClick={() => { onQueryChange(''); searchInput.current?.focus({ preventScroll: true }); }}><Icon name="promptSearchClear" size={20}/></Button>}
      </div></div>
    </header>
    {create.value && <PromptCategoryCreateDialog categories={categories} locale={locale} phase={create.phase} onCreateCategory={onCreateCategory}
      onCreated={() => undefined} onClose={() => setAdding(false)}/>}
    {management.value && <PromptCategoryManager categories={categories} categoryIdentities={categoryIdentities} locale={locale} phase={management.phase} onClose={() => setManaging(false)} onSave={onManageCategories}/>}
  </>;
}
