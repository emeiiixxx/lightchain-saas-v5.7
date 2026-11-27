import { imageDisplayPreview } from './bundled-assets';
import type { PromptEntry } from './prompt-types';
import type { Locale } from './i18n';
import type { PromptCategoryDraftChanges } from './usePromptCategoryDrafts';
import { MAX_CUSTOM_PROMPT_CATEGORIES, getCustomPromptCategoryCount, normalizePromptCategory, orderCustomPromptCategories, promptCategoryCopy, promptCategoryNameError, resolveCustomPromptCategory } from './prompt-categories';
import { ROLE_MODEL_PRESETS_VERSION, roleModelPresets } from './prompt-role-presets';
import { characterOutfitPreset } from './prompt-character-presets';
import { readPromptCoverDataUrl } from './prompt-cover-image';

const DATABASE = 'lc-v57-prompt-library';
const STORE = 'library';
const SNAPSHOT = 'current';
const CUSTOM_CATEGORIES = 'categories:custom-v1';
const ROLE_MODEL_PRESETS_MARKER = 'seed:role-model-presets';
const ROLE_MODEL_CATEGORY_MARKER = 'migration:role-model-category-v1';
const ROLE_MODEL_COVERS_MARKER = 'seed:role-model-covers-v1';
const CHARACTER_OUTFIT_MARKER = 'seed:character-outfit-v1';
const roleModelCoverFiles = [
  'asian-female', 'white-female', 'latina-female', 'black-female',
  'asian-male', 'white-male', 'latino-male', 'black-male',
].map(name => ({ id: `v57-role-model-${name}`, path: `assets/prompt-role-covers-v57/${name}.png` }));
const LEGACY_LIBRARIES = [
  { source: 'flow', database: 'lc-v57-flow-prompt-library', key: 'lc-v57-flow-fusion-prompts' },
  { source: 'design', database: 'lc-v57-design-prompt-library', key: 'lc-v57-design-prompts' },
] as const;
export const PROMPT_LIBRARY_CHANNEL = 'lc-v57-prompt-library-updated';
type Snapshot = {
  version: 1;
  entries: (Omit<PromptEntry, 'coverUrl'> & { coverKey?: number })[];
  covers: string[];
  migratedV57Libraries?: true;
};
export type PromptStoreResult = { ok: true } | { ok: false; message: string };
export type PromptBatchAction = { type: 'delete' } | { type: 'move'; category: string; categoryIdentity?: string };
export type PromptCategoryCreateResult = { ok: true; category: string } | { ok: false; message: string };
export type PromptCategoryIdentities = Record<string, string>;
export type PromptLibraryState = { entries: PromptEntry[]; customCategories: string[]; categoryIdentities?: PromptCategoryIdentities };
// Keep the legacy call shape, but category changes only commit through the
// independent category APIs; a stale prompt form must not restore deleted tags.
export type PromptSaveOptions = { categoriesToCreate?: string[]; categoriesToDelete?: string[]; categoryOrder?: string[]; locale?: Locale; categoryIdentities?: PromptCategoryIdentities };
type CustomCategoryRegistry = { version: 1; categories: string[]; identities?: PromptCategoryIdentities };
const editableFields = ['name', 'content', 'pinned', 'coverUrl', 'category'] as const;

function validate(entries: unknown): PromptEntry[] {
  if (!Array.isArray(entries) || entries.some(entry => !entry || typeof entry.id !== 'string' || !entry.id || typeof entry.name !== 'string' || typeof entry.content !== 'string')) {
    throw new Error('Invalid prompt library');
  }
  const ids = new Set<string>();
  return entries.map(entry => {
    if (ids.has(entry.id)) throw new Error('Duplicate prompt ID');
    ids.add(entry.id);
    return { id: entry.id, name: entry.name, content: entry.content, pinned: entry.pinned === true,
      category: typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : undefined,
      coverUrl: typeof entry.coverUrl === 'string' && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(entry.coverUrl) ? entry.coverUrl : undefined };
  });
}

