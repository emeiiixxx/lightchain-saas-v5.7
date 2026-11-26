import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, useState } from 'react';
import type { Root } from 'react-dom/client';
import type { CropPreset } from '../src/crop-presets';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'CustomEvent', 'StorageEvent', 'KeyboardEvent', 'MouseEvent', 'localStorage'] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true, innerWidth: 1200, innerHeight: 900,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
});
Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
Object.defineProperty(dom.window.HTMLElement.prototype, 'getBoundingClientRect', { value() {
  return { x: 16, y: 80, left: 16, top: 80, right: 336, bottom: 112, width: 320, height: 32, toJSON() {} };
} });
const nativeMatches = dom.window.HTMLElement.prototype.matches;
Object.assign(dom.window.HTMLElement.prototype, {
  showPopover() { this.dataset.popoverOpen = 'true'; },
  hidePopover() { delete this.dataset.popoverOpen; },
  matches(selector: string) { return selector === ':popover-open' ? this.dataset.popoverOpen === 'true' : nativeMatches.call(this, selector); },
});
// Load React DOM after installing the DOM so its input event support is detected correctly.
const { createRoot } = await import('react-dom/client');
const { CropPresetPanel } = await import('../src/components/CropPresetPanel');
const { CROP_PRESETS_STORAGE_KEY, FREE_CROP_PRESET, customCropPreset, readCustomCropPresets, saveCustomCropPresets } = await import('../src/crop-presets');

const roots: Root[] = [];
afterEach(async () => {
  await act(async () => { roots.splice(0).forEach(root => root.unmount()); });
  document.body.replaceChildren();
  localStorage.clear();
});

