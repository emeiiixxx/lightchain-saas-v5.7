import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowCanvas } from '../src/components/ReactFlowCanvas';
import { ImageConnection } from '../src/components/ImageConnection';
import { useEventHandlers } from '../src/useEventHandlers';
import { decodeCanvasImages } from '../src/design-workbench/decode-canvas-images';
import { assetDisplayUrl } from '../src/asset-display-url';
import type { Viewport } from '../src/canvas';
import { bundledImage, imageDisplayPreview } from '../src/bundled-assets';
import { iconAssetUrl } from '../src/inline-icons';
import { ProgressiveImage } from '../src/components/ProgressiveImage';
import { prepareMainImage } from '../src/asset-library';
import { readFileSync, statSync } from 'node:fs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLDivElement', 'Element', 'Node', 'Image', 'MouseEvent'] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  ResizeObserver: class {
    observe() {} unobserve() {} disconnect() {}
  },
});
Object.defineProperty(dom.window, 'DOMMatrixReadOnly', { value: class { m22 = 1; } });
Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
for (const [prop, size] of [['offsetWidth', 800], ['offsetHeight', 600], ['clientWidth', 800], ['clientHeight', 600]] as const) {
  Object.defineProperty(dom.window.HTMLElement.prototype, prop, { get() {
    const value = prop.endsWith('Width') ? this.style.width : this.style.height;
    return value?.endsWith('px') ? parseFloat(value) : size;
  } });
}
Object.defineProperty(dom.window.HTMLElement.prototype, 'getBoundingClientRect', { value() {
  return { x: 0, y: 0, left: 0, top: 0, right: this.offsetWidth, bottom: this.offsetHeight, width: this.offsetWidth, height: this.offsetHeight, toJSON() {} };
} });

test('display previews share duplicate images and preserve original dimensions and external URLs', () => {
  const source = '/assets/upload/imgAsset10.png';
  const alias = '/assets/design-workbench/upload/imgAsset10.png';
  assert.equal(imageDisplayPreview(source), imageDisplayPreview(alias));
  assert.ok(imageDisplayPreview(source).endsWith('-960.webp'));
  assert.ok(imageDisplayPreview(source, 320).endsWith('-320.webp'));
  const pages = 'https://example.com/lightchain-saas-v5.7/';
  assert.ok(imageDisplayPreview(source, 320, pages, '/lightchain-saas-v5.7/').startsWith(pages + 'assets/display-previews/'));
  assert.deepEqual(bundledImage(source), bundledImage(alias));
  for (const url of ['https://other.example' + source, 'blob:http://localhost/id', 'data:image/png;base64,AAAA', '/unknown.png']) {
    assert.equal(imageDisplayPreview(url), url);
    assert.equal(bundledImage(url), undefined);
  }
});

test('inline icons preserve the exact SVG artwork without separate icon downloads', () => {
  const src = '/assets/canvas/hand.svg';
  const inline = iconAssetUrl(src);
  assert.equal(decodeURIComponent(inline.split(',')[1]), readFileSync('public' + src, 'utf8').trim());
  assert.equal(iconAssetUrl('/lightchain-saas-v5.7' + src, 'https://example.com/lightchain-saas-v5.7/', '/lightchain-saas-v5.7/'), inline);
  assert.equal(iconAssetUrl('https://remote.example' + src), 'https://remote.example' + src);
});

test('every generated display file exists and the eight seeded covers use less than 1 MB', () => {
  const manifest = JSON.parse(readFileSync('src/asset-display-images.json', 'utf8'));
  let coverBytes = 0;
  for (const [src, image] of Object.entries(manifest) as [string, { width: number; height: number; '320': string; '960': string }][]) {
    assert.ok(statSync('public/' + src).size > 0);
    assert.ok(image.width > 0 && image.height > 0);
    for (const size of ['320', '960'] as const) assert.ok(statSync('public/' + image[size]).size > 0);
    if (src.startsWith('assets/prompt-role-covers-v57/')) coverBytes += statSync('public/' + image['960']).size;
  }
  assert.ok(coverBytes > 0 && coverBytes < 1_000_000);
});

