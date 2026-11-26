import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, useEffect, useState } from 'react';
import type { Root } from 'react-dom/client';
import type { PromptCategoryDraftChanges } from '../src/usePromptCategoryDrafts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLDialogElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent'] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true, innerWidth: 1200, innerHeight: 900,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
});
Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
Object.assign(dom.window.HTMLDialogElement.prototype, {
  showModal() { this.open = true; }, close() { this.open = false; },
});
Object.defineProperty(dom.window.HTMLElement.prototype, 'getBoundingClientRect', { value() {
  return { x: 16, y: 80, left: 16, top: 80, right: 336, bottom: 112, width: 320, height: 32, toJSON() {} };
} });
const { createRoot } = await import('react-dom/client');
const { PromptCategoryField } = await import('../src/components/PromptCategories');
const { PromptCategoryManager } = await import('../src/components/PromptCategoryManager');
const { usePromptCategoryDrafts } = await import('../src/usePromptCategoryDrafts');

const model = 'custom:模特', scene = 'custom:场景';
const roots: Root[] = [];
afterEach(async () => {
  await act(async () => { roots.splice(0).forEach(root => root.unmount()); });
  document.body.replaceChildren();
});
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); }
async function click(element: HTMLElement) {
  assert.ok(!(element instanceof dom.window.HTMLButtonElement) || !element.disabled, 'Clicked button should be enabled');
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await settle();
}
function button(scope: ParentNode, label: string) {
  const result = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === label || item.getAttribute('aria-label') === label);
  assert.ok(result, `Missing button: ${label}`); return result;
}
function manager() {
  const result = document.querySelector<HTMLDialogElement>('.prompt-category-manager');
  assert.ok(result, 'Manager should be open'); return result;
}
async function fill(scope: ParentNode, name: string) {
  const input = scope.querySelector<HTMLInputElement>('input[aria-label="分类名称"]');
  assert.ok(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, name);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function add(scope: ParentNode, name: string) {
  await click(button(scope, '自定义')); await fill(scope, name); await click(button(scope, '添加'));
}
async function openManager(host: HTMLElement) { await click(button(host, '管理标签')); return manager(); }
async function removeCurrent(host: HTMLElement) {
  const dialog = await openManager(host);
  await click(button(dialog, '删除标签 · 模特')); await click(button(dialog, '确定'));
}
async function restoreInManager(host: HTMLElement, name = '模特') {
  const dialog = await openManager(host); await add(dialog, name); await click(button(dialog, '确定'));
}
async function mount(initial = model, size: 's' | 'l' = 'l') {
  const host = document.createElement('div'); host.setAttribute('role', 'dialog'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  const result = { host, selected: initial, categories: [] as string[], changes: {} as PromptCategoryDraftChanges, cancel: () => {} };
  function Harness() {
    const [value, setValue] = useState(initial);
    const [draftId, setDraftId] = useState(0);
    const drafts = usePromptCategoryDrafts([model, scene], 'zh-CN');
    const selected = drafts.categories.includes(value) ? value : 'all';
    useEffect(() => { if (value !== selected) setValue(selected); }, [value, selected]);
    result.selected = selected; result.categories = drafts.categories; result.changes = drafts.getChanges();
    result.cancel = () => { drafts.reset(); setValue(initial); setDraftId(id => id + 1); };
    return <PromptCategoryField key={draftId} size={size} categories={drafts.categories} value={selected} locale="zh-CN" onChange={setValue}
      onCreateCategory={drafts.createCategory} onManageCategories={drafts.applyChanges} />;
  }
  await act(async () => { root.render(<Harness />); });
  return result;
}

for (const size of ['l', 's'] as const) {
  test(`${size} field restores the automatic fallback across manager confirmations without a pending deletion`, async () => {
    const app = await mount(model, size);
    await removeCurrent(app.host);
    assert.equal(app.selected, 'all'); assert.deepEqual(app.changes.deleted, [model]);
    await restoreInManager(app.host);
    assert.equal(app.selected, model); assert.deepEqual(app.changes.deleted, []);
    assert.deepEqual(app.changes.created, []);
  });
}

for (const chosen of ['all', scene]) {
  test(`manager restoration keeps the user's explicit choice ${chosen}`, async () => {
    const app = await mount(); await removeCurrent(app.host);
    await click(button(app.host, chosen === 'all' ? '全部' : '场景'));
    await restoreInManager(app.host);
    assert.equal(app.selected, chosen); assert.deepEqual(app.changes.deleted, []);
  });
}

test('adding the removed name in the source form restores it; an explicit All choice is preserved', async () => {
  const app = await mount(); await removeCurrent(app.host); await add(app.host, '模特');
  assert.equal(app.selected, model); assert.deepEqual(app.changes.deleted, []);
  await removeCurrent(app.host); await click(button(app.host, '全部')); await add(app.host, '模特');
  assert.equal(app.selected, 'all'); assert.deepEqual(app.changes.deleted, []);
});

test('adding a different name still selects the new label and prevents later restoration from overwriting it', async () => {
  const app = await mount(); await removeCurrent(app.host); await add(app.host, '穿搭');
  assert.equal(app.selected, 'custom:穿搭');
  await restoreInManager(app.host);
  assert.equal(app.selected, 'custom:穿搭'); assert.deepEqual(app.changes.created, ['custom:穿搭']);
});

test('delete and restore inside one manager keeps selection; cancel restores the previous draft boundary', async () => {
  const app = await mount();
  const dialog = await openManager(app.host);
  await click(button(dialog, '删除标签 · 模特')); await add(dialog, '模特'); await click(button(dialog, '确定'));
  assert.equal(app.selected, model); assert.deepEqual(app.changes.deleted, []);
  await removeCurrent(app.host);
  const cancelled = await openManager(app.host); await add(cancelled, '模特'); await click(button(cancelled, '取消'));
  assert.equal(app.selected, 'all'); assert.deepEqual(app.changes.deleted, [model]);
  await act(async () => app.cancel());
  assert.equal(app.selected, model); assert.deepEqual(app.changes.deleted, []);
  await removeCurrent(app.host); await restoreInManager(app.host);
  assert.equal(app.selected, model);
});

test('repeated removal restores only the most recent automatic fallback', async () => {
  const app = await mount(); await removeCurrent(app.host); await click(button(app.host, '场景'));
  const dialog = await openManager(app.host); await click(button(dialog, '删除标签 · 场景')); await click(button(dialog, '确定'));
  await restoreInManager(app.host); assert.equal(app.selected, 'all');
  await restoreInManager(app.host, '场景'); assert.equal(app.selected, scene);
});

test('adding mode blocks pointer and keyboard sorting; Escape and successful Add restore sorting', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(async () => root.render(<PromptCategoryManager categories={[model, scene]} locale="zh-CN" phase="enter" onClose={() => {}} onSave={async () => ({ ok: true })} />));
  const dialog = manager();
  const order = () => [...dialog.querySelectorAll<HTMLElement>('[data-category-id]')].sort((a, b) => Number(a.style.order) - Number(b.style.order)).map(item => item.dataset.categoryId);
  const first = () => dialog.querySelector<HTMLElement>('[data-category-id]')!;
  await click(button(dialog, '自定义')); await fill(dialog, '待添加');
  assert.equal(button(dialog, '确定').disabled, true); assert.equal(first().draggable, false); assert.equal(first().tabIndex, -1);
  await act(async () => {
    first().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
    const event = new dom.window.Event('dragstart', { bubbles: true, cancelable: true });
    first().dispatchEvent(event); assert.equal(event.defaultPrevented, true);
  });
  assert.deepEqual(order(), [model, scene]); assert.equal(dialog.querySelector<HTMLInputElement>('input')?.value, '待添加');
  await act(async () => dialog.querySelector('input')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(first().draggable, true); assert.equal(button(dialog, '确定').disabled, false);
  await act(async () => first().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true })));
  assert.deepEqual(order(), [scene, model]);
  await add(dialog, '穿搭');
  assert.equal(first().draggable, true); assert.equal(dialog.querySelector('input'), null);
});