async function mount(initial: CropPreset = FREE_CROP_PRESET) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  const result = { host, selected: initial, submissions: 0 };
  function Harness() {
    const [selected, setSelected] = useState(initial);
    result.selected = selected;
    return <CropPresetPanel locale="zh-CN" selectedId={selected.id} onSelect={setSelected} submitDisabled={false} busy={false} onSubmit={() => result.submissions++} onNotice={() => {}} />;
  }
  await act(async () => { root.render(<Harness />); });
  return result;
}
function button(host: Element, label: string) {
  const found = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent === label || item.getAttribute('aria-label') === label);
  assert.ok(found, `Button ${label} should exist`);
  return found;
}
async function click(element: HTMLElement) {
  if (element instanceof dom.window.HTMLButtonElement && element.disabled) return;
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, detail: 1 })); });
}
async function fill(host: Element, field: 'width' | 'height', value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${field === 'width' ? '宽' : '高'} (px)"]`);
  assert.ok(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
function dimension(host: Element, field: 'width' | 'height') {
  return host.querySelector<HTMLInputElement>(`input[aria-label="${field === 'width' ? '宽' : '高'} (px)"]`)!.value;
}
async function add(host: Element, width: string, height: string) {
  await click(button(host, '添加自定义预设'));
  await fill(host, 'width', width); await fill(host, 'height', height);
  await click(button(host, '确认'));
}
async function action(host: Element, label: string, actionLabel: '编辑' | '删除') {
  const row = button(host, label).closest('.crop-custom-preset')!;
  await click(button(row, '更多'));
  await click(button(row, actionLabel));
}
async function externalPresets(presets: CropPreset[], clear = false) {
  await act(async () => {
    if (clear) localStorage.clear();
    else localStorage.setItem(CROP_PRESETS_STORAGE_KEY, JSON.stringify(presets));
    window.dispatchEvent(new dom.window.StorageEvent('storage', { key: clear ? null : CROP_PRESETS_STORAGE_KEY }));
  });
}

test('add, edit, duplicate reuse and delete preserve persisted output dimensions and selected preset', async () => {
  const app = await mount();
  await add(app.host, '1200', '800');
  const firstId = app.selected.id;
  assert.equal(app.selected.ratio, 1.5);
  assert.deepEqual(readCustomCropPresets().map(item => [item.outputWidth, item.outputHeight]), [[1200, 800]]);
  await add(app.host, '600', '900');
  assert.deepEqual(readCustomCropPresets().map(item => item.label), ['600*900', '1200*800']);
  await action(app.host, '600*900', '编辑');
  await fill(app.host, 'width', '1200'); await fill(app.host, 'height', '800');
  await click(button(app.host, '确认'));
  assert.equal(app.selected.id, firstId);
  assert.equal(readCustomCropPresets().length, 1);
  await add(app.host, '1200', '800');
  assert.equal(readCustomCropPresets().length, 1);
  await action(app.host, '1200*800', '编辑');
  await fill(app.host, 'height', '1000'); await click(button(app.host, '确认'));
  assert.equal(app.selected.id, firstId); assert.equal(app.selected.ratio, 1.2);
  await action(app.host, '1200*1000', '删除');
  assert.equal(app.selected.id, 'free'); assert.deepEqual(readCustomCropPresets(), []);
  await click(button(app.host, '开始 AI 生成')); assert.equal(app.submissions, 1);
});

test('cancel and Escape discard unsaved edits; unconfirmed values cannot submit generation', async () => {
  const app = await mount();
  await add(app.host, '800', '600');
  await action(app.host, '800*600', '编辑');
  await fill(app.host, 'width', '1000');
  assert.equal(button(app.host, '开始 AI 生成').disabled, true);
  await click(button(app.host, '取消'));
  assert.equal(app.selected.outputWidth, 800);
  await click(button(app.host, '添加自定义预设'));
  await fill(app.host, 'width', '1000');
  await act(async () => { app.host.querySelector('input')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.equal(app.host.querySelector('form'), null);
  assert.deepEqual(readCustomCropPresets().map(item => item.label), ['800*600']);
  assert.equal(button(app.host, '开始 AI 生成').disabled, false);
});

test('editing locks other presets and only blank canvas space cancels the unfinished draft', async () => {
  const app = await mount();
  app.host.classList.add('crop-editor');
  await add(app.host, '1200', '800');
  await add(app.host, '600', '900');
  const selectedBefore = app.selected.id;
  const savedBefore = readCustomCropPresets();
  const canvasImage = document.createElement('div'); canvasImage.className = 'crop-editor-image';
  const zoomControl = document.createElement('button'); zoomControl.textContent = 'Zoom';
  const canvasBlank = document.createElement('div'); canvasBlank.className = 'crop-editor-stage';
  app.host.append(canvasImage, zoomControl, canvasBlank);
  await action(app.host, '1200*800', '编辑');
  await fill(app.host, 'width', '10001');
  await click(button(app.host, '确认'));
  assert.ok(app.host.querySelector('[role="alert"]'));
  for (const label of ['自定义预设 (px)', '通用', '电商商品图', '600*900', '自由']) {
    assert.equal(button(app.host, label).disabled, true, label);
  }
  assert.equal(app.host.querySelector('.crop-preset-more-control'), null);
  for (const target of [canvasImage, zoomControl, button(app.host, '通用'), button(app.host, '600*900')]) {
    await act(async () => { target.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, button: 0 })); });
    assert.equal(dimension(app.host, 'width'), '10001', 'controls and crop image must retain the draft');
  }
  await act(async () => { canvasBlank.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, button: 0 })); });
  assert.equal(app.host.querySelector('form'), null);
  assert.equal(app.host.querySelector('[role="alert"]'), null);
  assert.deepEqual(readCustomCropPresets(), savedBefore);
  assert.equal(app.selected.id, selectedBefore);
  assert.equal(button(app.host, '自定义预设 (px)').getAttribute('aria-expanded'), 'true');
  assert.equal(button(app.host, '通用').disabled, false);
  assert.equal(button(app.host, '600*900').disabled, false);
  assert.ok(app.host.querySelector('.crop-preset-more-control'));
  await action(app.host, '1200*800', '编辑');
  assert.equal(dimension(app.host, 'width'), '1200');
  assert.equal(button(app.host, '锁定宽高比').getAttribute('aria-pressed'), 'false');
  await click(button(app.host, '取消'));
  assert.equal(button(app.host, '通用').disabled, false);
});

test('confirming an edited preset keeps its identity and restores other preset controls', async () => {
  const app = await mount();
  await add(app.host, '1200', '800');
  const id = app.selected.id;
  await action(app.host, '1200*800', '编辑');
  await fill(app.host, 'width', '1500');
  await click(button(app.host, '确认'));
  assert.equal(app.selected.id, id);
  assert.equal(app.selected.outputWidth, 1500);
  assert.equal(app.host.querySelector('form'), null);
  assert.equal(button(app.host, '通用').disabled, false);
  assert.ok(button(app.host, '更多'));
  assert.deepEqual(readCustomCropPresets().map(preset => [preset.id, preset.outputWidth, preset.outputHeight]), [[id, 1500, 800]]);
});