test('thumbnail load reports source pixels, while original mode and failed previews use the original URL', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const src = '/assets/upload/imgAsset10.png';
  let loaded: number[] = [];
  try {
    await act(async () => root.render(<ProgressiveImage src={src} alt="example" eager width={48} onLoad={(w, h) => { loaded = [w, h]; }} />));
    const image = host.querySelector<HTMLImageElement>('.progressive-image-full')!;
    Object.defineProperties(image, { naturalWidth: { value: 320 }, naturalHeight: { value: 320 }, decode: { value: async () => {} } });
    await act(async () => image.dispatchEvent(new dom.window.Event('load')));
    const source = bundledImage(src)!;
    assert.deepEqual(loaded, [source.width, source.height]);
    await act(async () => image.dispatchEvent(new dom.window.Event('error')));
    assert.equal(image.getAttribute('src'), assetDisplayUrl(src));
    await act(async () => root.render(<ProgressiveImage src={src} alt="example" eager original />));
    assert.equal(image.getAttribute('src'), assetDisplayUrl(src));
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test('bundled canvas images use source dimensions without downloading a full image for metadata', async () => {
  const originalImage = globalThis.Image;
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: class { constructor() { throw new Error('Unexpected original image request'); } } });
  try {
    const src = '/assets/upload/imgAsset10.png';
    const image = await prepareMainImage({ id: 'example', name: 'example', url: src });
    assert.equal(image.url, src);
    assert.equal(image.naturalWidth, bundledImage(src)!.width);
    assert.equal(image.naturalHeight, bundledImage(src)!.height);
  } finally { Object.defineProperty(globalThis, 'Image', { configurable: true, value: originalImage }); }
});

test('image aliases share requests on localhost and Pages without rewriting external URLs', () => {
  const alias = '/assets/design-workbench/upload/imgAsset10.png';
  assert.equal(assetDisplayUrl(alias), 'http://localhost/assets/upload/imgAsset10.png');
  assert.equal(assetDisplayUrl('/lightchain-saas-v5.7' + alias + '?v=1', 'https://example.com/lightchain-saas-v5.7/', '/lightchain-saas-v5.7/'),
    'https://example.com/lightchain-saas-v5.7/assets/upload/imgAsset10.png?v=1');
  for (const url of ['https://other.example/assets/design-workbench/upload/imgAsset10.png', 'blob:http://localhost/id', 'data:image/png;base64,AAAA', '/custom.png']) {
    assert.equal(assetDisplayUrl(url), url);
  }
});

test('restoring 200 objects decodes each source once, limits concurrency and keeps metadata/order', async () => {
  const originalImage = globalThis.Image;
  let active = 0, peak = 0, calls = 0;
  class FakeImage {
    src = ''; decoding = '';
    async decode() { calls++; active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 1)); active--; }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: FakeImage });
  try {
    const items = Array.from({ length: 200 }, (_, index) => ({ id: String(index), url: `/image-${index % 20}.png`, x: index * 100, name: `素材${index}` }));
    const loaded = await decodeCanvasImages(items);
    assert.equal(calls, 20); assert.equal(peak, 4);
    assert.deepEqual(loaded.map(({ image, ...item }) => item), items);
    assert.equal(loaded[0].image, loaded[20].image);
    const aliases = await decodeCanvasImages([{ url: '/assets/upload/imgAsset10.png' }, { url: '/assets/design-workbench/upload/imgAsset10.png' }]);
    assert.equal(aliases[0].image, aliases[1].image);
    const controller = new AbortController();
    const before = calls;
    const cancelled = decodeCanvasImages(items, controller.signal);
    controller.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    assert.ok(calls - before <= 4, 'cancelled restore must not start queued decodes');
  } finally { Object.defineProperty(globalThis, 'Image', { configurable: true, value: originalImage }); }
});