function readLegacySource(key: string): PromptEntry[] {
  const raw = localStorage.getItem(key);
  if (raw === null) return [];
  const parsed = JSON.parse(raw);
  const entries: unknown = parsed?.version === 2 ? parsed.entries : parsed;
  if (!Array.isArray(entries)) throw new Error('Invalid prompt library');
  return validate(entries.flatMap((entry, index) => {
    if (typeof entry === 'string') return [{ id: `legacy-${index}`, name: entry.slice(0, 50), content: entry }];
    if (!entry || typeof entry.name !== 'string' || typeof entry.content !== 'string') return [];
    return [{ ...entry, id: typeof entry.id === 'string' && entry.id ? entry.id : `legacy-${index}` }];
  }));
}

function sameEntry(a: PromptEntry, b: PromptEntry): boolean {
  return editableFields.every(field => a[field] === b[field]);
}

function mergeLegacySources(current: PromptEntry[], sources: { source: string; entries: PromptEntry[] }[]): PromptEntry[] {
  const merged = [...current];
  const byId = new Map(merged.map(entry => [entry.id, entry]));
  for (const { source, entries } of sources) {
    for (const entry of entries) {
      const existing = byId.get(entry.id);
      if (existing && sameEntry(existing, entry)) continue;
      let id = entry.id;
      // Legacy string records can share IDs across workspaces; retain both records.
      if (existing) {
        const stem = `v57-${source}:${entry.id}`;
        id = stem;
        for (let suffix = 2; byId.has(id); suffix++) id = `${stem}:${suffix}`;
      }
      const imported = { ...entry, id };
      merged.push(imported); byId.set(id, imported);
    }
  }
  return merged;
}

export function readLegacyPrompts(): PromptEntry[] {
  return mergeLegacySources([], LEGACY_LIBRARIES.map(source => ({ source: source.source, entries: readLegacySource(source.key) })));
}

function pack(entries: PromptEntry[]): Snapshot {
  const covers: string[] = [];
  const indexes = new Map<string, number>();
  return { version: 1, migratedV57Libraries: true, entries: entries.map(({ coverUrl, ...entry }) => {
    if (!coverUrl) return entry;
    let coverKey = indexes.get(coverUrl);
    if (coverKey === undefined) { coverKey = covers.length; indexes.set(coverUrl, coverKey); covers.push(coverUrl); }
    return { ...entry, coverKey };
  }), covers };
}

function unpack(snapshot: Snapshot): PromptEntry[] {
  if (snapshot.version !== 1 || !Array.isArray(snapshot.entries) || !Array.isArray(snapshot.covers)) throw new Error('Invalid prompt library');
  return validate(snapshot.entries.map(({ coverKey, ...entry }) => {
    if (coverKey !== undefined && (!Number.isInteger(coverKey) || typeof snapshot.covers[coverKey] !== 'string')) throw new Error('Invalid cover');
    return { ...entry, coverUrl: coverKey === undefined ? undefined : snapshot.covers[coverKey] };
  }));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new DOMException('Database upgrade blocked', 'InvalidStateError')); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

function readDatabaseSnapshot(db: IDBDatabase): Promise<Snapshot | undefined> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(STORE)) { db.close(); resolve(undefined); return; }
    try {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(SNAPSHOT);
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onabort = () => { db.close(); reject(tx.error ?? request.error ?? new Error('Transaction aborted')); };
    } catch (error) { db.close(); reject(error); }
  });
}

function readExistingDatabase(database: string): Promise<Snapshot | undefined> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database);
    let missing = false, blocked = false;
    // Abort the initial creation: legacy stores are read-only and never created or changed.
    request.onupgradeneeded = () => { missing = true; request.transaction?.abort(); };
    request.onerror = () => { if (missing) resolve(undefined); else reject(request.error); };
    request.onblocked = () => { blocked = true; reject(new DOMException('Database open blocked', 'InvalidStateError')); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      void readDatabaseSnapshot(request.result).then(resolve, reject);
    };
  });
}

async function updateSnapshot(update: (current: Snapshot | undefined) => Snapshot): Promise<Snapshot> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(SNAPSHOT);
      let result: Snapshot | undefined, failure: unknown;
      request.onsuccess = () => {
        try { result = update(request.result); store.put(result, SNAPSHOT); }
        catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => { db.close(); if (result) resolve(result); else reject(new Error('Prompt library update was not committed')); };
      tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? request.error ?? new Error('Transaction aborted')); };
    } catch (error) { db.close(); reject(error); }
  });
}

