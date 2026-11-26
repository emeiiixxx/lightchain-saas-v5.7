import { ImageCropError, MAX_CROP_OUTPUT_EDGE, MAX_CROP_OUTPUT_PIXELS, renderCrop } from './image-crop';

export type SplitAxis = 'x' | 'y';
export type SplitGrid = {
  width: number;
  height: number;
  /** Internal boundaries in original-image pixels; outer edges are implicit. */
  columns: number[];
  rows: number[];
  /** Row-major cell selection, independent of viewport scale. */
  selected: boolean[];
};
export type SplitCell = { index: number; x: number; y: number; width: number; height: number; selected: boolean };
export type SplitResult = { blob: Blob; width: number; height: number; index: number };
export type ImageSplitErrorReason = 'invalid-grid' | 'output-too-large' | 'export-failed' | 'no-selection';

// Demo allocation limit, not a platform image specification.
export const MAX_SPLIT_CELLS = 100;
export const MIN_SPLIT_SCREEN_GAP = 12;

export class ImageSplitError extends Error {
  constructor(readonly reason: ImageSplitErrorReason) {
    super(reason);
    this.name = 'ImageSplitError';
  }
}

const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;

function validateCounts(width: number, height: number, columns: number, rows: number) {
  if (![width, height, columns, rows].every(positiveInteger)
    || columns > width || rows > height || columns * rows > MAX_SPLIT_CELLS) {
    throw new ImageSplitError('invalid-grid');
  }
}

function validateBoundaries(boundaries: number[], size: number) {
  let previous = 0;
  for (const value of boundaries) {
    if (!Number.isSafeInteger(value) || value <= previous || value >= size) throw new ImageSplitError('invalid-grid');
    previous = value;
  }
}

function validateGrid(grid: SplitGrid) {
  const columns = grid.columns.length + 1, rows = grid.rows.length + 1;
  validateCounts(grid.width, grid.height, columns, rows);
  validateBoundaries(grid.columns, grid.width);
  validateBoundaries(grid.rows, grid.height);
  if (grid.selected.length !== columns * rows || grid.selected.some(value => typeof value !== 'boolean')) {
    throw new ImageSplitError('invalid-grid');
  }
}

function equalBoundaries(size: number, count: number) {
  return Array.from({ length: count - 1 }, (_, index) => Math.round((index + 1) * size / count));
}

function pixelGap(minGap: number) {
  const gap = Math.ceil(minGap);
  if (!Number.isFinite(minGap) || minGap <= 0 || !Number.isSafeInteger(gap)) throw new ImageSplitError('invalid-grid');
  return gap;
}

/** Every output owns a complete integer-pixel rectangle, with no overlaps or gaps. */
export function createSplitGrid(width: number, height: number, columns = Math.min(2, width), rows = Math.min(2, height)): SplitGrid {
  validateCounts(width, height, columns, rows);
  return {
    width, height,
    columns: equalBoundaries(width, columns), rows: equalBoundaries(height, rows),
    selected: Array<boolean>(columns * rows).fill(true),
  };
}

export function splitCells(grid: SplitGrid): SplitCell[] {
  validateGrid(grid);
  const xs = [0, ...grid.columns, grid.width], ys = [0, ...grid.rows, grid.height];
  return grid.selected.map((selected, index) => {
    const column = index % (xs.length - 1), row = Math.floor(index / (xs.length - 1));
    return { index, x: xs[column], y: ys[row], width: xs[column + 1] - xs[column], height: ys[row + 1] - ys[row], selected };
  });
}

/** Applying a preset/custom grid starts a new equal division with all cells selected. */
export function resizeSplitGrid(grid: SplitGrid, columns: number, rows: number): SplitGrid {
  validateGrid(grid);
  return createSplitGrid(grid.width, grid.height, columns, rows);
}

export function moveSplitLine(grid: SplitGrid, axis: SplitAxis, index: number, pixel: number, minGap = 1): SplitGrid {
  validateGrid(grid);
  const gap = pixelGap(minGap);
  const boundaries = axis === 'x' ? grid.columns : grid.rows;
  const size = axis === 'x' ? grid.width : grid.height;
  if (!Number.isSafeInteger(index) || index < 0 || index >= boundaries.length || !Number.isFinite(pixel)) {
    throw new ImageSplitError('invalid-grid');
  }
  const min = (boundaries[index - 1] ?? 0) + gap, max = (boundaries[index + 1] ?? size) - gap;
  if (min > max) return grid;
  const value = Math.min(max, Math.max(min, Math.round(pixel)));
  if (value === boundaries[index]) return grid;
  const next = boundaries.map((boundary, position) => position === index ? value : boundary);
  return axis === 'x' ? { ...grid, columns: next } : { ...grid, rows: next };
}

