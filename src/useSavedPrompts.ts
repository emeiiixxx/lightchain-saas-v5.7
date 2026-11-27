import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { notify } from './components/Toast';
import type { PromptEntry } from './prompt-types';
import type { Locale } from './i18n';
import type { PromptCategoryDraftChanges } from './usePromptCategoryDrafts';
import { createPromptCategory, deletePromptCategories, loadPromptLibrary, managePromptCategories, persistPromptLibrary, promptStorageError, resolvePromptCategoryIdentity, PROMPT_LIBRARY_CHANNEL, type PromptCategoryCreateResult, type PromptCategoryIdentities, type PromptLibraryState, type PromptSaveOptions, type PromptStoreResult } from './prompt-storage';

type Notify = (message: string, tone?: 'error') => void;

export function useSavedPrompts(onNotify: Notify = notify) {
  const [library, setLibrary] = useState<PromptLibraryState>({ entries: [], customCategories: [] });
  const { entries, customCategories, categoryIdentities } = library;
  const writing = useRef(false), loaded = useRef(false), mounted = useRef(false), pendingRefresh = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const revision = useRef(0), report = useRef(onNotify);
  const refreshRef = useRef<() => void>(() => {});
  report.current = onNotify;
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const refresh = async () => {
      if (writing.current) { pendingRefresh.current = true; return; }
      const requestedRevision = ++revision.current;
      try {
        const saved = await loadPromptLibrary();
        if (active && !writing.current && revision.current === requestedRevision) {
          setLibrary(saved); loaded.current = true;
        }
      } catch (error) { if (active) report.current(promptStorageError(error), 'error'); }
    };
    const requestRefresh = () => { void refresh(); };
    refreshRef.current = requestRefresh;
    const storageChanged = (event: StorageEvent) => { if (event.key === PROMPT_LIBRARY_CHANNEL) requestRefresh(); };
    window.addEventListener(PROMPT_LIBRARY_CHANNEL, requestRefresh);
    window.addEventListener('storage', storageChanged);
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel.current = new BroadcastChannel(PROMPT_LIBRARY_CHANNEL);
        channel.current.onmessage = requestRefresh;
      } catch { /* Same-document events and the storage signal remain available. */ }
    }
    requestRefresh();
    return () => {
      active = false; mounted.current = false; refreshRef.current = () => {};
      window.removeEventListener(PROMPT_LIBRARY_CHANNEL, requestRefresh);
      window.removeEventListener('storage', storageChanged);
      channel.current?.close(); channel.current = null;
    };
  }, []);
  const store = async (next: PromptEntry[], baseline: PromptEntry[] = entries, options: PromptSaveOptions = {}): Promise<PromptStoreResult> => {
    if (writing.current) return { ok: false, message: '正在保存，请稍候' };
    // An initial empty render is never a valid baseline for modifying existing records.
    if (!loaded.current) {
      try { const saved = await loadPromptLibrary(); if (mounted.current) setLibrary(saved); loaded.current = true; }
      catch (error) { return { ok: false, message: promptStorageError(error) }; }
      return { ok: false, message: '提示词正在载入，内容已保留，请再次保存' };
    }
    writing.current = true;
    ++revision.current;
    try {
      const saved = await persistPromptLibrary(next, baseline, { ...options, categoryIdentities });
      if (mounted.current) setLibrary(saved);
      return { ok: true };
    } catch (error) { return { ok: false, message: promptStorageError(error) }; }
    finally {
      writing.current = false;
      if (pendingRefresh.current) { pendingRefresh.current = false; refreshRef.current(); }
    }
  };
  const createCategory = async (name: string, locale: Locale): Promise<PromptCategoryCreateResult> => {
    if (writing.current) return { ok: false, message: '正在保存，请稍候' };
    writing.current = true;
    ++revision.current;
    try {
      const { category, ...saved } = await createPromptCategory(name, locale);
      if (mounted.current) setLibrary(saved);
      loaded.current = true;
      return { ok: true, category };
    } catch (error) { return { ok: false, message: promptStorageError(error) }; }
    finally {
      writing.current = false;
      if (pendingRefresh.current) { pendingRefresh.current = false; refreshRef.current(); }
    }
  };
  const deleteCategories = async (categories: string[]): Promise<PromptStoreResult> => {
    if (writing.current) return { ok: false, message: '正在保存，请稍候' };
    writing.current = true;
    ++revision.current;
    try {
      const saved = await deletePromptCategories(categories);
      if (mounted.current) setLibrary(saved);
      loaded.current = true;
      return { ok: true };
    } catch (error) { return { ok: false, message: promptStorageError(error) }; }
    finally {
      writing.current = false;
      if (pendingRefresh.current) { pendingRefresh.current = false; refreshRef.current(); }
    }
  };
  const manageCategories = async (changes: PromptCategoryDraftChanges, locale: Locale): Promise<PromptStoreResult> => {
    if (writing.current) return { ok: false, message: '正在保存，请稍候' };
    writing.current = true;
    ++revision.current;
    try {
      const saved = await managePromptCategories(changes, locale);
      if (mounted.current) setLibrary(saved);
      loaded.current = true;
      return { ok: true };
    } catch (error) { return { ok: false, message: promptStorageError(error) }; }
    finally {
      writing.current = false;
      if (pendingRefresh.current) { pendingRefresh.current = false; refreshRef.current(); }
    }
  };
  const deleteCategory = (category: string): Promise<PromptStoreResult> => deleteCategories([category]);
  return { entries, store, customCategories, categoryIdentities, createCategory, deleteCategory, deleteCategories, manageCategories };
}

// Resolve selection from the previous registry snapshot before the form's
// invalid-category fallback runs. Existing drafts follow renames, not namesakes.
export function usePromptCategoryResolver(identities: PromptCategoryIdentities | undefined) {
  const previous = useRef(identities);
  const snapshot = previous.current;
  useLayoutEffect(() => { previous.current = identities; }, [identities]);
  return (category: string | undefined) => resolvePromptCategoryIdentity(category, snapshot, identities);
}
