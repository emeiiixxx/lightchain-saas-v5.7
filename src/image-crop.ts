export type CropRect = { x: number; y: number; width: number; height: number };
export type CropBounds = { width: number; height: number };
export type CropOutputOptions = CropBounds & { mimeType?: 'image/png' | 'image/jpeg'; maxBytes?: number; allowUpscale?: boolean };
export type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

// Bound browser canvas allocation; requested output is never silently reduced.
export const MAX_CROP_OUTPUT_EDGE = 16384;
export const MAX_CROP_OUTPUT_PIXELS = 64_000_000;

export type ImageCropErrorReason = 'invalid-dimensions' | 'invalid-crop' | 'invalid-ratio' | 'output-too-large' | 'insufficient-resolution' | 'file-too-large' | 'export-failed';
export class ImageCropError extends Error {
  constructor(readonly reason: ImageCropErrorReason) {
    super(reason);
    this.name = 'ImageCropError';
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function pixelBounds(bounds: CropBounds): CropBounds {
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width < 1 || bounds.height < 1) {
    throw new ImageCropError('invalid-dimensions');
  }
  return { width: Math.floor(bounds.width), height: Math.floor(bounds.height) };
}

function boundedRect(rect: CropRect, bounds: CropBounds): CropRect {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
    throw new ImageCropError('invalid-crop');
  }
  const width = clamp(rect.width, 1, bounds.width), height = clamp(rect.height, 1, bounds.height);
  return { x: clamp(rect.x, 0, bounds.width - width), y: clamp(rect.y, 0, bounds.height - height), width, height };
}

function validateRatio(ratio: number, bounds: CropBounds) {
  // Both axes must contain at least one source pixel, even for very thin presets.
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > bounds.width || ratio < 1 / bounds.height) {
    throw new ImageCropError('invalid-ratio');
  }
}

function validateDelta(dx: number, dy: number) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new ImageCropError('invalid-crop');
}

function boundedHeight(value: number, minimum: number, maximum: number, bounds: CropBounds) {
  // Subtracting a fractional crop edge from a large source size can lose a few
  // ULPs. A valid one-pixel crop at the bottom/right edge must remain draggable.
  const tolerance = Math.max(bounds.width, bounds.height) * Number.EPSILON * 16;
  if (maximum < minimum - tolerance) throw new ImageCropError('invalid-ratio');
  return clamp(value, minimum, Math.max(minimum, maximum));
}

export function fullCrop(bounds: CropBounds): CropRect {
  return { x: 0, y: 0, ...pixelBounds(bounds) };
}