async function initializePromptPresets(): Promise<void> {
  const db = await openDatabase();
  const changed = await new Promise<boolean>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const snapshotRequest = store.get(SNAPSHOT);
      const markerRequest = store.get(ROLE_MODEL_PRESETS_MARKER);
      const categoryMarkerRequest = store.get(ROLE_MODEL_CATEGORY_MARKER);
      const characterMarkerRequest = store.get(CHARACTER_OUTFIT_MARKER);
      let completedReads = 0, changed = false, failure: unknown;
      const seed = () => {
        if (++completedReads !== 4) return;
        try {
          const version: unknown = markerRequest.result;
          const needsSeed = typeof version !== 'number' || version < ROLE_MODEL_PRESETS_VERSION;
          const needsRetireCategoryMove = categoryMarkerRequest.result !== true;
          const needsCharacterPreset = characterMarkerRequest.result !== true;
          if (!needsSeed && !needsRetireCategoryMove && !needsCharacterPreset) return;
          const snapshot = snapshotRequest.result as Snapshot | undefined;
          if (!snapshot?.migratedV57Libraries) throw new Error('Prompt library is not initialized');
          let entries = unpack(snapshot);
          if (needsSeed) {
            const ids = new Set(entries.map(entry => entry.id));
            const missing = validate(roleModelPresets).filter(entry => !ids.has(entry.id));
            if (missing.length) {
              entries = [...entries, ...missing];
              changed = true;
            }
          }
          if (needsRetireCategoryMove) {
            // Retire the old model reassignment without overwriting user categories.
            // Keep its marker so older clients cannot run that migration again.
            store.put(true, ROLE_MODEL_CATEGORY_MARKER);
          }
          if (needsCharacterPreset) {
            if (!entries.some(entry => entry.id === characterOutfitPreset.id)) {
              entries = [...entries, ...validate([characterOutfitPreset])];
              changed = true;
            }
            // Seed once, without a cover; later user edits or deletion stay intact.
            store.put(true, CHARACTER_OUTFIT_MARKER);
          }
          if (changed) store.put(pack(entries), SNAPSHOT);
          // Keep this outside the snapshot so an older client's pack() cannot erase it.
          // The entries and marker commit atomically; deleted or edited presets stay that way.
          if (needsSeed) store.put(ROLE_MODEL_PRESETS_VERSION, ROLE_MODEL_PRESETS_MARKER);
        } catch (error) { failure = error; tx.abort(); }
      };
      snapshotRequest.onsuccess = seed;
      markerRequest.onsuccess = seed;
      categoryMarkerRequest.onsuccess = seed;
      characterMarkerRequest.onsuccess = seed;
      tx.oncomplete = () => { db.close(); resolve(changed); };
      tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? snapshotRequest.error ?? markerRequest.error ?? categoryMarkerRequest.error ?? characterMarkerRequest.error ?? new Error('Preset initialization aborted')); };
    } catch (error) { db.close(); reject(error); }
  });
  if (!changed) return;
  notifyPromptLibraryChanged('prompt-presets');
}

function notifyPromptLibraryChanged(reason: string): void {
  // Existing parent/iframe views receive the same committed-data signal as a normal save.
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROMPT_LIBRARY_CHANNEL));
  if (typeof BroadcastChannel !== 'undefined') {
    let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel(PROMPT_LIBRARY_CHANNEL); channel.postMessage('updated'); }
    catch { /* The seed is already committed; notification failure must not report a failed save. */ }
    finally { channel?.close(); }
  }
  try { localStorage.setItem(PROMPT_LIBRARY_CHANNEL, `${reason}:${Date.now()}`); }
  catch { /* BroadcastChannel and same-document notifications do not require localStorage. */ }
}

async function readRoleModelCoversMarker(): Promise<boolean> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(ROLE_MODEL_COVERS_MARKER);
      tx.oncomplete = () => { db.close(); resolve(request.result === true); };
      tx.onabort = () => { db.close(); reject(tx.error ?? request.error ?? new Error('Cover marker read aborted')); };
    } catch (error) { db.close(); reject(error); }
  });
}

