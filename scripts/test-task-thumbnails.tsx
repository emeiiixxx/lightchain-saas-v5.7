import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, useState } from 'react';
import type { Root } from 'react-dom/client';
import type { GenerationRecord } from '../src/design-workbench/components/CanvasLeftPanel';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLDialogElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'Image', 'localStorage'] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true, innerWidth: 1200, innerHeight: 900,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
});
Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });

class MockIntersectionObserver {
  static instances = new Set<MockIntersectionObserver>();
  readonly targets = new Set<Element>();
  constructor(private callback: IntersectionObserverCallback) { MockIntersectionObserver.instances.add(this); }
  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); MockIntersectionObserver.instances.delete(this); }
  takeRecords() { return []; }
  static deliver(target: Element, isIntersecting: boolean) {
    let deliveries = 0;
    for (const observer of [...this.instances]) if (observer.targets.has(target)) {
      observer.callback([{ target, isIntersecting } as IntersectionObserverEntry], observer as unknown as IntersectionObserver);
      deliveries++;
    }
    assert.ok(deliveries > 0, 'Lazy thumbnail must be observed before visibility is delivered');
  }
}
Object.assign(globalThis, { IntersectionObserver: MockIntersectionObserver });
Object.assign(dom.window, { IntersectionObserver: MockIntersectionObserver });

// CSSOM may serialize a numeric aspect-ratio as "number / 1".
function cssAspectRatio(value: string) {
  const [width, height = 1] = value.split("/").map(Number);
  return width / height;
}

// Give the thumbnail scroller deterministic, ratio-driven layout without a
// browser. Navigation must reveal its selected row, never scroll the page.
Object.defineProperties(dom.window.HTMLElement.prototype, {
  offsetTop: { configurable: true, get() { return this.hasAttribute('data-result-index') ? Math.floor(Number(this.dataset.resultIndex) / 4) * (this.offsetHeight + 8) : 0; } },
  offsetHeight: { configurable: true, get() { return this.hasAttribute('data-result-index') ? Math.round(80 / cssAspectRatio(this.style.aspectRatio)) : 0; } },
  clientHeight: { configurable: true, get() { return this.classList.contains('task-detail-thumbnails') ? 480 : 0; } },
});
let pageScrollCalls = 0;
const focusOptions: (FocusOptions | undefined)[] = [];
dom.window.scrollTo = () => { pageScrollCalls++; };
dom.window.HTMLElement.prototype.scrollIntoView = () => { pageScrollCalls++; };
const nativeFocus = dom.window.HTMLElement.prototype.focus;
dom.window.HTMLElement.prototype.focus = function(options?: FocusOptions) { focusOptions.push(options); nativeFocus.call(this, options); };

const { createRoot } = await import('react-dom/client');
const { LocaleProvider } = await import('../src/design-workbench/LocaleContext');
const { TaskRecordResults } = await import('../src/design-workbench/components/TaskResultThumbnails');
const { TaskDetailPanel } = await import('../src/design-workbench/components/TaskDetailPanel');
const roots: Root[] = [];

afterEach(async () => {
  await act(async () => { roots.splice(0).forEach(root => root.unmount()); });
  document.body.replaceChildren(); localStorage.clear();
  assert.equal(MockIntersectionObserver.instances.size, 0, 'Unmount disconnects lazy image observers');
  assert.equal(pageScrollCalls, 0, 'Thumbnail navigation must not move the page');
  focusOptions.length = 0; pageScrollCalls = 0;
});

function record(count: number, id = `record-${count}`): GenerationRecord {
  return { id, title: '图片切分', time: '2026-11-26 21:30', tags: [], count, ratio: '2:3',
    images: Array.from({ length: count }, (_, index) => ({ id: `${id}-${index}`, url: `https://example.test/${id}/${index}.png`, height: 1000, status: 'success' })) };
}
function thumbnails(host: ParentNode) { return [...host.querySelectorAll<HTMLButtonElement>('.generation-record-result-open:not(.task-record-view-all), .task-detail-thumbnail-grid > button[data-result-index]')]; }
function requestedUrls(host: ParentNode) { return [...host.querySelectorAll<HTMLImageElement>('.progressive-image-full[src]')].map(image => image.getAttribute('src')); }
function hostRoot() { const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root); return { host, root }; }
async function click(button: HTMLButtonElement) { await act(async () => button.click()); }
async function mountRecord(value: GenerationRecord, eager = true) {
  const { host, root } = hostRoot(); const opened: number[] = [];
  await act(async () => root.render(<LocaleProvider><TaskRecordResults record={value} eager={eager} onOpen={index => opened.push(index)} getResultName={index => `${value.title}-${index + 1}`} /></LocaleProvider>));
  return { host, opened };
}
type DetailState = { record: GenerationRecord; selectedIndex: number; active: boolean };
async function mountDetail(value: GenerationRecord, selectedIndex = 0, active = true) {
  const { host, root } = hostRoot(); const selected: number[] = [];
  let update = (_state: DetailState) => {};
  function Harness() {
    const [state, setState] = useState<DetailState>({ record: value, selectedIndex, active }); update = setState;
    return <LocaleProvider><TaskDetailPanel {...state} onSelect={index => { selected.push(index); setState(current => ({ ...current, selectedIndex: index })); }}
      onLibrary={() => {}} onSave={() => {}} onCopy={() => {}} onNotify={() => {}} onRegenerate={() => {}} onDeleteImage={() => {}}
      getResultName={index => `${state.record.title}-${index + 1}`} /></LocaleProvider>;
  }
  await act(async () => root.render(<Harness />));
  const scroller = host.querySelector<HTMLElement>('.task-detail-thumbnails')!;
  return { host, selected, scroller, update: async (state: DetailState) => { await act(async () => update(state)); } };
}
async function key(button: HTMLButtonElement, key: string) {
  await act(async () => {
    const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    button.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
  });
}