test('locked width and height follow the captured ratio in both directions; unlocking separates them', async () => {
  const app = await mount();
  await click(button(app.host, '添加自定义预设'));
  assert.equal(button(app.host, '锁定宽高比').disabled, true);
  await fill(app.host, 'width', '1200'); await fill(app.host, 'height', '800');
  await click(button(app.host, '锁定宽高比'));
  await fill(app.host, 'width', '1800'); assert.equal(dimension(app.host, 'height'), '1200');
  await fill(app.host, 'height', '1000'); assert.equal(dimension(app.host, 'width'), '1500');
  await click(button(app.host, '解除宽高比锁定'));
  await fill(app.host, 'height', '1200'); assert.equal(dimension(app.host, 'width'), '1500');
  await click(button(app.host, '确认')); assert.equal(app.selected.ratio, 1.25);
});

test('empty, zero, non-integer and unsafe integer values never save a preset', async () => {
  const app = await mount();
  await click(button(app.host, '添加自定义预设'));
  await fill(app.host, 'height', '800');
  for (const value of ['', '0', '-1', '1.5', 'abc', '9007199254740992']) {
    await fill(app.host, 'width', ''); await fill(app.host, 'width', value);
    assert.equal(button(app.host, '确认').disabled, true, value);
    await click(button(app.host, '确认'));
    assert.deepEqual(readCustomCropPresets(), []);
  }
  await fill(app.host, 'width', '001200'); await click(button(app.host, '确认'));
  assert.equal(app.selected.outputWidth, 1200);
});

test('custom presets accept 100–10000px edges when the output has at most 64 million pixels', async () => {
  const app = await mount();
  for (const [width, height] of [[100, 100], [1200, 10000], [6000, 10000], [8000, 8000]]) {
    await add(app.host, String(width), String(height));
    assert.equal(app.host.querySelector('form'), null);
    assert.equal(app.selected.outputWidth, width);
    assert.equal(app.selected.outputHeight, height);
  }
  assert.equal(readCustomCropPresets().length, 4);
});

test('confirm rejects excessive total pixels without saving or losing input, then accepts a corrected size', async () => {
  const app = await mount();
  await click(button(app.host, '添加自定义预设'));
  for (const [width, height] of [[9000, 9000], [10000, 10000]]) {
    await fill(app.host, 'width', String(width));
    await fill(app.host, 'height', String(height));
    assert.equal(app.host.querySelector('[role="alert"]'), null);
    assert.equal(button(app.host, '确认').disabled, false);
    await click(button(app.host, '确认'));
    assert.equal(app.host.querySelector('[role="alert"]')?.textContent, '图片尺寸过大，请减小宽度或高度');
    assert.equal(dimension(app.host, 'width'), String(width));
    assert.equal(dimension(app.host, 'height'), String(height));
    assert.equal(app.host.querySelectorAll('input[aria-invalid="true"]').length, 2);
    assert.deepEqual(readCustomCropPresets(), []);
  }
  await fill(app.host, 'width', '6000');
  assert.equal(app.host.querySelector('[role="alert"]'), null);
  assert.equal(app.host.querySelectorAll('input[aria-invalid="true"]').length, 0);
  await click(button(app.host, '确认'));
  assert.deepEqual(readCustomCropPresets().map(preset => [preset.outputWidth, preset.outputHeight]), [[6000, 10000]]);
});

test('editing and locked dimensions use the same edge and total-pixel validation', async () => {
  const app = await mount();
  await add(app.host, '8000', '8000');
  const original = readCustomCropPresets();
  await action(app.host, '8000*8000', '编辑');
  for (const value of ['99', '10001']) {
    await fill(app.host, 'width', value);
    await click(button(app.host, '确认'));
    assert.equal(app.host.querySelector('[role="alert"]')?.textContent, '宽高须为 100–10000px，请重新输入');
    assert.equal(app.host.querySelectorAll('input[aria-invalid="true"]').length, 1);
    assert.deepEqual(readCustomCropPresets(), original);
  }
  await fill(app.host, 'width', '8000');
  await click(button(app.host, '锁定宽高比'));
  await fill(app.host, 'width', '9000');
  assert.equal(dimension(app.host, 'height'), '9000');
  await click(button(app.host, '确认'));
  assert.equal(app.host.querySelector('[role="alert"]')?.textContent, '图片尺寸过大，请减小宽度或高度');
  assert.deepEqual(readCustomCropPresets(), original);
  await fill(app.host, 'width', '8000');
  await click(button(app.host, '确认'));
  assert.equal(app.host.querySelector('form'), null);
  assert.deepEqual(readCustomCropPresets(), original);
});