/** Keep the existing centre/area when possible; a new crop fills available space. */
export function fitCropRatio(bounds: CropBounds, ratio: number | null, current?: CropRect): CropRect {
  const size = pixelBounds(bounds);
  const base = current ? boundedRect(current, size) : fullCrop(size);
  if (ratio === null) return base;
  validateRatio(ratio, size);
  const minHeight = Math.max(1, 1 / ratio), minWidth = minHeight * ratio;
  const cx = clamp(base.x + base.width / 2, minWidth / 2, size.width - minWidth / 2);
  const cy = clamp(base.y + base.height / 2, minHeight / 2, size.height - minHeight / 2);
  const maxHeight = Math.min(2 * Math.min(cy, size.height - cy), 2 * Math.min(cx, size.width - cx) / ratio);
  const desiredHeight = current ? Math.sqrt(base.width * base.height / ratio) : maxHeight;
  const height = boundedHeight(desiredHeight, minHeight, maxHeight, size), width = height * ratio;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

export function moveCrop(rect: CropRect, dx: number, dy: number, bounds: CropBounds): CropRect {
  const size = pixelBounds(bounds), base = boundedRect(rect, size);
  validateDelta(dx, dy);
  return { ...base, x: clamp(base.x + dx, 0, size.width - base.width), y: clamp(base.y + dy, 0, size.height - base.height) };
}

/** Deltas and returned geometry use source pixels, independent of display zoom. */
export function resizeCrop(rect: CropRect, handle: CropHandle, dx: number, dy: number, bounds: CropBounds, ratio: number | null): CropRect {
  const size = pixelBounds(bounds), base = boundedRect(rect, size);
  validateDelta(dx, dy);
  const west = handle.includes('w'), east = handle.includes('e'), north = handle.includes('n'), south = handle.includes('s');
  if (!west && !east && !north && !south) throw new ImageCropError('invalid-crop');
  const left = base.x, right = base.x + base.width, top = base.y, bottom = base.y + base.height;
  if (ratio === null) {
    const x = west ? clamp(left + dx, 0, right - 1) : left;
    const y = north ? clamp(top + dy, 0, bottom - 1) : top;
    const endX = east ? clamp(right + dx, left + 1, size.width) : right;
    const endY = south ? clamp(bottom + dy, top + 1, size.height) : bottom;
    return { x, y, width: endX - x, height: endY - y };
  }
  validateRatio(ratio, size);
  const minHeight = Math.max(1, 1 / ratio);

  if ((west || east) && (north || south)) {
    // The opposite corner is fixed; project the pointer onto the ratio diagonal.
    const sx = east ? 1 : -1, sy = south ? 1 : -1;
    const anchorX = east ? left : right, anchorY = south ? top : bottom;
    const spaceX = east ? size.width - anchorX : anchorX;
    const spaceY = south ? size.height - anchorY : anchorY;
    const maxHeight = Math.min(spaceY, spaceX / ratio);
    const requestedWidth = base.width + sx * dx, requestedHeight = base.height + sy * dy;
    const projectedHeight = (requestedWidth * ratio + requestedHeight) / (ratio * ratio + 1);
    const height = boundedHeight(projectedHeight, minHeight, maxHeight, size), width = height * ratio;
    return { x: east ? anchorX : anchorX - width, y: south ? anchorY : anchorY - height, width, height };
  }

  if (west || east) {
    // Side handles retain the opposite edge's midpoint, growing both vertical sides.
    const anchorX = east ? left : right, cy = top + base.height / 2;
    const spaceX = east ? size.width - anchorX : anchorX;
    const maxHeight = Math.min(spaceX / ratio, 2 * Math.min(cy, size.height - cy));
    const height = boundedHeight((base.width + (east ? dx : -dx)) / ratio, minHeight, maxHeight, size), width = height * ratio;
    return { x: east ? anchorX : anchorX - width, y: cy - height / 2, width, height };
  }

  const anchorY = south ? top : bottom, cx = left + base.width / 2;
  const spaceY = south ? size.height - anchorY : anchorY;
  const maxHeight = Math.min(spaceY, 2 * Math.min(cx, size.width - cx) / ratio);
  const height = boundedHeight(base.height + (south ? dy : -dy), minHeight, maxHeight, size), width = height * ratio;
  return { x: cx - width / 2, y: south ? anchorY : anchorY - height, width, height };
}

/** Use the same source pixels for dimension feedback and the final export. */
export function getCropPixelRect(rect: CropRect, bounds: CropBounds): CropRect {
  const size = pixelBounds(bounds);
  const crop = boundedRect(rect, size);
  // Keep drag geometry fractional; only the sampled pixel edges are rounded.
  const x = clamp(Math.round(crop.x), 0, size.width - 1), y = clamp(Math.round(crop.y), 0, size.height - 1);
  const endX = clamp(Math.round(crop.x + crop.width), x + 1, size.width);
  const endY = clamp(Math.round(crop.y + crop.height), y + 1, size.height);
  return { x, y, width: endX - x, height: endY - y };
}

export async function renderCrop(image: HTMLImageElement, rect: CropRect, output?: CropOutputOptions): Promise<{ blob: Blob; width: number; height: number }> {
  const crop = getCropPixelRect(rect, { width: image.naturalWidth, height: image.naturalHeight });
  const width = output?.width ?? crop.width, height = output?.height ?? crop.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new ImageCropError('invalid-dimensions');
  }
  if (width > MAX_CROP_OUTPUT_EDGE || height > MAX_CROP_OUTPUT_EDGE || width * height > MAX_CROP_OUTPUT_PIXELS) {
    throw new ImageCropError('output-too-large');
  }
  if (output?.allowUpscale === false && (crop.width < width || crop.height < height)) {
    throw new ImageCropError('insufficient-resolution');
  }
  const mimeType = output?.mimeType ?? 'image/png', maxBytes = output?.maxBytes;
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)) {
    throw new ImageCropError('export-failed');
  }
  const canvas = document.createElement('canvas');
  try {
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new ImageCropError('export-failed');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    if (mimeType === 'image/jpeg') {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    // Meet file limits by changing JPEG quality, never the requested dimensions.
    const qualities = mimeType === 'image/jpeg' ? maxBytes === undefined ? [.95] : [.95, .9, .85, .8, .75, .7, .6] : [undefined];
    for (const quality of qualities) {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        value => value?.size && value.type === mimeType ? resolve(value) : reject(new ImageCropError('export-failed')), mimeType, quality));
      if (maxBytes === undefined || blob.size < maxBytes) return { blob, width, height };
    }
    throw new ImageCropError('file-too-large');
  } catch (error) {
    if (error instanceof ImageCropError) throw error;
    throw new ImageCropError('export-failed');
  } finally {
    canvas.width = 0; canvas.height = 0;
  }
}
