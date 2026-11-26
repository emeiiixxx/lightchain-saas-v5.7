import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Locale } from '../i18n';
import { canvasMediaDisplayName } from '../canvas-media-filename';
import { IMAGE_EDITOR_MIN_ZOOM, IMAGE_EDITOR_MAX_ZOOM, imageEditorViewport, imageEditorZoomAt, type ImageEditorPoint } from '../image-editor-viewport';
import { addSplitLine, clearSplitLines, createSplitGrid, equalSplitPreset, ImageSplitError, MAX_SPLIT_CELLS, MIN_SPLIT_SCREEN_GAP, moveSplitLine, removeSplitLine,
  renderSplitImages, resizeSplitGrid, selectSplitCells, splitCells, splitMinimumZoom, toggleSplitCell, type SplitAxis, type SplitGrid, type SplitResult } from '../image-split';
import { ChoiceChip } from './ChoiceChip';
import { ImageEditorZoom } from './ImageEditorZoom';
import { Button, Icon } from './ui';
import '../crop-editor.css';
import '../crop-preset-panel.css';
import '../image-split-editor.css';

type Props = {
  source: { id: string; name: string; url: string }; locale: Locale; phase: 'enter' | 'exit'; onClose: () => void;
  onApply: (results: SplitResult[], grid: SplitGrid, signal: AbortSignal) => void | Promise<void>;
};
type Pointer = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>;
type Drag = { pointer: number; target: HTMLElement; start: ImageEditorPoint; pan: ImageEditorPoint; scale: number; snapshot: SplitGrid;
  mode: 'pan' | SplitAxis; index: number };