test('locking cannot silently keep an outdated dimension when the calculated integer overflows', async () => {
  const app = await mount();
  await click(button(app.host, '添加自定义预设'));
  await fill(app.host, 'width', '1'); await fill(app.host, 'height', '9007199254740991');
  await click(button(app.host, '锁定宽高比'));
  await fill(app.host, 'width', '2');
  assert.equal(button(app.host, '确认').disabled, true);
  assert.deepEqual(readCustomCropPresets(), []);
  await fill(app.host, 'width', '1'); assert.equal(button(app.host, '确认').disabled, false);
});

test('more exposes the shared tooltip, opens only on click, toggles and dismisses outside', async () => {
  const app = await mount(); await add(app.host, '1200', '800');
  const more = button(app.host, '更多');
  assert.equal(more.dataset.tooltip, '更多');
  await act(async () => { more.dispatchEvent(new dom.window.MouseEvent('pointerover', { bubbles: true })); });
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  await click(more); assert.equal(more.getAttribute('aria-expanded'), 'true');
  assert.ok(app.host.querySelector('[role="menu"]'));
  await click(more); assert.equal(more.getAttribute('aria-expanded'), 'false');
  await click(more);
  await act(async () => { document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })); });
  assert.equal(more.getAttribute('aria-expanded'), 'false');
});

test('same-page instances share additions and remounts restore saved presets', async () => {
  const first = await mount(), second = await mount();
  await add(first.host, '640', '480');
  assert.ok(button(second.host, '640*480'));
  const third = await mount(); assert.ok(button(third.host, '640*480'));
  await action(first.host, '640*480', '删除');
  assert.equal(second.host.querySelector('.crop-custom-preset'), null);
});

test('editing or deleting the selected preset in another window updates the selection', async () => {
  const initial = customCropPreset('custom:shared', 1200, 800);
  saveCustomCropPresets([initial], 'seed');
  const app = await mount(initial);
  await externalPresets([customCropPreset(initial.id, 800, 1200)]);
  assert.equal(app.selected.outputWidth, 800); assert.equal(app.selected.ratio, 2 / 3);
  await externalPresets([]);
  assert.equal(app.selected.id, 'free');
});

test('a draft remains editable after its saved preset is deleted in another window', async () => {
  const app = await mount(); await add(app.host, '1200', '800');
  await action(app.host, '1200*800', '编辑'); await fill(app.host, 'width', '1600');
  await externalPresets([]);
  assert.ok(app.host.querySelector('form'), 'keep the unfinished form instead of leaving add and generate disabled');
  assert.equal(button(app.host, '自定义预设 (px)').getAttribute('aria-expanded'), 'true', 'external deletion must not hide a locked editing form');
  assert.equal(dimension(app.host, 'width'), '1600');
  await click(button(app.host, '确认'));
  assert.equal(app.selected.outputWidth, 1600); assert.equal(readCustomCropPresets().length, 1);
});

test('storage clear notifications remove the list and reset a selected custom preset', async () => {
  const app = await mount(); await add(app.host, '1200', '800');
  await externalPresets([], true);
  assert.equal(app.selected.id, 'free');
  assert.equal(app.host.querySelector('.crop-custom-preset'), null);
});

test('persisted data rejects invalid dimensions and duplicate IDs while rebuilding derived fields', () => {
  localStorage.setItem(CROP_PRESETS_STORAGE_KEY, JSON.stringify([
    { id: 'custom:valid', outputWidth: 1200, outputHeight: 800, ratio: 10, label: 'stale' },
    { id: 'custom:valid', outputWidth: 400, outputHeight: 400 },
    { id: 'custom:zero', outputWidth: 0, outputHeight: 800 },
    { id: 'custom:decimal', outputWidth: 1.5, outputHeight: 800 },
    { id: 'custom:string', outputWidth: '1200', outputHeight: 800 },
    { id: 'free', outputWidth: 100, outputHeight: 100 }, null,
  ]));
  assert.deepEqual(readCustomCropPresets(), [customCropPreset('custom:valid', 1200, 800)]);
  localStorage.setItem(CROP_PRESETS_STORAGE_KEY, 'broken'); assert.deepEqual(readCustomCropPresets(), []);
});
