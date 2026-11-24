import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  fitCropRatio, fullCrop, ImageCropError, MAX_CROP_OUTPUT_EDGE, MAX_CROP_OUTPUT_PIXELS,
  moveCrop, renderCrop, resizeCrop, type CropBounds, type CropHandle, type CropRect,
} from '../src/image-crop.ts';

const handles: CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const ratios = [1, 3 / 4, 2 / 3, 9 / 16, 4 / 3, 3 / 2, 16 / 9, 4 / 5, 21 / 9];
const near = (actual: number, expected: number, message = '') => assert(Math.abs(actual - expected) <= 1e-7, `${message}: ${actual} != ${expected}`);
function inside(rect: CropRect, bounds: CropBounds, ratio?: number) {
  for (const value of Object.values(rect)) assert(Number.isFinite(value));
  assert(rect.width >= 1 - 1e-7 && rect.height >= 1 - 1e-7, 'at least one source pixel per axis');
  assert(rect.x >= -1e-7 && rect.y >= -1e-7, 'top/left stay within source');
  assert(rect.x + rect.width <= bounds.width + 1e-7 && rect.y + rect.height <= bounds.height + 1e-7, 'bottom/right stay within source');
  if (ratio !== undefined) near(rect.width / rect.height, ratio, 'aspect ratio');
}
function fixedAnchor(before: CropRect, after: CropRect, handle: CropHandle) {
  const horizontal = handle.includes('w') || handle.includes('e'), vertical = handle.includes('n') || handle.includes('s');
  near(handle.includes('w') ? after.x + after.width : horizontal ? after.x : after.x + after.width / 2,
    handle.includes('w') ? before.x + before.width : horizontal ? before.x : before.x + before.width / 2, 'fixed anchor x');
  near(handle.includes('n') ? after.y + after.height : vertical ? after.y : after.y + after.height / 2,
    handle.includes('n') ? before.y + before.height : vertical ? before.y : before.y + before.height / 2, 'fixed anchor y');
}
const inward = (handle: CropHandle, pixels = 100) => ({
  dx: handle.includes('w') ? pixels : handle.includes('e') ? -pixels : 0,
  dy: handle.includes('n') ? pixels : handle.includes('s') ? -pixels : 0,
});

test('full-image crop cannot translate until a handle makes room', () => {
  const bounds = { width: 1200, height: 1800 }, full = fullCrop(bounds);
  assert.deepEqual(moveCrop(full, 300, -200, bounds), full);
  const smaller = resizeCrop(full, 'se', -300, -500, bounds, null);
  assert.deepEqual(smaller, { x: 0, y: 0, width: 900, height: 1300 });
  assert.deepEqual(moveCrop(smaller, 200, 250, bounds), { x: 200, y: 250, width: 900, height: 1300 });
});

for (const handle of handles) test(`free ${handle} handle shrinks, retains opposite edges, and clamps crossings`, () => {
  const bounds = { width: 1200, height: 1800 }, full = fullCrop(bounds), delta = inward(handle);
  const result = resizeCrop(full, handle, delta.dx, delta.dy, bounds, null);
  inside(result, bounds);
  assert(result.width < full.width || result.height < full.height);
  if (handle.includes('w')) near(result.x + result.width, full.width);
  if (handle.includes('e')) near(result.x, 0);
  if (handle.includes('n')) near(result.y + result.height, full.height);
  if (handle.includes('s')) near(result.y, 0);
  const crossed = inward(handle, 1_000_000);
  const minimal = resizeCrop(full, handle, crossed.dx, crossed.dy, bounds, null);
  inside(minimal, bounds);
  if (handle.includes('w') || handle.includes('e')) near(minimal.width, 1);
  if (handle.includes('n') || handle.includes('s')) near(minimal.height, 1);
  const expanded = resizeCrop(result, handle, -crossed.dx, -crossed.dy, bounds, null);
  inside(expanded, bounds);
  assert.deepEqual(expanded, full);
});