test('eight style variation results remain eight accessible thumbnails with no overflow entry', async () => {
  const value = record(8); value.title = '款式裂变'; value.ratio = undefined; const snapshot = JSON.stringify(value);
  const app = await mountRecord(value);
  assert.equal(thumbnails(app.host).length, 8); assert.equal(app.host.querySelector('.task-record-view-all'), null);
  for (const tile of app.host.querySelectorAll<HTMLElement>('.generation-record-result')) assert.equal(cssAspectRatio(tile.style.aspectRatio), 9 / 16, 'Clamp the existing height-based ratio fallback to the portrait thumbnail limit');
  assert.ok(thumbnails(app.host).every(button => button.textContent === ''), 'Image tiles have no visible numbering');
  assert.deepEqual(requestedUrls(app.host), value.images.map(image => image.url));
  await click(thumbnails(app.host)[7]); assert.deepEqual(app.opened, [7]); assert.equal(JSON.stringify(value), snapshot);
});

for (const count of [9, 49, 100]) test(`${count} results request only seven previews and expose all results through slot eight`, async () => {
  const value = record(count); const snapshot = JSON.stringify(value); const app = await mountRecord(value);
  assert.equal(thumbnails(app.host).length, 7); assert.equal(app.host.querySelectorAll('button').length, 8);
  assert.deepEqual(requestedUrls(app.host), value.images.slice(0, 7).map(image => image.url));
  const all = app.host.querySelector<HTMLButtonElement>('.task-record-view-all')!;
  for (const tile of app.host.querySelectorAll<HTMLElement>('.generation-record-result')) assert.equal(cssAspectRatio(tile.style.aspectRatio), 2 / 3, 'Overflow slot uses the same original ratio as result tiles');
  assert.ok(thumbnails(app.host).every(button => button.textContent === ''), 'Image tiles have no visible numbering');
  assert.equal(all.getAttribute('aria-label'), `查看全部 ${count} 张`); await click(all);
  assert.deepEqual(app.opened, [0]); assert.equal(JSON.stringify(value), snapshot);
});

test('overflow opens the first available result even when it is beyond the seven previews', async () => {
  const value = record(9); value.images.forEach((image, index) => { image.status = index < 8 ? (index % 2 ? 'generating' : 'failed') : 'success'; });
  const app = await mountRecord(value);
  assert.equal(app.host.querySelectorAll('.generation-record-result').length, 8);
  assert.equal(app.host.querySelectorAll('.task-result-placeholder').length, 7);
  assert.equal(thumbnails(app.host).length, 0, 'Unavailable record results do not expose open buttons');
  assert.deepEqual(app.opened, []); assert.deepEqual(requestedUrls(app.host), []);
  await click(app.host.querySelector<HTMLButtonElement>('.task-record-view-all')!); assert.deepEqual(app.opened, [8]);
});

test('pending records retain bounded placeholders and cannot open unavailable results', async () => {
  const value = record(0); value.count = 100; value.pending = true; const app = await mountRecord(value);
  assert.equal(app.host.querySelectorAll('.generation-record-loading').length, 7);
  assert.equal(thumbnails(app.host).length, 0); assert.equal(app.host.querySelectorAll('button').length, 1);
  for (const button of app.host.querySelectorAll<HTMLButtonElement>('button')) { assert.equal(button.disabled, true); await click(button); }
  assert.deepEqual(app.opened, []); assert.deepEqual(requestedUrls(app.host), []);
});

