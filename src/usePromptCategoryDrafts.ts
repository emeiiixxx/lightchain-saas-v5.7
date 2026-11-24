import { useCallback, useRef, useState } from 'react';
import type { Locale } from './i18n';
import type { PromptCategoryCreateResult, PromptStoreResult } from './prompt-storage';
import { getCustomPromptCategoryCount, MAX_CUSTOM_PROMPT_CATEGORIES, orderCustomPromptCategories, promptCategoryCopy, promptCategoryNameError, resolveCustomPromptCategory } from './prompt-categories';

export type PromptCategoryDraftChanges = { created: string[]; deleted: string[]; order?: string[] };
type CategoryDraft = PromptCategoryDraftChanges;

function customCategoryId(category: string): string {
  if (!category.startsWith('custom:')) return '';
  const name = category.slice(7).normalize('NFKC').trim().replace(/\s+/g, ' ');
  return name ? `custom:${name}` : '';
}

function customCategoryKey(category: string): string {
  return customCategoryId(category).toLocaleLowerCase();
}

function categoryMap(categories: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const category of categories) {
    const id = customCategoryId(category), key = customCategoryKey(id);
    if (key && !values.has(key)) values.set(key, id);
  }
  return values;
}

// Manager changes remain in the parent prompt draft until its Save succeeds.
export function usePromptCategoryDrafts(
  customCategories: string[],
  locale: Locale,
) {
  const [draft, setDraft] = useState<CategoryDraft>({ created: [], deleted: [] });
  const draftRef = useRef(draft);
  const update = (next: CategoryDraft) => { draftRef.current = next; setDraft(next); };
  const reset = useCallback(() => {
    draftRef.current = { created: [], deleted: [] };
    setDraft(draftRef.current);
  }, []);
  const createCategory = async (name: string): Promise<PromptCategoryCreateResult> => {
    const clean = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
    const current = draftRef.current;
    const available = orderCustomPromptCategories([...customCategories.filter(category => !current.deleted.includes(category)), ...current.created], current.order);
    const error = promptCategoryNameError(clean, available, locale);
    if (error) return { ok: false, message: error };
    // A deleted draft label can be restored without replacing its associations.
    const category = resolveCustomPromptCategory(clean, [...customCategories, ...current.created], locale);
    if (!category) return { ok: false, message: promptCategoryCopy[locale].failed };

    if (getCustomPromptCategoryCount(available) >= MAX_CUSTOM_PROMPT_CATEGORIES) {
      return { ok: false, message: promptCategoryCopy[locale].limitReached };
    }
    update({
      created: customCategories.includes(category) ? current.created : [...current.created, category],
      deleted: current.deleted.filter(item => item !== category),
      order: current.order ? [...available, category] : undefined,
    });
    return { ok: true, category };
  };
  const applyChanges = async (changes: PromptCategoryDraftChanges): Promise<PromptStoreResult> => {
    const current = draftRef.current;
    const saved = categoryMap(customCategories);
    const created = categoryMap(current.created), deleted = categoryMap(current.deleted);
    for (const category of changes.deleted) {
      const key = customCategoryKey(category);
      if (!key) continue;
      created.delete(key);
      const existing = saved.get(key);
      if (existing) deleted.set(key, existing);
    }
    for (const category of changes.created) {
      const id = customCategoryId(category);
      if (!id) return { ok: false, message: promptCategoryCopy[locale].failed };
      const active = [...saved.values()].filter(category => !deleted.has(customCategoryKey(category))).concat([...created.values()]);
      const error = promptCategoryNameError(id.slice(7), active, locale);
      if (error) return { ok: false, message: error };
      const resolved = resolveCustomPromptCategory(id.slice(7), [...saved.values(), ...created.values()], locale);
      if (!resolved.startsWith('custom:')) return { ok: false, message: promptCategoryCopy[locale].failed };
      const key = customCategoryKey(resolved);
      // Restoring a saved name withdraws deletion without replacing its identity or associations.
      deleted.delete(key);
      if (saved.has(key)) created.delete(key);
      else if (!created.has(key)) created.set(key, resolved);
    }
    const available = new Set([...saved.keys()].filter(key => !deleted.has(key)));
    for (const key of created.keys()) available.add(key);
    const hasNewCategories = [...created.keys()].some(key => !saved.has(key));
    if (hasNewCategories && available.size > MAX_CUSTOM_PROMPT_CATEGORIES) {
      return { ok: false, message: promptCategoryCopy[locale].limitReached };
    }
    const requestedOrder = changes.order ?? current.order;
    const nextCategories = [...saved.values()].filter(category => !deleted.has(customCategoryKey(category))).concat([...created.values()]);
    update({
      created: [...created.values()],
      deleted: [...deleted.values()],
      order: requestedOrder ? orderCustomPromptCategories(nextCategories, requestedOrder) : undefined,
    });
    return { ok: true };
  };
  const deleteCategory = (category: string): Promise<PromptStoreResult> => applyChanges({ created: [], deleted: [category] });
  const getChanges = (): PromptCategoryDraftChanges => ({
    created: [...draftRef.current.created],
    deleted: [...draftRef.current.deleted],
    order: draftRef.current.order ? [...draftRef.current.order] : undefined,
  });
  return {
    categories: orderCustomPromptCategories([...customCategories.filter(category => !draft.deleted.includes(category)), ...draft.created], draft.order),
    pendingCategories: draft.created,
    deletedCategories: draft.deleted,
    createCategory,
    deleteCategory,
    applyChanges,
    getChanges,
    reset,
  };
}
