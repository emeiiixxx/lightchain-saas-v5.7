import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CropEditor, type CropEditorResult } from '../src/components/CropEditor';
import { customCropPreset, CROP_PRESETS_STORAGE_KEY } from '../src/crop-presets';

// Real React components and DOM events; native capture/layout/PNG encoding are
// simulated here. This suite does not substitute for browser hit testing.
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLImageElement', 'HTMLCanvasElement', 'Element', 'Node', 'CustomEvent', 'StorageEvent', 'localStorage'] as const) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
}
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  innerWidth: 1600, innerHeight: 1000,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  ResizeObserver: class { constructor(private callback: (entries: unknown[]) => void) {} observe() { this.callback([{ contentRect: { width: 1600, height: 1000 } }]); } disconnect() {} },
  Image: class {
    naturalWidth = 1200; naturalHeight = 1800; crossOrigin = '';
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    set src(value: string) { queueMicrotask(() => value === 'broken' ? this.onerror?.() : this.onload?.()); }
  },
});
Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
Object.assign(dom.window.HTMLDialogElement.prototype, {
  showModal() { this.setAttribute('open', ''); }, close() { this.removeAttribute('open'); },
});
const capture = new Map<number, HTMLElement>();
Object.assign(dom.window.HTMLElement.prototype, {
  setPointerCapture(id: number) { capture.set(id, this); },
  hasPointerCapture(id: number) { return capture.get(id) === this; },
  releasePointerCapture(id: number) { capture.delete(id); },
  showPopover() { this.setAttribute('data-open', 'true'); }, hidePopover() { this.removeAttribute('data-open'); },
});
let encode: (callback: BlobCallback) => void = callback => callback(new Blob(['crop'], { type: 'image/png' }));
const draws: unknown[][] = [];
Object.assign(dom.window.HTMLCanvasElement.prototype, {
  getContext() { return { drawImage(...args: unknown[]) { draws.push(args); } }; },
  toBlob(callback: BlobCallback) { encode(callback); },
});
const style = document.head.appendChild(document.createElement('style'));
style.textContent = `.workbench { pointer-events: none; } ${readFileSync('src/crop-editor.css', 'utf8')}`;
const source = { id: 'original', name: 'original.png', url: 'http://localhost/original.png' };
const rect = (element: HTMLElement) => Object.fromEntries(['left', 'top', 'width', 'height'].map(key => [key, parseFloat(element.style[key as 'left'])]));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

async function withEditor(run: (h: {
  stage: HTMLElement; selection: HTMLElement; host: HTMLElement;
  button: (label: string) => HTMLButtonElement; handle: (side: string) => HTMLButtonElement;
  pointer: (target: HTMLElement, type: string, x: number, y: number, id?: number) => Promise<void>;
  key: (target: HTMLElement, key: string, extra?: KeyboardEventInit) => Promise<void>;
  results: CropEditorResult[]; closed: () => number;
}) => Promise<void>, options: { preset?: boolean; onApply?: (value: CropEditorResult, signal: AbortSignal) => Promise<void> } = {}) {
  localStorage.clear(); capture.clear(); draws.length = 0;
  encode = callback => callback(new Blob(['crop'], { type: 'image/png' }));
  if (options.preset) localStorage.setItem(CROP_PRESETS_STORAGE_KEY, JSON.stringify([customCropPreset('custom:test', 800, 1000)]));
  const host = document.body.appendChild(document.createElement('div')); host.className = 'workbench';
  const root = createRoot(host), results: CropEditorResult[] = []; let closed = 0;
  try {
    await act(async () => root.render(<CropEditor source={source} locale="zh-CN" phase="enter" onClose={() => { closed++; }} onApply={async (value, signal) => { results.push(value); await options.onApply?.(value, signal); }} />));
    const stage = host.querySelector<HTMLElement>('.crop-editor-stage')!, selection = host.querySelector<HTMLElement>('.crop-editor-selection')!;
    assert.ok(selection, 'source image loads');
    const button = (label: string) => {
      const value = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(item => item.getAttribute('aria-label') === label || item.textContent === label);
      assert.ok(value, `button ${label}`); return value;
    };
    await run({ stage, selection, host, results, closed: () => closed, button,
      handle: side => host.querySelector<HTMLButtonElement>(`.crop-editor-handle--${side}`)!,
      pointer: async (target, type, x, y, id = 1) => {
        const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y });
        Object.defineProperty(event, 'pointerId', { value: id });
        Object.defineProperty(event, 'pointerType', { value: 'mouse' });
        await act(async () => { (capture.get(id) ?? target).dispatchEvent(event); });
      },
      key: async (target, key, extra = {}) => { await act(async () => target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }))); },
    });
  } finally { await act(async () => root.unmount()); host.remove(); }
}