test('detail keeps 100 original-ratio navigation slots and attaches only selected or observer-visible image sources', async () => {
  const value = record(100); const app = await mountDetail(value);
  assert.equal(thumbnails(app.host).length, 100); assert.deepEqual(requestedUrls(app.scroller), [value.images[0].url]);
  assert.ok(thumbnails(app.host).every(button => cssAspectRatio(button.style.aspectRatio) === 2 / 3), 'Details preserve the configured result ratio');
  assert.ok(thumbnails(app.host).every(button => button.textContent === ''), 'Details have no visible numbering');
  const visibleHost = thumbnails(app.host)[4].querySelector('.progressive-image')!;
  await act(async () => MockIntersectionObserver.deliver(visibleHost, false));
  assert.deepEqual(requestedUrls(app.scroller), [value.images[0].url]);
  await act(async () => MockIntersectionObserver.deliver(visibleHost, true));
  assert.deepEqual(requestedUrls(app.scroller), [value.images[0].url, value.images[4].url]);
  assert.equal(app.scroller.contains(app.host.querySelector('.task-detail-actions')), false);
  assert.equal(app.scroller.contains(app.host.querySelector('.generation-record-tags')), false);
});

test('End, Home and arrow keys select the corresponding slot and scroll only its thumbnail container', async () => {
  const value = record(100); const app = await mountDetail(value);
  await key(thumbnails(app.host)[0], 'End'); assert.deepEqual(app.selected, [99]);
  assert.equal(thumbnails(app.host)[99].getAttribute('aria-current'), 'true'); assert.equal(app.scroller.scrollTop, 2712);
  assert.equal(document.activeElement, thumbnails(app.host)[99]); assert.deepEqual(focusOptions.at(-1), { preventScroll: true });
  assert.deepEqual(requestedUrls(app.scroller), [value.images[0].url, value.images[99].url]);
  await key(thumbnails(app.host)[99], 'Home'); assert.equal(app.selected.at(-1), 0); assert.equal(app.scroller.scrollTop, 0);
  await key(thumbnails(app.host)[0], 'ArrowDown'); assert.equal(app.selected.at(-1), 4);
  await key(thumbnails(app.host)[4], 'ArrowRight'); assert.equal(app.selected.at(-1), 5);
  await key(thumbnails(app.host)[5], 'ArrowLeft'); assert.equal(app.selected.at(-1), 4);
  await key(thumbnails(app.host)[4], 'ArrowUp'); assert.equal(app.selected.at(-1), 0);
});

test('keyboard navigation skips failed and generating outputs and uses the last available result', async () => {
  const value = record(12); value.images[1].status = 'failed'; value.images[2].status = 'generating'; value.images[11].status = 'failed';
  const app = await mountDetail(value);
  await key(thumbnails(app.host)[0], 'ArrowRight'); assert.equal(app.selected.at(-1), 3);
  await key(thumbnails(app.host)[3], 'ArrowLeft'); assert.equal(app.selected.at(-1), 0);
  await key(thumbnails(app.host)[0], 'End'); assert.equal(app.selected.at(-1), 10);
  await key(thumbnails(app.host)[10], 'Home'); assert.equal(app.selected.at(-1), 0);
  assert.equal(requestedUrls(app.scroller).includes(value.images[1].url), false);
  assert.equal(requestedUrls(app.scroller).includes(value.images[2].url), false);
});

test('parent-driven removal and record change preserve the selected source and reset local scroll position', async () => {
  const value = record(100); const app = await mountDetail(value, 98);
  const remaining = { ...value, count: 99, images: value.images.filter((_, index) => index !== 98) };
  await app.update({ record: remaining, selectedIndex: 98, active: true });
  assert.equal(thumbnails(app.host).length, 99);
  const current = app.scroller.querySelector<HTMLButtonElement>('[aria-current="true"]')!;
  assert.equal(current.dataset.resultIndex, '98'); assert.equal(current.querySelector('img')?.getAttribute('src'), value.images[99].url);
  assert.equal(current.textContent, ''); assert.equal(cssAspectRatio(current.style.aspectRatio), 2 / 3); assert.equal(app.scroller.scrollTop, 2712);
  const next = record(2, 'different-task'); await app.update({ record: next, selectedIndex: 0, active: true });
  assert.equal(thumbnails(app.host).length, 2); assert.equal(app.scroller.scrollTop, 0);
  assert.deepEqual(requestedUrls(app.scroller), [next.images[0].url]); assert.equal(thumbnails(app.host)[0].getAttribute('aria-current'), 'true');
});

test('inactive details defer their selected image until active and then reveal its unnumbered slot', async () => {
  const value = record(49); const app = await mountDetail(value, 48, false);
  assert.deepEqual(requestedUrls(app.scroller), []); assert.equal(app.scroller.scrollTop, 0);
  await app.update({ record: value, selectedIndex: 48, active: true });
  assert.deepEqual(requestedUrls(app.scroller), [value.images[48].url]); assert.equal(app.scroller.scrollTop, 1176);
  assert.equal(thumbnails(app.host)[48].textContent, ''); assert.equal(thumbnails(app.host)[48].getAttribute('aria-current'), 'true');
});