async function commitRoleModelCovers(covers: Map<string, string>): Promise<boolean> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const snapshotRequest = store.get(SNAPSHOT);
      const markerRequest = store.get(ROLE_MODEL_COVERS_MARKER);
      let completedReads = 0, changed = false, failure: unknown;
      const commit = () => {
        if (++completedReads !== 2) return;
        try {
          if (markerRequest.result === true) return;
          const snapshot = snapshotRequest.result as Snapshot | undefined;
          if (!snapshot?.migratedV57Libraries) throw new Error('Prompt library is not initialized');
          const originals = new Map(roleModelPresets.map(entry => [entry.id, entry]));
          const entries = unpack(snapshot).map(entry => {
            const original = originals.get(entry.id), coverUrl = covers.get(entry.id);
            // Match the current record after fetching: deleted, renamed, edited, or covered
            // records remain untouched, including user changes made while the images loaded.
            if (!original || !coverUrl || entry.coverUrl || entry.name !== original.name || entry.content !== original.content) return entry;
            changed = true;
            return { ...entry, coverUrl };
          });
          if (changed) store.put(pack(entries), SNAPSHOT);
          // Independent from pack(); removing a cover later must not seed it again.
          store.put(true, ROLE_MODEL_COVERS_MARKER);
        } catch (error) { failure = error; tx.abort(); }
      };
      snapshotRequest.onsuccess = commit;
      markerRequest.onsuccess = commit;
      tx.oncomplete = () => { db.close(); resolve(changed); };
      tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? snapshotRequest.error ?? markerRequest.error ?? new Error('Cover initialization aborted')); };
    } catch (error) { db.close(); reject(error); }
  });
}

let coverInitialization: Promise<void> | undefined;
let coversInitialized = false;
function initializeRoleModelCovers(): Promise<void> {
  if (coversInitialized) return Promise.resolve();
  if (!coverInitialization) coverInitialization = (async () => {
    if (await readRoleModelCoversMarker()) { coversInitialized = true; return; }
    // Fetch and convert every cover before opening the write transaction. BASE_URL
    // is shared by the parent and workbench bundles, including GitHub Pages builds.
    const coverEntries = await Promise.all(roleModelCoverFiles.map(async ({ id, path }) =>
      [id, await readPromptCoverDataUrl(imageDisplayPreview(`${import.meta.env.BASE_URL}${path}`))] as const));
    const changed = await commitRoleModelCovers(new Map(coverEntries));
    coversInitialized = true;
    if (changed) notifyPromptLibraryChanged('role-model-covers-v1');
  })().catch(() => {
    // Optional example covers must not block opening or saving the user's library.
    // Failed requests/transactions leave the marker unset and can retry on a later refresh.
  }).finally(() => { coverInitialization = undefined; });
  return coverInitialization;
}

let migration: Promise<void> | undefined;
function initialize(): Promise<void> {
  if (!migration) migration = (async () => {
    const current = await readDatabaseSnapshot(await openDatabase());
    if (!current?.migratedV57Libraries) {
      const sources = await Promise.all(LEGACY_LIBRARIES.map(async source => {
        const snapshot = await readExistingDatabase(source.database);
        return { source: source.source, entries: snapshot === undefined ? readLegacySource(source.key) : unpack(snapshot) };
      }));
      await updateSnapshot(latest => {
        // The marker and merged records commit together, even when both iframe and parent initialize.
        if (latest?.migratedV57Libraries) return latest;
        return pack(mergeLegacySources(latest ? unpack(latest) : [], sources));
      });
    }
    // Leave both v5.7 source databases and their legacy localStorage payloads intact.
    await initializePromptPresets();
  })().catch(error => { migration = undefined; throw error; });
  return migration;
}

class PromptConflictError extends Error {}

function customCategoryId(category: string): string {
  if (!category.startsWith('custom:')) return '';
  const name = category.slice(7).normalize('NFKC').trim().replace(/\s+/g, ' ');
  return name ? `custom:${name}` : '';
}