test('editor restores pointer hit testing inside the workbench overlay', async () => {
  await withEditor(async h => { assert.equal(getComputedStyle(h.host).pointerEvents, 'none'); assert.equal(getComputedStyle(h.selection).pointerEvents, 'auto'); });
});

for (const [side, dx, dy] of [['nw', 40, 40], ['n', 0, 40], ['ne', -40, 40], ['e', -40, 0], ['se', -40, -40], ['s', 0, -40], ['sw', 40, -40], ['w', 40, 0]] as const) {
  test(`free crop ${side} handle shrinks and captures movement outside the handle`, async () => {
    await withEditor(async h => {
      const before = rect(h.selection);
      await h.pointer(h.handle(side), 'pointerdown', 800, 500);
      await h.pointer(h.stage, 'pointermove', 800 + dx, 500 + dy);
      await h.pointer(h.stage, 'pointerup', 800 + dx, 500 + dy);
      const after = rect(h.selection);
      near(after.width, before.width - Math.abs(dx)); near(after.height, before.height - Math.abs(dy));
      assert.equal(h.stage.hasAttribute('data-dragging'), false); assert.equal(h.button('开始 AI 生成').disabled, false);
    });
  });
}

test('a fast resize applies the release position even without a pointermove', async () => {
  await withEditor(async h => {
    const before = rect(h.selection);
    await h.pointer(h.handle('se'), 'pointerdown', 900, 700);
    await h.pointer(h.stage, 'pointerup', 840, 650);
    const after = rect(h.selection);
    near(after.width, before.width - 60); near(after.height, before.height - 50);
    await h.key(h.selection, 'z', { ctrlKey: true }); assert.deepEqual(rect(h.selection), before);
    await h.key(h.selection, 'z', { ctrlKey: true, shiftKey: true }); assert.deepEqual(rect(h.selection), after);
  });
});

test('losing capture keeps the last visible crop and records the gesture once', async () => {
  await withEditor(async h => {
    const before = rect(h.selection);
    await h.pointer(h.handle('se'), 'pointerdown', 900, 700);
    await h.pointer(h.stage, 'pointermove', 840, 650);
    const resized = rect(h.selection);
    await h.pointer(h.stage, 'lostpointercapture', 0, 0);
    assert.deepEqual(rect(h.selection), resized);
    assert.equal(h.stage.hasAttribute('data-dragging'), false);
    assert.equal(h.button('开始 AI 生成').disabled, false);
    await h.pointer(h.stage, 'pointerup', 840, 650);
    await h.key(h.selection, 'z', { ctrlKey: true }); assert.deepEqual(rect(h.selection), before);
    await h.key(h.selection, 'z', { ctrlKey: true, shiftKey: true }); assert.deepEqual(rect(h.selection), resized);
  });
});

test('release outside the stage finalizes the crop at the release position', async () => {
  await withEditor(async h => {
    const before = rect(h.selection);
    await h.pointer(h.handle('se'), 'pointerdown', 900, 700);
    await h.pointer(h.stage, 'pointermove', 880, 680);
    // The capture stub only removes routing; the release then targets the host.
    h.stage.releasePointerCapture(1);
    await h.pointer(h.host, 'pointerup', 840, 650);
    near(rect(h.selection).width, before.width - 60);
    near(rect(h.selection).height, before.height - 50);
    assert.equal(h.stage.hasAttribute('data-dragging'), false);
    assert.equal(h.button('开始 AI 生成').disabled, false);
  });
});

test('move clamps within the source; cancel restores and undo/redo restores completed gestures', async () => {
  await withEditor(async h => {
    await h.pointer(h.handle('se'), 'pointerdown', 900, 700); await h.pointer(h.stage, 'pointermove', 820, 620); await h.pointer(h.stage, 'pointerup', 820, 620);
    const resized = rect(h.selection);
    await h.pointer(h.selection, 'pointerdown', 600, 400); await h.pointer(h.stage, 'pointermove', 2000, 1800); await h.pointer(h.stage, 'pointerup', 2000, 1800);
    near(rect(h.selection).left, 80); near(rect(h.selection).top, 80);
    const moved = rect(h.selection);
    await h.pointer(h.selection, 'pointerdown', 600, 400); await h.pointer(h.stage, 'pointermove', 580, 380); await h.pointer(h.stage, 'pointercancel', 580, 380);
    assert.deepEqual(rect(h.selection), moved);
    await h.key(h.selection, 'z', { ctrlKey: true }); assert.deepEqual(rect(h.selection), resized);
    await h.key(h.selection, 'z', { ctrlKey: true, shiftKey: true }); assert.deepEqual(rect(h.selection), moved);
  });
});