test('200-node Flow keeps pan renders bounded, culls offscreen content and restores selection/handlers', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const renders = new Map<string, number>();
  const media = Array.from({ length: 200 }, (_, index) => ({ id: `n${index}`, x: index * 1000, y: 40, width: 120, height: 160, name: `image-${index}`, url: '/test.png' }));
  let setView!: (view: Viewport) => void, setMessage!: (message: string) => void;
  let received = '';
  let moved: { x: number; y: number } | undefined;
  const noop = () => {};
  function Probe({ id, onAction }: { id: string; onAction: () => void }) {
    renders.set(id, (renders.get(id) ?? 0) + 1);
    return <button className="nodrag" data-probe={id} onClick={onAction}>Action</button>;
  }
  function Scene() {
    const [nodes, setNodes] = useState(media);
    const [view, updateView] = useState({ x: 0, y: 0, zoom: 1 }); setView = updateView;
    const [message, updateMessage] = useState('first'); setMessage = updateMessage;
    const [selected, select] = useState<string[]>([]);
    const actions = useEventHandlers({ action: () => { received = message; } });
    const content = useMemo(() => <>
      {nodes.map(item => <div key={item.id} data-canvas-id={item.id} style={{ left: item.x, top: item.y, width: item.width, height: item.height }}>
        <Probe id={item.id} onAction={actions.action} />
      </div>)}
      <ImageConnection image={nodes[0]} target={nodes[1]} active={false} zoom={view.zoom} />
    </>, [nodes, actions, view.zoom]);
    return <ReactFlowCanvas view={view} selectedIds={selected} hand={false} referenceMode={false} snap={false}
      onView={updateView} onSelection={select} onPositions={positions => {
        moved = positions.get('n100');
        setNodes(previous => previous.map(node => positions.has(node.id) ? { ...node, ...positions.get(node.id) } : node));
      }} onSelecting={noop} onDragStart={noop} onDragEnd={noop} onGuides={noop}>{content}</ReactFlowCanvas>;
  }
  try {
    await act(async () => { root.render(<Scene />); });
    assert.ok(host.querySelector('[data-probe="n0"]'));
    assert.ok(host.querySelectorAll('[data-probe]').length < 10, 'offscreen content is not mounted');
    assert.ok(host.querySelector('.react-flow__edge'), 'connection to an offscreen target still renders');
    const count = renders.get('n0');
    for (let frame = 0; frame < 20; frame++) await act(async () => { setView({ x: -frame, y: 0, zoom: 1 }); });
    assert.equal(renders.get('n0'), count, 'pure pan must not rerender node contents');
    await act(async () => { setMessage('latest'); });
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-probe="n0"]')!.click(); });
    assert.equal(received, 'latest', 'memoized content must use latest committed event state');
    await act(async () => { setView({ x: -100000, y: 0, zoom: 1 }); });
    assert.ok(host.querySelector('[data-probe="n100"]'));
    assert.equal(host.querySelector('[data-probe="n0"]'), null);
    const returnedNode = host.querySelector<HTMLElement>('.react-flow__node[data-id="n100"]')!;
    // With the 3px drag threshold, a stationary press selects on click.
    // JSDOM does not synthesize click from mousedown/mouseup like a browser.
    await act(async () => { returnedNode.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, view: dom.window, clientX: 40, clientY: 60, buttons: 1 })); });
    await act(async () => { dom.window.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, view: dom.window, clientX: 40, clientY: 60 })); });
    await act(async () => { returnedNode.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, view: dom.window, clientX: 40, clientY: 60 })); });
    assert.ok(host.querySelector('.react-flow__node[data-id="n100"].selected'), 'returning visible nodes remain selectable');
    await act(async () => { setView({ x: 0, y: 0, zoom: 1 }); });
    await act(async () => { setView({ x: -100000, y: 0, zoom: 1 }); });
    assert.ok(host.querySelector('.react-flow__node[data-id="n100"].selected'), 'selection survives leaving and returning to the viewport');
    await act(async () => { host.querySelector('.react-flow__node[data-id="n100"]')!.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, view: dom.window, clientX: 40, clientY: 60, buttons: 1 })); });
    // Cross the drag threshold first, then move 50px/30px from the drag origin.
    await act(async () => { dom.window.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true, view: dom.window, clientX: 44, clientY: 60, buttons: 1 })); });
    await act(async () => { dom.window.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true, view: dom.window, clientX: 94, clientY: 90, buttons: 1 })); });
    await act(async () => { dom.window.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, view: dom.window, clientX: 94, clientY: 90 })); });
    assert.deepEqual(moved, { x: 100050, y: 70 }, 'remounted nodes still emit correct world-space drag positions');
    console.log(`200-node structural check: ${host.querySelectorAll('[data-probe]').length} mounted at this viewport; 20 pans caused 0 extra n0 content renders.`);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