function categoryKey(category: string): string {
  return category.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function uniqueCustomCategories(categories: string[]): string[] {
  const seen = new Set<string>();
  return categories.flatMap(category => {
    const id = customCategoryId(category), key = categoryKey(id);
    if (!id || seen.has(key)) return [];
    seen.add(key);
    return [id];
  });
}

function readCustomCategories(registry: unknown, entries: PromptEntry[]): string[] {
  // Only the first registry creation imports tags from records. Later stale saves
  // cannot re-register a category that the user explicitly deleted.
  if (registry === undefined) return uniqueCustomCategories(entries.map(entry => entry.category ?? ''));
  const saved = registry as Partial<CustomCategoryRegistry> | null;
  if (saved?.version !== 1 || !Array.isArray(saved.categories) || saved.categories.some(category => typeof category !== 'string')) {
    throw new Error('Invalid prompt category registry');
  }
  return uniqueCustomCategories(saved.categories);
}

function readCategoryIdentities(registry: unknown, categories: string[]): PromptCategoryIdentities {
  const saved = (registry as Partial<CustomCategoryRegistry> | null)?.identities;
  const used = new Set<string>();
  return Object.fromEntries(categories.map(category => {
    const existing = saved && typeof saved === 'object' ? saved[category] : undefined;
    const identity = typeof existing === 'string' && existing && !used.has(existing) ? existing : crypto.randomUUID();
    used.add(identity);
    return [category, identity];
  }));
}

// Names remain compatible with existing records; identities distinguish a rename
// from deleting a category and later creating an unrelated category of that name.
export function resolvePromptCategoryIdentity(category: string | undefined, previous: PromptCategoryIdentities | undefined, current: PromptCategoryIdentities | undefined): string {
  const normalized = normalizePromptCategory(category);
  if (normalized === 'all') return 'all';
  const key = categoryKey(customCategoryId(normalized));
  const previousName = Object.keys(previous ?? {}).find(name => categoryKey(name) === key);
  if (previousName) {
    const identity = previous![previousName];
    return Object.keys(current ?? {}).find(name => current![name] === identity) ?? 'all';
  }
  return Object.keys(current ?? {}).find(name => categoryKey(name) === key) ?? 'all';
}

function applyRegisteredCategories(entries: PromptEntry[], customCategories: string[]): PromptEntry[] {
  const registered = new Map(customCategories.map(category => [categoryKey(category), category]));
  let changed = false;
  const normalized = entries.map(entry => {
    const value = normalizePromptCategory(entry.category);
    const category = value.startsWith('custom:')
      ? registered.get(categoryKey(customCategoryId(value))) ?? 'all'
      : 'all';
    if (entry.category === category) return entry;
    changed = true;
    return { ...entry, category };
  });
  return changed ? normalized : entries;
}

async function updatePromptLibrary<T>(
  update: (current: PromptLibraryState) => { state: PromptLibraryState; result: T },
  reason: string,
): Promise<{ state: PromptLibraryState; result: T }> {
  const db = await openDatabase();
  let changed = false;
  const committed = await new Promise<{ state: PromptLibraryState; result: T }>((resolve, reject) => {
    try {
      // Registry initialization, category limits and record edits share one serial
      // transaction across the parent, workbench iframe and other open tabs.
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const snapshotRequest = store.get(SNAPSHOT), registryRequest = store.get(CUSTOM_CATEGORIES);
      let completedReads = 0, value: { state: PromptLibraryState; result: T } | undefined, failure: unknown;
      const commit = () => {
        if (++completedReads !== 2) return;
        try {
          const snapshot = snapshotRequest.result as Snapshot | undefined;
          if (!snapshot?.migratedV57Libraries) throw new Error('Prompt library is not initialized');
          const original = unpack(snapshot);
          const customCategories = readCustomCategories(registryRequest.result, original);
          const categoryIdentities = readCategoryIdentities(registryRequest.result, customCategories);
          const current = { entries: applyRegisteredCategories(original, customCategories), customCategories, categoryIdentities };
          const updated = update(current);
          const identities = readCategoryIdentities({ identities: updated.state.categoryIdentities ?? categoryIdentities }, updated.state.customCategories);
          const state = { ...updated.state, categoryIdentities: identities, entries: applyRegisteredCategories(updated.state.entries, updated.state.customCategories) };
          value = { state, result: updated.result };
          if (state.entries !== original) { store.put(pack(state.entries), SNAPSHOT); changed = true; }
          const previous = (registryRequest.result as CustomCategoryRegistry | undefined)?.categories;
          const previousIdentities = (registryRequest.result as CustomCategoryRegistry | undefined)?.identities;
          if (!previous || previous.length !== state.customCategories.length || previous.some((category, index) => category !== state.customCategories[index]) || state.customCategories.some(category => previousIdentities?.[category] !== identities[category])) {
            store.put({ version: 1, categories: state.customCategories, identities } satisfies CustomCategoryRegistry, CUSTOM_CATEGORIES);
            changed = true;
          }
        } catch (error) { failure = error; tx.abort(); }
      };
      snapshotRequest.onsuccess = commit;
      registryRequest.onsuccess = commit;
      tx.oncomplete = () => {
        db.close();
        if (value) resolve(value); else reject(new Error('Prompt library update was not committed'));
      };
      tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? snapshotRequest.error ?? registryRequest.error ?? new Error('Transaction aborted')); };
    } catch (error) { db.close(); reject(error); }
  });
  if (changed) notifyPromptLibraryChanged(reason);
  return committed;
}

