import type { Locale } from './i18n';
import type { PromptEntry } from './prompt-types';

export const promptCategoryIds = [] as const;
export const MAX_CUSTOM_PROMPT_CATEGORIES = 5;
export const MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH = 20;
export const promptCategoryCopy = {
  'zh-CN': { all: '全部', label: '分类标签', filter: '提示词分类', custom: '自定义', add: '添加', manage: '管理分类', addCategory: '添加分类', chooseCategory: '选择分类', customName: '分类名称', placeholder: '请输入', confirm: '确定', cancel: '取消', remove: '删除标签', duplicateName: '标签名称已存在', nameTooLong: `分类名称不能超过${MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH}个字符`, limitReached: '最多添加5个自定义标签，请删除后再添加', limitReachedWithManager: '最多添加5个自定义标签，请在提示词库的「管理分类」中删除后再添加', failed: '标签操作失败，请重试' },
  en: { all: 'All', label: 'Category', filter: 'Prompt categories', custom: 'Custom', add: 'Add', manage: 'Manage categories', addCategory: 'Add category', chooseCategory: 'Choose category', customName: 'Category name', placeholder: 'Enter a name', confirm: 'Confirm', cancel: 'Cancel', remove: 'Delete category', duplicateName: 'Category name already exists.', nameTooLong: `Category names cannot exceed ${MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH} characters.`, limitReached: 'You can add up to 5 custom categories. Delete one to add another.', limitReachedWithManager: 'You can add up to 5 custom categories. Open “Manage categories” in the prompt library to delete one before adding another.', failed: 'Could not update categories. Please try again.' },
  ja: { all: 'すべて', label: 'カテゴリ', filter: 'プロンプトのカテゴリ', custom: 'カスタム', add: '追加', manage: 'カテゴリ管理', addCategory: 'カテゴリを追加', chooseCategory: 'カテゴリを選択', customName: 'カテゴリ名', placeholder: '入力してください', confirm: '確定', cancel: 'キャンセル', remove: 'カテゴリを削除', duplicateName: '同じカテゴリ名が既に存在します。', nameTooLong: `カテゴリ名は${MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH}文字以内で入力してください。`, limitReached: 'カスタムカテゴリは5件までです。削除してから追加してください。', limitReachedWithManager: 'カスタムカテゴリは5件までです。プロンプトライブラリの「カテゴリ管理」で削除してから追加してください。', failed: 'カテゴリを更新できませんでした。もう一度お試しください。' },
};

export function normalizePromptCategory(category?: string): string {
  // Legacy built-in categories and uncategorized records share the All default.
  return category?.startsWith('custom:') ? category : 'all';
}

export function promptCategoryLabel(category: string, locale: Locale) {
  if (normalizePromptCategory(category) === 'all') return promptCategoryCopy[locale].all;
  return category.slice(7);
}

export function getPromptCategories(entries: PromptEntry[], draft?: Pick<PromptEntry, 'category'> | null, customCategories?: string[]) {
  const custom = customCategories ?? [...entries, ...(draft ? [draft] : [])]
    .map(entry => entry.category).filter((category): category is string => !!category?.startsWith('custom:'));
  return [...new Set(custom.filter(category => category.startsWith('custom:')))];
}

// Reorder only registered/draft categories. Unknown IDs never create tags, and
// categories added elsewhere after the order snapshot remain at the end.
export function orderCustomPromptCategories(categories: string[], order?: string[]): string[] {
  const keyOf = (category: string) => category.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const remaining = new Map<string, string>();
  for (const category of categories) {
    if (!category.startsWith('custom:')) continue;
    const key = keyOf(category);
    if (!remaining.has(key)) remaining.set(key, category);
  }
  const sorted: string[] = [];
  for (const category of order ?? []) {
    const key = keyOf(category);
    const registered = remaining.get(key);
    if (!registered) continue;
    sorted.push(registered);
    remaining.delete(key);
  }
  return [...sorted, ...remaining.values()];
}

export function getCustomPromptCategoryCount(categories: string[]): number {
  return new Set(categories.filter(category => category.startsWith('custom:'))).size;
}

export function resolveCustomPromptCategory(name: string, categories: string[], locale: Locale) {
  const clean = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  const key = clean.normalize('NFKC').toLocaleLowerCase();
  if (Object.values(promptCategoryCopy).some(copy => copy.all.normalize('NFKC').toLocaleLowerCase() === key)) return 'all';
  // Former built-in names are now available as ordinary user-created labels.
  return categories.find(category => category.startsWith('custom:') && promptCategoryLabel(category, locale).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase() === key)
    ?? `custom:${clean}`;
}

// Resolving an existing ID is useful for historical data and undoing a draft
// deletion. Creating a label must still reject names already in the draft.
export function promptCategoryNameError(name: string, categories: string[], locale: Locale): string | undefined {
  const clean = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!clean) return promptCategoryCopy[locale].failed;
  if (clean.length > MAX_CUSTOM_PROMPT_CATEGORY_NAME_LENGTH) return promptCategoryCopy[locale].nameTooLong;
  const category = resolveCustomPromptCategory(clean, categories, locale);
  if (category === 'all' || categories.includes(category)) return promptCategoryCopy[locale].duplicateName;
  return undefined;
}