const MAX_CUSTOM_SPLIT_COUNT = 10;
const copy = {
  'zh-CN': {
    title: '图片切分', close: '关闭图片切分', settings: '切分设置', original: '原图', quantity: '配置切分数量',
    hint: '拖动分割线调整切割范围 · 双击分割线删除 · 点击宫格选择',
    description: '拖动分割线可自由划分，宫格随线联动', presets: '快捷预设', custom: '自定义输入', columns: '列', rows: '行',
    apply: '应用切分', lines: '分割线', vertical: '添加竖线', horizontal: '添加横线', clear: '清空分割线',
    select: '选择切片', all: '全选', none: '取消全选', output: '每个选中的切片生成一张独立图片',
    loading: '正在读取图片…', loadError: '图片读取失败，请关闭后重试', exporting: '正在切分…', exportError: '图片切分失败，请重试',
    invalid: '请输入大于 0 的整数，行列数不能超过原图像素', limit: `单次最多切分 ${MAX_SPLIT_CELLS} 格，请调整行列数`,
    tooLarge: '部分宫格尺寸过大，请增加分割线后重试',
    spacing: '宫格显示间距不能小于 12px，请减少行列数',
    addSpacing: '当前没有足够间距，请放大画面后再添加分割线',
    grid: (c: number, r: number) => `当前${c}×${r}=${c * r}，可拖动分割线，调整为不等分`,
    count: (total: number, selected: number) => ({ before: `共 ${total} 张 · 已选 `, selected: `${selected} 张`, after: '' }),
    submit: (count: number) => `切分 ${count} 张`, cell: (index: number) => `宫格 ${index}`,
    line: (axis: SplitAxis, index: number) => `${axis === 'x' ? '竖' : '横'}分割线 ${index}`,
    lineHelp: '拖动或使用方向键调整位置，双击或按 Delete 删除',
  },
  en: {
    title: 'Split Image', close: 'Close image splitter', settings: 'Split settings', original: 'Original', quantity: 'Configure grid size',
    hint: 'Drag lines to adjust the cut area · Double-click a line to delete · Click a cell to select',
    description: 'Drag dividing lines to resize the connected cells', presets: 'Quick presets', custom: 'Custom grid', columns: 'Cols', rows: 'Rows',
    apply: 'Apply grid', lines: 'Dividing lines', vertical: 'Add vertical', horizontal: 'Add horizontal', clear: 'Clear lines',
    select: 'Select slices', all: 'Select all', none: 'Deselect all', output: 'Each selected slice becomes a separate image',
    loading: 'Loading image…', loadError: 'Unable to load the image. Close and try again.', exporting: 'Splitting…', exportError: 'Unable to split the image. Try again.',
    invalid: 'Enter positive whole numbers no greater than the image dimensions.', limit: `Use at most ${MAX_SPLIT_CELLS} cells per split.`,
    tooLarge: 'Some cells are too large. Add more dividing lines and try again.',
    spacing: 'Cells must be at least 12px apart on screen. Reduce the number of rows or columns.',
    addSpacing: 'Not enough space. Zoom in before adding another dividing line.',
    grid: (c: number, r: number) => `${c}×${r} = ${c * r}. Drag lines for unequal sizes.`,
    count: (total: number, selected: number) => ({ before: `${total} slices · `, selected: `${selected} slices`, after: ' selected' }),
    submit: (count: number) => `Split ${count} images`, cell: (index: number) => `Cell ${index}`,
    line: (axis: SplitAxis, index: number) => `${axis === 'x' ? 'Vertical' : 'Horizontal'} line ${index}`,
    lineHelp: 'Drag or use arrow keys to move. Double-click or press Delete to remove.',
  },
  ja: {
    title: '画像分割', close: '画像分割を閉じる', settings: '分割設定', original: '元画像', quantity: '分割数を設定',
    hint: '分割線をドラッグして分割範囲を調整 · ダブルクリックで削除 · セルをクリックして選択',
    description: '分割線をドラッグするとセルも連動します', presets: 'プリセット', custom: 'カスタム入力', columns: '列', rows: '行',
    apply: '分割を適用', lines: '分割線', vertical: '縦線を追加', horizontal: '横線を追加', clear: '分割線をクリア',
    select: '分割画像を選択', all: 'すべて選択', none: 'すべて解除', output: '選択した領域ごとに独立した画像を生成します',
    loading: '画像を読み込み中…', loadError: '画像を読み込めません。閉じてから再試行してください。', exporting: '分割中…', exportError: '画像を分割できませんでした。再試行してください。',
    invalid: '元画像のピクセル数以下の正の整数を入力してください。', limit: `1回に分割できるのは最大${MAX_SPLIT_CELLS}セルです。`,
    tooLarge: '一部のセルが大きすぎます。分割線を追加して再試行してください。',
    spacing: 'セルの表示間隔は12px以上必要です。行数または列数を減らしてください。',
    addSpacing: '間隔が足りません。画面を拡大してから分割線を追加してください。',
    grid: (c: number, r: number) => `${c}×${r}=${c * r}。線をドラッグすると不均等に分割できます。`,
    count: (total: number, selected: number) => ({ before: `全${total}枚 · 選択中 `, selected: `${selected}枚`, after: '' }),
    submit: (count: number) => `${count}枚に分割`, cell: (index: number) => `セル${index}`,
    line: (axis: SplitAxis, index: number) => `${axis === 'x' ? '縦' : '横'}分割線${index}`,
    lineHelp: 'ドラッグまたは矢印キーで移動、ダブルクリックまたはDeleteキーで削除',
  },
};
const isTextInput = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