for (const handle of handles) test(`locked ${handle} handle preserves preset ratio and anchor at all source boundaries`, () => {
  const bounds = { width: 1201, height: 1801 };
  for (const ratio of ratios) {
    const initial = fitCropRatio(bounds, ratio), delta = inward(handle);
    const smaller = resizeCrop(initial, handle, delta.dx, delta.dy, bounds, ratio);
    inside(smaller, bounds, ratio); fixedAnchor(initial, smaller, handle);
    assert(smaller.width < initial.width && smaller.height < initial.height);
    for (const [dx, dy] of [[-10000, -10000], [-10000, 10000], [10000, -10000], [10000, 10000]]) {
      const result = resizeCrop(smaller, handle, dx, dy, bounds, ratio);
      inside(result, bounds, ratio); fixedAnchor(smaller, result, handle);
    }
  }
});

test('minimum-size locked crops remain resizable after moving to every corner', () => {
  for (const bounds of [{ width: 1201, height: 1801 }, { width: 4033, height: 3023 }, { width: 511, height: 509 }]) {
    for (const ratio of ratios) {
      const initial = fitCropRatio(bounds, ratio);
      const minimal = resizeCrop(initial, 'se', -100000, -100000, bounds, ratio);
      for (const [dx, dy] of [[-10000, -10000], [-10000, 10000], [10000, -10000], [10000, 10000]]) {
        const corner = moveCrop(minimal, dx, dy, bounds);
        for (const handle of handles) {
          let result!: CropRect;
          assert.doesNotThrow(() => { result = resizeCrop(corner, handle, 0, 0, bounds, ratio); }, JSON.stringify({ bounds, ratio, corner, handle }));
          inside(result, bounds, ratio);
          fixedAnchor(corner, result, handle);
          const outward = inward(handle, -20);
          const expanded = resizeCrop(corner, handle, outward.dx, outward.dy, bounds, ratio);
          inside(expanded, bounds, ratio); fixedAnchor(corner, expanded, handle);
        }
      }
    }
  }
});

test('changing ratio respects source bounds and free mode retains current region', () => {
  const bounds = { width: 1200, height: 1800 };
  const current = { x: 700, y: 1100, width: 400, height: 600 };
  assert.deepEqual(fitCropRatio(bounds, null, current), current);
  const changed = fitCropRatio(bounds, 21 / 9, current);
  inside(changed, bounds, 21 / 9);
  near(changed.x + changed.width / 2, current.x + current.width / 2);
  near(changed.y + changed.height / 2, current.y + current.height / 2);
  const largest = fitCropRatio(bounds, 1);
  assert.deepEqual(largest, { x: 0, y: 300, width: 1200, height: 1200 });
});

test('screen deltas converted at different zooms reach the same source-pixel region', () => {
  const bounds = { width: 1200, height: 1800 }, initial = fullCrop(bounds);
  const expected = resizeCrop(initial, 'se', -120, -240, bounds, null);
  for (const zoom of [.01, .1, .4, 1, 2, 4]) {
    const result = resizeCrop(initial, 'se', (-120 * zoom) / zoom, (-240 * zoom) / zoom, bounds, null);
    assert.deepEqual(result, expected);
  }
});

test('invalid input is rejected without introducing invalid geometry', () => {
  const bounds = { width: 10, height: 10 }, initial = fullCrop(bounds);
  for (const width of [0, -1, NaN, Infinity]) assert.throws(() => fullCrop({ width, height: 10 }), ImageCropError);
  assert.throws(() => moveCrop(initial, NaN, 0, bounds), ImageCropError);
  assert.throws(() => resizeCrop(initial, 'se', 0, Infinity, bounds, null), ImageCropError);
  for (const ratio of [0, -1, NaN, Infinity, 11, 1 / 11]) assert.throws(() => fitCropRatio(bounds, ratio), ImageCropError);
  assert.throws(() => moveCrop({ ...initial, width: 0 }, 0, 0, bounds), ImageCropError);
});