test('pointer interaction gives the crop keyboard focus after selecting a preset', async () => {
  await withEditor(async h => {
    await act(async () => { h.button('1:1').focus(); h.button('1:1').click(); });
    await h.pointer(h.selection, 'pointerdown', 800, 500); await h.pointer(h.stage, 'pointerup', 800, 500);
    assert.ok(document.activeElement === h.selection, 'arrows and Space must operate on the crop after clicking it');
    const before = rect(h.selection); await h.key(document.activeElement as HTMLElement, 'ArrowDown'); near(rect(h.selection).top, before.top + .4);
  });
});

test('a second pointer cannot replace an active drag', async () => {
  await withEditor(async h => {
    await h.pointer(h.handle('se'), 'pointerdown', 900, 700, 1);
    await h.pointer(h.selection, 'pointerdown', 500, 300, 2);
    await h.pointer(h.stage, 'pointermove', 860, 660, 1);
    await h.pointer(h.stage, 'pointerup', 860, 660, 1);
    near(rect(h.selection).width, 440); assert.equal(h.stage.hasAttribute('data-dragging'), false);
  });
});

test('Space after using a handle pans the view without changing crop pixels', async () => {
  await withEditor(async h => {
    await h.pointer(h.handle('se'), 'pointerdown', 900, 700); await h.pointer(h.stage, 'pointermove', 860, 660); await h.pointer(h.stage, 'pointerup', 860, 660);
    const crop = rect(h.selection), image = h.host.querySelector<HTMLElement>('.crop-editor-image')!, view = rect(image);
    await h.key(document.activeElement as HTMLElement, ' ', { code: 'Space' });
    await h.pointer(h.selection, 'pointerdown', 700, 400); await h.pointer(h.stage, 'pointermove', 730, 420); await h.pointer(h.stage, 'pointerup', 730, 420);
    assert.deepEqual(rect(h.selection), crop); near(rect(image).left, view.left + 30); near(rect(image).top, view.top + 20);
    await act(async () => document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true })));
    assert.equal(h.stage.hasAttribute('data-panning'), false);
  });
});

test('fit shortcut cannot change the coordinate system during a drag', async () => {
  await withEditor(async h => {
    const image = h.host.querySelector<HTMLElement>('.crop-editor-image')!, before = rect(image);
    await h.pointer(h.handle('se'), 'pointerdown', 900, 700);
    await h.key(h.selection, '0'); assert.deepEqual(rect(image), before);
    await h.pointer(h.stage, 'pointermove', 860, 660); await h.pointer(h.stage, 'pointerup', 860, 660);
    near(rect(h.selection).width, 440);
  });
});

test('custom crop maintains ratio and submits the specified pixel size once', async () => {
  await withEditor(async h => {
    await act(async () => h.button('800*1000').click());
    await h.pointer(h.handle('se'), 'pointerdown', 900, 700); await h.pointer(h.stage, 'pointermove', 830, 640); await h.pointer(h.stage, 'pointerup', 830, 640);
    near(rect(h.selection).width / rect(h.selection).height, .8);
    let finish!: BlobCallback; encode = callback => { finish = callback; };
    await act(async () => { h.button('开始 AI 生成').click(); h.button('开始 AI 生成').click(); });
    assert.equal(draws.length, 1); assert.equal(h.results.length, 0);
    await act(async () => finish(new Blob(['png'], { type: 'image/png' })));
    assert.equal(h.results.length, 1); assert.equal(h.results[0].width, 800); assert.equal(h.results[0].height, 1000); assert.equal(h.closed(), 1);
  }, { preset: true });
});

test('closing during encoding prevents a stale image from being submitted', async () => {
  await withEditor(async h => {
    let finish!: BlobCallback; encode = callback => { finish = callback; };
    await act(async () => h.button('开始 AI 生成').click());
    await act(async () => h.button('关闭裁剪').click());
    await act(async () => finish(new Blob(['png'], { type: 'image/png' })));
    assert.equal(h.results.length, 0); assert.equal(h.closed(), 1);
  });
});

test('failed export leaves editing available and can be retried', async () => {
  await withEditor(async h => {
    encode = callback => callback(null);
    await act(async () => h.button('开始 AI 生成').click());
    assert.match(h.host.querySelector('[role="alert"]')!.textContent!, /裁剪失败/); assert.equal(h.closed(), 0);
    assert.equal(h.button('开始 AI 生成').disabled, false);
    encode = callback => callback(new Blob(['png'], { type: 'image/png' }));
    await act(async () => h.button('开始 AI 生成').click());
    assert.equal(h.results.length, 1); assert.equal(h.closed(), 1);
  });
});