/** Figma 273:2082, 273:2216, 273:2350, 273:2483. Coordinates stay in source pixels. */
export function ImageSplitEditor({ source, locale, phase, onClose, onApply }: Props) {
  const t = copy[locale], id = useId();
  const dialog = useRef<HTMLDialogElement>(null), stage = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [grid, setGrid] = useState<SplitGrid | null>(null), gridRef = useRef<SplitGrid | null>(null);
  const [columns, setColumns] = useState('2'), [rows, setRows] = useState('2');
  const [formError, setFormError] = useState(''), [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false), [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(.4), [pan, setPan] = useState<ImageEditorPoint>({ x: 0, y: 0 });
  const [space, setSpace] = useState(false), [dragging, setDragging] = useState(false);
  const [lineDrag, setLineDrag] = useState<{ axis: SplitAxis; index: number; point: ImageEditorPoint } | null>(null);
  const drag = useRef<Drag | null>(null), job = useRef<AbortController | null>(null);
  const alive = useRef(true), initialized = useRef(false), suppressCellClick = useRef(false);
  const history = useRef<SplitGrid[]>([]), future = useRef<SplitGrid[]>([]);
  const pointerUp = useRef<(event: PointerEvent) => void>(() => {}), wheel = useRef<(event: WheelEvent) => void>(() => {});
  const { center, fitZoom } = imageEditorViewport(viewport, grid, true);
  const minimumZoom = Math.max(IMAGE_EDITOR_MIN_ZOOM, grid ? splitMinimumZoom(grid) : IMAGE_EDITOR_MIN_ZOOM);
  const minimumPixelGap = Math.max(1, Math.ceil(MIN_SPLIT_SCREEN_GAP / zoom - 1e-8));
  const cells = grid ? splitCells(grid) : [], selectedCount = cells.filter(cell => cell.selected).length;
  const selectionCount = t.count(cells.length, selectedCount);
  const preset = grid ? equalSplitPreset(grid) : null;

  function updateGrid(next: SplitGrid, syncCounts = false) {
    gridRef.current = next; setGrid(next);
    if (syncCounts) { setColumns(String(next.columns.length + 1)); setRows(String(next.rows.length + 1)); setFormError(''); }
  }
  function changeGrid(operation: (value: SplitGrid) => SplitGrid) {
    const current = gridRef.current;
    if (!current || busy || job.current || drag.current || phase === 'exit') return;
    try {
      const next = operation(current);
      const requiredZoom = Math.max(IMAGE_EDITOR_MIN_ZOOM, splitMinimumZoom(next));
      if (requiredZoom > IMAGE_EDITOR_MAX_ZOOM) { setFormError(t.spacing); return; }
      if (next !== current) {
        history.current.push(current); future.current = []; updateGrid(next, true);
        setZoom(previous => Math.max(previous, requiredZoom));
      }
      setError('');
    } catch { setFormError(t.limit); }
  }
  function restore(redo: boolean) {
    if (!gridRef.current || busy || drag.current) return;
    const from = redo ? future : history, to = redo ? history : future, next = from.current.pop();
    if (!next) return;
    to.current.push(gridRef.current); updateGrid(next, true); setError('');
    setZoom(previous => Math.max(previous, IMAGE_EDITOR_MIN_ZOOM, splitMinimumZoom(next)));
  }
  function cancel() { job.current?.abort(); drag.current = null; setLineDrag(null); onClose(); }

  useLayoutEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null, modal = dialog.current!;
    modal.showModal();
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    if (stage.current) observer.observe(stage.current);
    return () => {
      alive.current = false; job.current?.abort(); observer.disconnect(); modal.close();
      if (previous?.isConnected && !previous.closest('[hidden], [inert]')) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (phase === 'exit') { job.current?.abort(); drag.current = null; setLineDrag(null); }
  }, [phase]);
  useEffect(() => {
    let active = true;
    const original = new Image();
    if (/^https?:/i.test(source.url)) original.crossOrigin = 'anonymous';
    initialized.current = false; gridRef.current = null; setLineDrag(null);
    setImage(null); setGrid(null); setLoadFailed(false); setError(''); setFormError('');
    history.current = []; future.current = [];
    original.onload = () => {
      if (!active) return;
      try {
        // Tiny originals must not create divisions that cannot meet the gap
        // even at the shared maximum zoom.
        const minPixels = Math.ceil(MIN_SPLIT_SCREEN_GAP / IMAGE_EDITOR_MAX_ZOOM);
        updateGrid(createSplitGrid(original.naturalWidth, original.naturalHeight,
          original.naturalWidth >= minPixels * 2 ? 2 : 1, original.naturalHeight >= minPixels * 2 ? 2 : 1), true);
        setImage(original);
      }
      catch { setLoadFailed(true); }
    };
    original.onerror = () => { if (active) setLoadFailed(true); };
    original.src = source.url;
    return () => { active = false; original.onload = null; original.onerror = null; job.current?.abort(); };
  }, [source.id, source.url]);
  useLayoutEffect(() => {
    if (image && !initialized.current) {
      initialized.current = true; setZoom(Math.max(minimumZoom, fitZoom)); setPan({ x: 0, y: 0 });
    }
  }, [image, fitZoom, minimumZoom]);
  useEffect(() => {
    const element = stage.current;
    const handleWheel = (event: WheelEvent) => wheel.current(event);
    const handleUp = (event: PointerEvent) => pointerUp.current(event);
    const blur = () => { setSpace(false); if (drag.current) end({ pointerId: drag.current.pointer }); };
    element?.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('pointerup', handleUp, true);
    window.addEventListener('blur', blur);
    return () => {
      element?.removeEventListener('wheel', handleWheel); window.removeEventListener('pointerup', handleUp, true); window.removeEventListener('blur', blur);
    };
  }, []);
  useEffect(() => {
    if (window.parent === window) return;
    window.parent.postMessage({ type: 'lc-v57-crop-editor-visibility', open: true }, window.location.origin);
    return () => window.parent.postMessage({ type: 'lc-v57-crop-editor-visibility', open: false }, window.location.origin);
  }, []);

  function changeZoom(value: number, point?: ImageEditorPoint) {
    if (!Number.isFinite(value) || !image || busy || drag.current) return;
    const requested = Math.max(minimumZoom, value);
    const next = imageEditorZoomAt(zoom, pan, center, requested, point);
    if (point) setPan(previous => imageEditorZoomAt(zoom, previous, center, requested, point).pan);
    setZoom(next.zoom);
  }
  function fit() { if (image && !busy && !drag.current) { setZoom(Math.max(minimumZoom, fitZoom)); setPan({ x: 0, y: 0 }); } }
  function stagePoint(event: Pick<Pointer, 'clientX' | 'clientY'>) {
    const rect = stage.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }
  function start(event: ReactPointerEvent<HTMLElement>, mode: Drag['mode'], index = -1) {
    if (!gridRef.current || busy || drag.current || phase === 'exit' || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget;
    target.focus({ preventScroll: true }); target.setPointerCapture(event.pointerId);
    const activeMode = space || event.button === 1 ? 'pan' : mode;
    drag.current = { pointer: event.pointerId, target, start: { x: event.clientX, y: event.clientY }, pan, scale: zoom,
      snapshot: gridRef.current, mode: activeMode, index };
    setLineDrag(activeMode === 'pan' ? null : { axis: activeMode, index, point: stagePoint(event) });
    suppressCellClick.current = true; setDragging(true); setError('');
  }
  function move(event: Pointer) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointer) return;
    const dx = event.clientX - current.start.x, dy = event.clientY - current.start.y;
    if (current.mode === 'pan') { setPan({ x: current.pan.x + dx, y: current.pan.y + dy }); return; }
    const boundaries = current.mode === 'x' ? current.snapshot.columns : current.snapshot.rows;
    updateGrid(moveSplitLine(current.snapshot, current.mode, current.index,
      boundaries[current.index] + (current.mode === 'x' ? dx : dy) / current.scale,
      Math.max(1, Math.ceil(MIN_SPLIT_SCREEN_GAP / current.scale - 1e-8))));
    setLineDrag({ axis: current.mode, index: current.index, point: stagePoint(event) });
  }
  function end(event: Pick<Pointer, 'pointerId'>, cancelled = false) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointer) return;
    drag.current = null; setDragging(false); setLineDrag(null);
    if (cancelled) { updateGrid(current.snapshot); setPan(current.pan); }
    else if (current.mode !== 'pan' && gridRef.current !== current.snapshot) { history.current.push(current.snapshot); future.current = []; }
    if (current.target.hasPointerCapture(event.pointerId)) current.target.releasePointerCapture(event.pointerId);
  }
  function lineKey(event: ReactKeyboardEvent, axis: SplitAxis, index: number) {
    if (space || !gridRef.current) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault(); event.stopPropagation(); changeGrid(current => removeSplitLine(current, axis, index)); return;
    }
    const decrease = axis === 'x' ? 'ArrowLeft' : 'ArrowUp', increase = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    if (event.key !== decrease && event.key !== increase) return;
    event.preventDefault(); event.stopPropagation();
    const delta = (event.key === decrease ? -1 : 1) * (event.shiftKey ? 10 : 1);
    changeGrid(current => moveSplitLine(current, axis, index, (axis === 'x' ? current.columns : current.rows)[index] + delta, minimumPixelGap));
  }
  function addLine(axis: SplitAxis) {
    const current = gridRef.current;
    if (!current || busy || drag.current) return;
    try {
      const next = addSplitLine(current, axis, minimumPixelGap);
      if (next === current) { setError(t.addSpacing); return; }
      changeGrid(() => next);
    } catch { setError(t.limit); }
  }
  function applyCustom() {
    if (!grid || busy || drag.current) return;
    // Clamp only on submission; updateGrid writes the applied counts back to both inputs.
    const c = Math.min(MAX_CUSTOM_SPLIT_COUNT, Number(columns)), r = Math.min(MAX_CUSTOM_SPLIT_COUNT, Number(rows));
    if (!/^\d+$/.test(columns) || !/^\d+$/.test(rows) || !Number.isSafeInteger(c) || !Number.isSafeInteger(r)
      || c < 1 || r < 1 || c > grid.width || r > grid.height) { setFormError(t.invalid); return; }
    changeGrid(current => resizeSplitGrid(current, c, r));
  }
  async function apply() {
    const snapshot = gridRef.current;
    if (!snapshot || !image || !snapshot.selected.some(Boolean) || busy || job.current || drag.current || phase === 'exit') return;
    const controller = new AbortController(); job.current = controller; setBusy(true); setError('');
    try {
      const results = await renderSplitImages(image, snapshot, controller.signal);
      if (controller.signal.aborted || !alive.current) return;
      await onApply(results, snapshot, controller.signal);
      if (!controller.signal.aborted && alive.current) onClose();
    } catch (issue) {
      if (!controller.signal.aborted && alive.current) setError(issue instanceof ImageSplitError && issue.reason === 'output-too-large' ? t.tooLarge : t.exportError);
    } finally { if (job.current === controller) job.current = null; if (alive.current) setBusy(false); }
  }
  pointerUp.current = event => { move(event); end(event); };
  wheel.current = event => {
    event.preventDefault(); event.stopPropagation();
    if (busy || drag.current || phase === 'exit') return;
    if (event.ctrlKey || event.metaKey || event.altKey) {
      const rect = stage.current?.getBoundingClientRect();
      if (rect) changeZoom(zoom * Math.exp(-event.deltaY * .002), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    } else setPan(previous => ({ x: previous.x - event.deltaX, y: previous.y - event.deltaY }));
  };
  const imageWidth = (grid?.width ?? 0) * zoom, imageHeight = (grid?.height ?? 0) * zoom;
  const coordinate = grid && lineDrag ? (lineDrag.axis === 'x' ? grid.columns : grid.rows)[lineDrag.index] : undefined;
  // Anchor to the actual clamped line, near the drag point, so the readout
  // stays visible on zoomed long images even when the centre handle is offscreen.
  const coordinateAnchor = lineDrag && coordinate !== undefined ? {
    x: lineDrag.axis === 'x' ? center.x + pan.x - imageWidth / 2 + coordinate * zoom : lineDrag.point.x,
    y: lineDrag.axis === 'y' ? center.y + pan.y - imageHeight / 2 + coordinate * zoom : lineDrag.point.y,
  } : null;

  return <dialog ref={dialog} className="crop-editor image-split-editor" data-node-id="273:2082" data-phase={phase} lang={locale}
    aria-label={t.title} aria-busy={busy} inert={phase === 'exit'} onCancel={event => { event.preventDefault(); cancel(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (isTextInput(event.target) || event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); restore(event.shiftKey); }
      if (event.code === 'Space' && !(event.target instanceof Element && event.target.closest('button:not(.image-split-line):not(.image-split-cell)'))) { event.preventDefault(); setSpace(true); }
      if (event.key === '0' && !(event.ctrlKey || event.metaKey)) { event.preventDefault(); fit(); }
    }} onKeyUp={event => { if (event.code === 'Space') setSpace(false); }}>
    <div ref={stage} className="crop-editor-stage image-split-stage" tabIndex={-1} data-panning={space || undefined} data-dragging={dragging || undefined}
      onPointerDown={event => start(event, 'pan')} onPointerMove={move} onPointerUp={event => { move(event); end(event); }}
      onPointerCancel={event => end(event, true)} onLostPointerCapture={event => end(event)}>
      {image && grid ? <div className="crop-editor-image image-split-image" style={{ left: center.x + pan.x - imageWidth / 2,
        top: center.y + pan.y - imageHeight / 2, width: imageWidth, height: imageHeight }}>
        <img src={source.url} alt={canvasMediaDisplayName(source.name)} draggable={false} />
        {cells.map(cell => <button key={cell.index} type="button" className="image-split-cell" aria-label={`${t.cell(cell.index + 1)} · ${cell.width}×${cell.height} px`}
          aria-pressed={cell.selected} disabled={busy} style={{ left: cell.x * zoom, top: cell.y * zoom, width: cell.width * zoom, height: cell.height * zoom }}
          onPointerDown={event => {
            if (space || event.button === 1) { start(event, 'pan'); return; }
            suppressCellClick.current = false; event.stopPropagation();
          }}
          onClick={event => { event.stopPropagation(); if (!space && (!suppressCellClick.current || event.detail === 0)) changeGrid(current => toggleSplitCell(current, cell.index)); }}>
          <span className="image-split-cell-number">{cell.index + 1}</span>
        </button>)}
        {(['x', 'y'] as const).flatMap(axis => (axis === 'x' ? grid.columns : grid.rows).map((position, index) => <button type="button"
          key={`${axis}:${index}`} className={`image-split-line image-split-line--${axis}`} disabled={busy}
          aria-label={t.line(axis, index + 1)} aria-description={t.lineHelp}
          style={axis === 'x' ? { left: position * zoom } : { top: position * zoom }}
          onPointerDown={event => start(event, axis, index)} onKeyDown={event => lineKey(event, axis, index)}
          onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); changeGrid(current => removeSplitLine(current, axis, index)); }}>
          <span className="image-split-line-handle" />
        </button>))}
        <span className="image-split-outline" aria-hidden="true" />
      </div> : <div className="crop-editor-loading" role="status">{loadFailed ? t.loadError : t.loading}</div>}
    </div>
    {lineDrag && coordinateAnchor && coordinate !== undefined && phase !== 'exit' && <span className="image-split-coordinate" aria-hidden="true"
      style={{ left: Math.max(8, Math.min(viewport.width - 140, coordinateAnchor.x + 16)),
        top: Math.max(8, Math.min(viewport.height - 32, coordinateAnchor.y + 16)) }}>
      {lineDrag.axis.toUpperCase()}: {coordinate} px
    </span>}
    <header className="crop-editor-header">
      <h1><Icon name="imageSplit" size={24} />{t.title}</h1>
      <div className="crop-editor-header-actions">
        <ImageEditorZoom locale={locale} zoom={zoom} minimumZoom={minimumZoom} disabled={!image || busy} portalContainer={dialog.current} onChange={changeZoom} onFit={fit} />
        <Button className="crop-editor-close" aria-label={t.close} onClick={cancel}><Icon name="cropEditorClose" size={24} /></Button>
      </div>
    </header>
    <p className="image-split-hint"><span aria-hidden="true">💡</span>{t.hint}</p>
    <aside className="crop-editor-sidebar image-split-sidebar" aria-label={t.settings}>
      <header className="image-split-sidebar-header"><h2>{t.settings}</h2><p>{t.original}{grid ? ` ${grid.width}×${grid.height} px` : ' —'}</p></header>
      <div className="image-split-settings" inert={!image || busy || dragging}>
        <section className="image-split-card">
          <div className="image-split-card-heading"><h3>{t.quantity}</h3><p className="image-split-description">{t.description}</p></div>
          <div className="image-split-field"><h4>{t.presets}</h4><div className="image-split-presets" role="group" aria-label={t.presets}>
            {[2, 3, 4, 5, 6, 7].map(count => <ChoiceChip key={count} size="m" selected={preset === count}
              disabled={!grid || count > grid.width || count > grid.height} onClick={() => changeGrid(current => resizeSplitGrid(current, count, count))}>{count}×{count}</ChoiceChip>)}
          </div></div>
          <form className="image-split-field" onSubmit={event => { event.preventDefault(); applyCustom(); }}>
            <h4>{t.custom}</h4>
            <div className="image-split-inputs">
              <label className="crop-preset-input" data-component="Input" data-invalid={!!formError || undefined}><span>{t.columns}</span>
                <input aria-label={t.columns} inputMode="numeric" autoComplete="off" value={columns} aria-invalid={!!formError} aria-describedby={formError ? `${id}-error` : undefined}
                  onChange={event => { setColumns(event.target.value); setFormError(''); }} /></label>
              <label className="crop-preset-input" data-component="Input" data-invalid={!!formError || undefined}><span>{t.rows}</span>
                <input aria-label={t.rows} inputMode="numeric" autoComplete="off" value={rows} aria-invalid={!!formError} aria-describedby={formError ? `${id}-error` : undefined}
                  onChange={event => { setRows(event.target.value); setFormError(''); }} /></label>
            </div>
            {formError && <p className="image-split-error" id={`${id}-error`} role="alert">{formError}</p>}
            <Button type="submit" variant="secondary" size="s" className="image-split-apply" disabled={!columns.trim() || !rows.trim()}>{t.apply}</Button>
          </form>
        </section>
        <section className="image-split-card">
          <div className="image-split-card-heading image-split-card-heading--spaced"><h3>{t.lines}</h3><p>{t.grid((grid?.columns.length ?? 1) + 1, (grid?.rows.length ?? 1) + 1)}</p></div>
          <div className="image-split-field"><div className="image-split-button-row">
            <Button variant="secondary" size="s" disabled={!!grid && grid.columns.length + 1 >= grid.width} onClick={() => addLine('x')}>{t.vertical}</Button>
            <Button variant="secondary" size="s" disabled={!!grid && grid.rows.length + 1 >= grid.height} onClick={() => addLine('y')}>{t.horizontal}</Button>
          </div><Button variant="secondary" size="s" disabled={!grid || !grid.columns.length && !grid.rows.length} onClick={() => changeGrid(clearSplitLines)}>{t.clear}</Button></div>
        </section>
        <section className="image-split-card">
          <div className="image-split-card-heading image-split-card-heading--spaced"><h3>{t.select}</h3><p aria-live="polite">{selectionCount.before}<span className="image-split-selected-count">{selectionCount.selected}</span>{selectionCount.after}</p></div>
          <div className="image-split-button-row">
            <Button variant="secondary" size="s" disabled={selectedCount === cells.length} onClick={() => changeGrid(current => selectSplitCells(current, true))}>{t.all}</Button>
            <Button variant="secondary" size="s" disabled={!selectedCount} onClick={() => changeGrid(current => selectSplitCells(current, false))}>{t.none}</Button>
          </div>
        </section>
      </div>
      <footer className="image-split-footer"><p className="image-split-output">{t.output}</p>
        {error && <p className="image-split-error" role="alert">{error}</p>}
        <Button variant="primary" size="m" disabled={!selectedCount || busy || dragging || !image} onClick={() => void apply()}>{busy ? t.exporting : t.submit(selectedCount)}</Button>
      </footer>
    </aside>
  </dialog>;
}