function mockCanvas(t: TestContext, failure?: 'context' | 'draw' | 'blob' | 'taint') {
  const drawCalls: unknown[][] = [], allocations: { width: number; height: number }[] = [];
  const context = { imageSmoothingEnabled: false, imageSmoothingQuality: '', drawImage: (...args: unknown[]) => {
    if (failure === 'draw') throw new Error('decode failed');
    drawCalls.push(args);
  } };
  const canvas = { width: 0, height: 0,
    getContext: () => failure === 'context' ? null : context,
    toBlob: (callback: (blob: Blob | null) => void, mime: string) => {
      allocations.push({ width: canvas.width, height: canvas.height });
      if (failure === 'taint') throw new Error('SecurityError');
      callback(failure === 'blob' ? null : new Blob(['png-data'], { type: mime }));
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: (tag: string) => {
    assert.equal(tag, 'canvas'); return canvas;
  } } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); });
  return { canvas, drawCalls, allocations };
}

test('export uses rounded source boundaries and releases its canvas buffer', async t => {
  const { canvas, drawCalls, allocations } = mockCanvas(t);
  const image = { naturalWidth: 1000, naturalHeight: 800 } as HTMLImageElement;
  const result = await renderCrop(image, { x: 10.4, y: 20.6, width: 300.4, height: 200.8 });
  assert.deepEqual({ width: result.width, height: result.height }, { width: 301, height: 200 });
  assert.deepEqual(drawCalls[0], [image, 10, 21, 301, 200, 0, 0, 301, 200]);
  assert.deepEqual(allocations, [{ width: 301, height: 200 }]);
  assert.equal(result.blob.type, 'image/png');
  assert.equal(canvas.width, 0); assert.equal(canvas.height, 0);
});

test('custom export keeps exact requested pixel dimensions', async t => {
  const { drawCalls } = mockCanvas(t);
  const image = { naturalWidth: 1200, naturalHeight: 1800 } as HTMLImageElement;
  const result = await renderCrop(image, { x: 100, y: 150, width: 1000, height: 1500 }, { width: 800, height: 1200 });
  assert.equal(result.width, 800); assert.equal(result.height, 1200);
  assert.deepEqual(drawCalls[0], [image, 100, 150, 1000, 1500, 0, 0, 800, 1200]);
});

test('oversized output and invalid dimensions fail before allocating a canvas', async t => {
  const { allocations, drawCalls } = mockCanvas(t);
  const image = { naturalWidth: 1200, naturalHeight: 1800 } as HTMLImageElement, crop = fullCrop({ width: 1200, height: 1800 });
  for (const output of [{ width: MAX_CROP_OUTPUT_EDGE + 1, height: 1 }, { width: 8001, height: Math.ceil(MAX_CROP_OUTPUT_PIXELS / 8000) }]) {
    await assert.rejects(renderCrop(image, crop, output), (error: ImageCropError) => error.reason === 'output-too-large');
  }
  for (const output of [{ width: 0, height: 100 }, { width: 1.5, height: 10 }, { width: Infinity, height: 10 }]) {
    await assert.rejects(renderCrop(image, crop, output), (error: ImageCropError) => error.reason === 'invalid-dimensions');
  }
  assert.equal(allocations.length, 0); assert.equal(drawCalls.length, 0);
});

for (const failure of ['context', 'draw', 'blob', 'taint'] as const) test(`export ${failure} failure is recoverable and releases memory`, async t => {
  const { canvas } = mockCanvas(t, failure);
  const image = { naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement;
  await assert.rejects(renderCrop(image, fullCrop({ width: 10, height: 10 })), (error: ImageCropError) => error.reason === 'export-failed');
  assert.equal(canvas.width, 0); assert.equal(canvas.height, 0);
});