export async function loadPromptLibrary(): Promise<PromptLibraryState> {
  await initialize();
  void initializeRoleModelCovers();
  return (await updatePromptLibrary(state => ({ state, result: undefined }), 'category-registry')).state;
}

export async function loadPrompts(): Promise<PromptEntry[]> {
  return (await loadPromptLibrary()).entries;
}

function mergeChanges(latest: PromptEntry[], baseline: PromptEntry[], next: PromptEntry[]): PromptEntry[] {
  const before = new Map(baseline.map(entry => [entry.id, entry]));
  const after = new Map(next.map(entry => [entry.id, entry]));
  // Only IDs present in the caller's baseline can be explicitly deleted by that caller.
  const result = latest.filter(entry => !before.has(entry.id) || after.has(entry.id));
  const added: PromptEntry[] = [], pinned = new Set<string>(), unpinned = new Set<string>();
  for (const entry of next) {
    const original = before.get(entry.id);
    const index = result.findIndex(item => item.id === entry.id);
    if (!original) {
      if (index !== -1) {
        if (!sameEntry(result[index], entry)) throw new PromptConflictError('提示词记录已更新，当前修改未保存，请重试');
      } else added.push(entry);
      continue;
    }
    const fields = editableFields.filter(field => original[field] !== entry[field]);
    if (!fields.length) continue;
    if (index === -1) throw new PromptConflictError('该提示词已在其他页面删除，当前修改未保存，请另存为');
    // Preserve fields changed elsewhere while this view held an older snapshot.
    result[index] = { ...result[index], ...Object.fromEntries(fields.map(field => [field, entry[field]])) };
    if (fields.includes('pinned')) (entry.pinned ? pinned : unpinned).add(entry.id);
  }
  const justPinned = next.flatMap(entry => pinned.has(entry.id) ? result.filter(item => item.id === entry.id) : []);
  const justUnpinned = next.flatMap(entry => unpinned.has(entry.id) ? result.filter(item => item.id === entry.id) : []);
  const unchangedOrder = result.filter(entry => !pinned.has(entry.id) && !unpinned.has(entry.id));
  // New and newly pinned cards go first; unpinning keeps the existing pinned section intact.
  return [...added, ...justPinned, ...unchangedOrder.filter(entry => entry.pinned), ...justUnpinned, ...unchangedOrder.filter(entry => !entry.pinned)];
}

function registerPendingCategories(current: string[], pending: string[], locale: Locale, restoring: ReadonlySet<string>) {
  const customCategories = [...current];
  for (const pendingCategory of pending) {
    const id = customCategoryId(pendingCategory);
    if (!id) throw new PromptConflictError(promptCategoryCopy[locale].failed);
    const name = id.slice(7);
    const category = resolveCustomPromptCategory(name, customCategories, locale);
    // Removing and restoring a label in one draft undoes its deletion; it
    // does not create a second label with the same name.
    if (restoring.has(categoryKey(id)) && current.includes(category)) {
      continue;
    }
    const error = promptCategoryNameError(name, customCategories, locale);
    if (error) throw new PromptConflictError(error);

    if (getCustomPromptCategoryCount(customCategories) >= MAX_CUSTOM_PROMPT_CATEGORIES) {
      throw new PromptConflictError(promptCategoryCopy[locale].limitReached);
    }
    customCategories.push(category);
  }
  return { customCategories };
}