/** Divide the widest available strip; both new cells inherit their source selection. */
export function addSplitLine(grid: SplitGrid, axis: SplitAxis, minGap = 1): SplitGrid {
  validateGrid(grid);
  const gap = pixelGap(minGap);
  const columns = grid.columns.length + 1, rows = grid.rows.length + 1;
  const boundaries = axis === 'x' ? grid.columns : grid.rows;
  const edges = [0, ...boundaries, axis === 'x' ? grid.width : grid.height];
  let strip = -1, widest = 0;
  for (let index = 0; index < edges.length - 1; index++) {
    const width = edges[index + 1] - edges[index];
    if (width >= 2 * gap && width > widest) { widest = width; strip = index; }
  }
  if (strip === -1) return grid;
  validateCounts(grid.width, grid.height, columns + (axis === 'x' ? 1 : 0), rows + (axis === 'y' ? 1 : 0));
  const next = [...boundaries];
  next.splice(strip, 0, Math.round((edges[strip] + edges[strip + 1]) / 2));
  const nextColumns = columns + (axis === 'x' ? 1 : 0), nextRows = rows + (axis === 'y' ? 1 : 0);
  const selected = Array.from({ length: nextColumns * nextRows }, (_, index) => {
    const column = index % nextColumns, row = Math.floor(index / nextColumns);
    const sourceColumn = axis === 'x' && column > strip ? column - 1 : column;
    const sourceRow = axis === 'y' && row > strip ? row - 1 : row;
    return grid.selected[sourceRow * columns + sourceColumn];
  });
  return axis === 'x' ? { ...grid, columns: next, selected } : { ...grid, rows: next, selected };
}

/** A merged cell remains selected only when both original cells were selected. */
export function removeSplitLine(grid: SplitGrid, axis: SplitAxis, index: number): SplitGrid {
  validateGrid(grid);
  const boundaries = axis === 'x' ? grid.columns : grid.rows;
  if (!Number.isSafeInteger(index) || index < 0 || index >= boundaries.length) throw new ImageSplitError('invalid-grid');
  const next = boundaries.filter((_, position) => position !== index);
  const columns = grid.columns.length + 1, rows = grid.rows.length + 1;
  const nextColumns = columns - (axis === 'x' ? 1 : 0), nextRows = rows - (axis === 'y' ? 1 : 0);
  const selected = Array.from({ length: nextColumns * nextRows }, (_, position) => {
    const column = position % nextColumns, row = Math.floor(position / nextColumns);
    const sourceColumn = axis === 'x' && column > index ? column + 1 : column;
    const sourceRow = axis === 'y' && row > index ? row + 1 : row;
    const source = sourceRow * columns + sourceColumn;
    if (axis === 'x' && column === index) return grid.selected[source] && grid.selected[source + 1];
    if (axis === 'y' && row === index) return grid.selected[source] && grid.selected[source + columns];
    return grid.selected[source];
  });
  return axis === 'x' ? { ...grid, columns: next, selected } : { ...grid, rows: next, selected };
}

export function clearSplitLines(grid: SplitGrid): SplitGrid {
  validateGrid(grid);
  return { ...grid, columns: [], rows: [], selected: [grid.selected.every(Boolean)] };
}

export function toggleSplitCell(grid: SplitGrid, index: number): SplitGrid {
  validateGrid(grid);
  if (!Number.isSafeInteger(index) || index < 0 || index >= grid.selected.length) throw new ImageSplitError('invalid-grid');
  return { ...grid, selected: grid.selected.map((selected, position) => position === index ? !selected : selected) };
}

export function selectSplitCells(grid: SplitGrid, selected: boolean): SplitGrid {
  validateGrid(grid);
  return { ...grid, selected: grid.selected.map(() => selected) };
}

export function equalSplitPreset(grid: SplitGrid): number | null {
  validateGrid(grid);
  const count = grid.columns.length + 1;
  if (count < 2 || count > 7 || count !== grid.rows.length + 1) return null;
  const columns = equalBoundaries(grid.width, count), rows = equalBoundaries(grid.height, count);
  return grid.columns.every((value, index) => value === columns[index])
    && grid.rows.every((value, index) => value === rows[index]) ? count : null;
}

/** Minimum viewport scale that keeps every divided strip at least 12 display pixels wide. */
export function splitMinimumZoom(grid: SplitGrid): number {
  validateGrid(grid);
  let minimum = Infinity;
  for (const [boundaries, size] of [[grid.columns, grid.width], [grid.rows, grid.height]] as const) {
    if (!boundaries.length) continue;
    const edges = [0, ...boundaries, size];
    for (let index = 0; index < edges.length - 1; index++) {
      minimum = Math.min(minimum, edges[index + 1] - edges[index]);
    }
  }
  return minimum === Infinity ? .01 : MIN_SPLIT_SCREEN_GAP / minimum;
}

function ensureActive(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Image split was cancelled', 'AbortError');
}

/** Export selected regions without rescaling, using the existing crop PNG encoder. */
export async function renderSplitImages(image: HTMLImageElement, grid: SplitGrid, signal: AbortSignal): Promise<SplitResult[]> {
  ensureActive(signal);
  validateGrid(grid);
  if (image.naturalWidth !== grid.width || image.naturalHeight !== grid.height) throw new ImageSplitError('invalid-grid');
  const cells = splitCells(grid).filter(cell => cell.selected);
  if (!cells.length) throw new ImageSplitError('no-selection');
  if (cells.some(cell => cell.width > MAX_CROP_OUTPUT_EDGE || cell.height > MAX_CROP_OUTPUT_EDGE
    || cell.width * cell.height > MAX_CROP_OUTPUT_PIXELS)) throw new ImageSplitError('output-too-large');
  const results: SplitResult[] = [];
  for (const cell of cells) {
    ensureActive(signal);
    try {
      const result = await renderCrop(image, cell);
      ensureActive(signal);
      results.push({ ...result, index: cell.index });
    } catch (error) {
      ensureActive(signal);
      throw new ImageSplitError(error instanceof ImageCropError && error.reason === 'output-too-large' ? 'output-too-large' : 'export-failed');
    }
  }
  return results;
}