export async function persistPromptLibrary(entries: PromptEntry[], baseline: PromptEntry[], options: PromptSaveOptions = {}): Promise<PromptLibraryState> {
  await initialize();
  void initializeRoleModelCovers();
  const next = validate(entries), before = validate(baseline);
  return (await updatePromptLibrary(current => {
    const remap = (records: PromptEntry[]) => options.categoryIdentities ? records.map(entry => {
      const category = resolvePromptCategoryIdentity(entry.category, options.categoryIdentities, current.categoryIdentities);
      return entry.category === category ? entry : { ...entry, category };
    }) : records;
    return { state: {
    ...current,
    // Merge only explicit prompt edits into the latest saved records. The
    // transaction normalizes category references against the current registry.
    entries: mergeChanges(current.entries, remap(before), remap(next)),
  }, result: undefined };
  }, 'prompt-save')).state;
}

export async function persistPrompts(entries: PromptEntry[], baseline: PromptEntry[], options: PromptSaveOptions = {}): Promise<PromptEntry[]> {
  return (await persistPromptLibrary(entries, baseline, options)).entries;
}

export async function applyPromptBatch(ids: readonly string[], action: PromptBatchAction, locale: Locale): Promise<PromptStoreResult & { category?: string }> {
  const selected = new Set(ids);
  if (!selected.size) return { ok: true };
  try {
    await initialize();
    const { result: category } = await updatePromptLibrary(current => {
      let entries = current.entries;
      let destination: string | undefined;
      if (action.type === 'delete') {
        const remaining = entries.filter(entry => !selected.has(entry.id));
        if (remaining.length !== entries.length) entries = remaining;
      } else {
        const identities = action.categoryIdentity ? { [action.category]: action.categoryIdentity } : undefined;
        destination = resolvePromptCategoryIdentity(action.category, identities, current.categoryIdentities);
        if (destination === 'all' && action.category !== 'all') {
          throw new PromptConflictError(promptCategoryCopy[locale].failed);
        }
        if (entries.some(entry => selected.has(entry.id) && entry.category !== destination)) {
          entries = entries.map(entry => selected.has(entry.id) && entry.category !== destination
            ? { ...entry, category: destination } : entry);
        }
      }
      return { state: { ...current, entries }, result: destination };
    }, action.type === 'delete' ? 'prompt-batch-delete' : 'prompt-batch-move');
    return { ok: true, category };
  } catch (error) {
    return { ok: false, message: promptStorageError(error) };
  }
}

export async function managePromptCategories(changes: PromptCategoryDraftChanges, locale: Locale): Promise<PromptLibraryState> {
  await initialize();
  return (await updatePromptLibrary(current => {
    const createdKeys = new Set(changes.created.map(customCategoryId).filter(Boolean).map(categoryKey));
    const deletedKeys = new Set(changes.deleted.map(customCategoryId).filter(Boolean).map(categoryKey));
    // Only a remove/re-add within this confirmation undoes deletion. A later
    // creation cannot restore references already committed to All.
    const remaining = current.customCategories.filter(category => !deletedKeys.has(categoryKey(category)) || createdKeys.has(categoryKey(category)));
    const conflict = { 'zh-CN': '分类已在其他页面更新，请关闭管理窗口后重试', en: 'Categories changed in another window. Reopen category management and try again.', ja: '別の画面でカテゴリが更新されました。管理画面を開き直してください。' }[locale];
    const renameMap = new Map<string, string>();
    for (const change of changes.renamed ?? []) {
      const from = current.customCategories.find(category => categoryKey(category) === categoryKey(customCategoryId(change.from)));
      if (!from || deletedKeys.has(categoryKey(from))) throw new PromptConflictError(conflict);
      if (changes.identities && changes.identities[change.from] !== current.categoryIdentities?.[from]) throw new PromptConflictError(conflict);
      const to = customCategoryId(change.to);
      if (!to) throw new PromptConflictError(promptCategoryCopy[locale].failed);
      renameMap.set(from, to);
    }
    for (const deleted of changes.deleted) {
      const currentName = current.customCategories.find(category => categoryKey(category) === categoryKey(customCategoryId(deleted)));
      if (currentName && changes.identities && changes.identities[deleted] !== current.categoryIdentities?.[currentName]) throw new PromptConflictError(conflict);
      if (!currentName && changes.identities?.[deleted] && Object.values(current.categoryIdentities ?? {}).includes(changes.identities[deleted])) throw new PromptConflictError(conflict);
    }
    const renamedCategories = remaining.map(category => renameMap.get(category) ?? category);
    for (const [from, to] of renameMap) {
      const others = remaining.filter(category => category !== from).map(category => renameMap.get(category) ?? category);
      const invalid = promptCategoryNameError(to.slice(7), others, locale);
      if (invalid) throw new PromptConflictError(invalid);
    }
    const restoring = new Set(current.customCategories.map(categoryKey).filter(key => deletedKeys.has(key) && createdKeys.has(key)));
    const pending = registerPendingCategories(renamedCategories, changes.created, locale, restoring);
    const categoryIdentities = Object.fromEntries(remaining.map(category => [renameMap.get(category) ?? category, current.categoryIdentities![category]]));
    return { state: {
      customCategories: orderCustomPromptCategories(pending.customCategories, changes.order?.map(category => renameMap.get(category) ?? category)),
      categoryIdentities,
      // Use the latest saved entries, never a caller's unsaved prompt draft.
      // Registry normalization in this transaction clears deleted categories.
      entries: current.entries.map(entry => {
        // A removed name can simultaneously become another category's new name.
        // Clear its former associations before mapping the surviving identities.
        if (entry.category?.startsWith('custom:') && !remaining.includes(entry.category)) return { ...entry, category: 'all' };
        const category = entry.category ? renameMap.get(entry.category) : undefined;
        return category ? { ...entry, category } : entry;
      }),
    }, result: undefined };
  }, 'category-manage')).state;
}

export async function createPromptCategory(name: string, locale: Locale): Promise<PromptLibraryState & { category: string }> {
  await initialize();
  const committed = await updatePromptLibrary(current => {
    const clean = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
    const error = promptCategoryNameError(clean, current.customCategories, locale);
    if (error) throw new PromptConflictError(error);
    const category = resolveCustomPromptCategory(clean, current.customCategories, locale);
    if (!category) throw new PromptConflictError(promptCategoryCopy[locale].failed);
    // Duplicate creation fails before the count check; selecting an existing
    // category remains a separate action and does not create another label.
    if (getCustomPromptCategoryCount(current.customCategories) >= MAX_CUSTOM_PROMPT_CATEGORIES) {
      throw new PromptConflictError(promptCategoryCopy[locale].limitReached);
    }
    return { state: { ...current, customCategories: [...current.customCategories, category] }, result: category };
  }, 'category-create');
  return { ...committed.state, category: committed.result };
}

export async function deletePromptCategories(categories: string[]): Promise<PromptLibraryState> {
  await initialize();
  const requested = new Set(categories.map(customCategoryId).filter(Boolean).map(categoryKey));
  return (await updatePromptLibrary(current => {
    const deleted = new Set(current.customCategories.filter(category => requested.has(categoryKey(category))).map(categoryKey));
    if (!deleted.size) return { state: current, result: undefined };
    return { state: {
      ...current,
      customCategories: current.customCategories.filter(category => !deleted.has(categoryKey(category))),
      entries: current.entries.map(entry => deleted.has(categoryKey(customCategoryId(entry.category ?? '')))
        ? { ...entry, category: 'all' } : entry),
    }, result: undefined };
  }, 'category-delete')).state;
}

export async function deletePromptCategory(category: string): Promise<PromptLibraryState> {
  return deletePromptCategories([category]);
}

export function promptStorageError(error: unknown): string {
  if (error instanceof PromptConflictError) return error.message;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return '浏览器站点储存配额不足，未保存的内容已保留';
  if (error instanceof DOMException && error.name === 'SecurityError') return '浏览器禁止此页面储存数据，请检查隐私设置';
  return '提示词储存失败，内容已保留，请重试';
}
