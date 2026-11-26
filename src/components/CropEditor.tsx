import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { canvasMediaDisplayName } from '../canvas-media-filename';
import { fitCropRatio, fullCrop, getCropPixelRect, ImageCropError, MAX_CROP_OUTPUT_EDGE, MAX_CROP_OUTPUT_PIXELS, moveCrop, renderCrop, resizeCrop, type CropHandle, type CropRect } from '../image-crop';
import type { Locale } from '../i18n';
import { usePresence } from '../usePresence';
import { CropPresetPanel, type CropPreset } from './CropPresetPanel';
import { ImageEditorZoom } from './ImageEditorZoom';
import { imageEditorViewport, imageEditorZoomAt } from '../image-editor-viewport';
import { Toast } from './Toast';
import { Button, Icon } from './ui';
import '../setting-select.css';
import '../crop-editor.css';

export type CropEditorSource = { id: string; name: string; url: string };
export type CropEditorResult = { blob: Blob; width: number; height: number; preset: CropPreset };
type Props = { source: CropEditorSource; locale: Locale; phase: 'enter' | 'exit'; onClose: () => void; onApply: (result: CropEditorResult, signal: AbortSignal) => void | Promise<void> };
type Point = { x: number; y: number };
type CropPointer = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>;
type Snapshot = { crop: CropRect; preset: CropPreset };
type Drag = { pointer: number; start: Point; pan: Point; snapshot: Snapshot; mode: 'pan' | 'move' | CropHandle; scale: number };
const handles: CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const free: CropPreset = { id: 'free', label: '自由', ratio: null };
const copy = {
  'zh-CN': { title: '智能裁图', close: '关闭裁剪', zoom: '画布缩放', zoomIn: '放大', zoomOut: '缩小', fit: '适应画布', region: '裁剪区域', resize: '调整裁剪区域', loading: '正在读取图片…', loadError: '图片读取失败，请关闭后重试', exportError: '裁剪失败，请重试', invalid: '该尺寸无法用于当前图片，请调整宽高', tooLarge: '输出尺寸过大，请减小自定义宽高后重试', handles: ['左上角', '上边', '右上角', '右边', '右下角', '下边', '左下角', '左边'] },
  en: { title: 'Smart crop', close: 'Close crop editor', zoom: 'Canvas zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit to canvas', region: 'Crop area', resize: 'Resize crop area', loading: 'Loading image…', loadError: 'Unable to load the image. Close and try again.', exportError: 'Unable to crop the image. Try again.', invalid: 'These dimensions do not fit this image. Adjust the width and height.', tooLarge: 'Output dimensions are too large. Reduce the custom width and height.', handles: ['Top left', 'Top', 'Top right', 'Right', 'Bottom right', 'Bottom', 'Bottom left', 'Left'] },
  ja: { title: 'スマートトリミング', close: 'トリミングを閉じる', zoom: 'キャンバス倍率', zoomIn: '拡大', zoomOut: '縮小', fit: '画面に合わせる', region: 'トリミング範囲', resize: 'トリミング範囲を調整', loading: '画像を読み込み中…', loadError: '画像を読み込めません。閉じてから再試行してください。', exportError: 'トリミングできませんでした。再試行してください。', invalid: 'この画像には適用できないサイズです。幅と高さを変更してください。', tooLarge: '出力サイズが大きすぎます。幅と高さを小さくしてください。', handles: ['左上', '上', '右上', '右', '右下', '下', '左下', '左'] },
};
const isTextInput = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
const sameRect = (a: CropRect, b: CropRect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const outputCopy = {
  'zh-CN': { source: '裁剪区域', lowResolution: '裁剪区域小于所选尺寸，生成后可能模糊。', belowPlatformRecommendation: '裁剪区域小于所选尺寸，生成后可能模糊。', tooLarge: '输出尺寸过大，请减小自定义宽高', fileTooLarge: '文件仍超过预设大小限制，请选择更小的输出尺寸后重试' },
  en: { source: 'Crop area', lowResolution: 'The crop area is smaller than the selected size. The generated image may look blurry.', belowPlatformRecommendation: 'The crop area is smaller than the selected size. The generated image may look blurry.', tooLarge: 'Output is too large. Reduce the custom dimensions.', fileTooLarge: 'File exceeds the preset limit. Choose a smaller output size and try again.' },
  ja: { source: '切り抜き範囲', lowResolution: '切り抜き範囲が選択したサイズより小さいため、生成後にぼやける可能性があります。', belowPlatformRecommendation: '切り抜き範囲が選択したサイズより小さいため、生成後にぼやける可能性があります。', tooLarge: '出力サイズが大きすぎます。幅と高さを小さくしてください。', fileTooLarge: 'ファイルサイズが上限を超えています。出力サイズを小さくしてください。' },
};

export function CropEditor({ source, locale, phase, onClose, onApply }: Props) {
  const t = copy[locale];
  const dialog = useRef<HTMLDialogElement>(null), stage = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const cropRef = useRef<CropRect | null>(null);
  const [preset, setPreset] = useState<CropPreset>(free);
  const [zoom, setZoom] = useState(.4), [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false), [notice, setNoticeValue] = useState('');
  const shownNotice = usePresence(notice || null);
  const noticeTimer = useRef<number | null>(null);
  const setNotice = useCallback((message: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNoticeValue(message);
    noticeTimer.current = message ? window.setTimeout(() => {
      setNoticeValue(''); noticeTimer.current = null;
    }, 3000) : null;
  }, []);
  const [loadFailed, setLoadFailed] = useState(false), [space, setSpace] = useState(false), [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null), job = useRef<AbortController | null>(null);
  const history = useRef<Snapshot[]>([]), future = useRef<Snapshot[]>([]);
  const initialized = useRef<string | null>(null);
  const alive = useRef(true);
  const wheelHandler = useRef<(event: WheelEvent) => void>(() => {});
  const pointerUpHandler = useRef<(event: PointerEvent) => void>(() => {});
  const bounds = image ? { width: image.naturalWidth, height: image.naturalHeight } : null;
  const outputText = outputCopy[locale];
  const pixelCrop = crop && bounds ? getCropPixelRect(crop, bounds) : null;
  // Cover presets remain ratio-only, including objects restored from earlier editor snapshots.
  const outputPreset: CropPreset = preset.id.startsWith('social:') || preset.id.startsWith('video:')
    ? { id: preset.id, label: preset.label, ratio: preset.ratio } : preset;
  const outputWidth = outputPreset.outputWidth ?? pixelCrop?.width ?? 0, outputHeight = outputPreset.outputHeight ?? pixelCrop?.height ?? 0;
  const outputIssue = outputWidth > MAX_CROP_OUTPUT_EDGE || outputHeight > MAX_CROP_OUTPUT_EDGE || outputWidth * outputHeight > MAX_CROP_OUTPUT_PIXELS
    ? outputText.tooLarge : '';
  const lowResolutionText = outputPreset.kind === 'commerce' ? outputText.belowPlatformRecommendation : outputText.lowResolution;
  const outputWarning = pixelCrop && (outputWidth > pixelCrop.width || outputHeight > pixelCrop.height) ? lowResolutionText : '';
  const { center, fitZoom } = imageEditorViewport(viewport, bounds);
  const updateCrop = (next: CropRect) => { cropRef.current = next; setCrop(next); };
  const cancel = useCallback(() => { job.current?.abort(); drag.current = null; onClose(); }, [onClose]);

  useLayoutEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null, modal = dialog.current!;
    modal.showModal();
    const observe = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    if (stage.current) observe.observe(stage.current);
    return () => {
      alive.current = false; job.current?.abort(); observe.disconnect(); modal.close();
      if (previous?.isConnected && !previous.closest('[hidden], [inert]')) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => () => { if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current); }, []);
  useEffect(() => { if (phase === 'exit') { job.current?.abort(); drag.current = null; setNotice(''); } }, [phase, setNotice]);
  useEffect(() => {
    let active = true;
    const original = new Image();
    if (/^https?:/i.test(source.url)) original.crossOrigin = 'anonymous';
    setImage(null); setCrop(null); cropRef.current = null; setLoadFailed(false); setNotice('');
    setPreset(free); history.current = []; future.current = []; initialized.current = null;
    original.onload = () => {
      if (!active) return;
      if (!original.naturalWidth || !original.naturalHeight) { setLoadFailed(true); return; }
      setImage(original); const rect = fullCrop({ width: original.naturalWidth, height: original.naturalHeight });
      cropRef.current = rect; setCrop(rect);
    };
    original.onerror = () => { if (active) setLoadFailed(true); };
    original.src = source.url;
    return () => { active = false; original.onload = null; original.onerror = null; job.current?.abort(); };
  }, [source.url, setNotice]);
  useEffect(() => {
    if (!image || initialized.current === source.url) return;
    initialized.current = source.url; setZoom(Math.min(.4, fitZoom)); setPan({ x: 0, y: 0 });
  }, [image, source.url, fitZoom]);
  useEffect(() => {
    const release = () => setSpace(false);
    window.addEventListener('blur', release); return () => window.removeEventListener('blur', release);
  }, []);
  useEffect(() => {
    const surface = stage.current;
    const wheel = (event: WheelEvent) => wheelHandler.current(event);
    surface?.addEventListener('wheel', wheel, { passive: false });
    return () => surface?.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    // Finish even when the release is delivered outside the stage or an
    // ancestor stops the bubbling event. end() clears the gesture only once.
    const up = (event: PointerEvent) => pointerUpHandler.current(event);
    window.addEventListener('pointerup', up, true);
    return () => window.removeEventListener('pointerup', up, true);
  }, []);
  useEffect(() => {
    if (window.parent === window) return;
    window.parent.postMessage({ type: 'lc-v57-crop-editor-visibility', open: true }, window.location.origin);
    return () => window.parent.postMessage({ type: 'lc-v57-crop-editor-visibility', open: false }, window.location.origin);
  }, []);

  function record(previous: Snapshot) { history.current.push(previous); future.current = []; }
  function restore(redo = false) {
    if (!crop || busy || drag.current) return;
    const from = redo ? future : history, to = redo ? history : future, value = from.current.pop();
    if (!value) return;
    to.current.push({ crop, preset }); updateCrop(value.crop); setPreset(value.preset); setNotice('');
  }
  function selectPreset(next: CropPreset) {
    if (!bounds || !crop || busy) return;
    try {
      // Start each preset from the largest centred crop that fits the source image.
      const rect = fitCropRatio(bounds, next.ratio);
      record({ crop, preset }); setPreset(next); updateCrop(rect); setNotice('');
    } catch { setNotice(t.invalid); }
  }
  function changeZoom(value: number, point?: Point) {
    if (!Number.isFinite(value) || !image || drag.current) return;
    const next = imageEditorZoomAt(zoom, pan, center, value, point);
    if (point) setPan(previous => imageEditorZoomAt(zoom, previous, center, value, point).pan);
    setZoom(next.zoom);
  }
  function fit() { if (image && !drag.current) { setZoom(fitZoom); setPan({ x: 0, y: 0 }); } }
  function start(event: ReactPointerEvent, mode: Drag['mode']) {
    if (!crop || !image || busy || drag.current || phase === 'exit' || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault(); event.stopPropagation();
    // preventDefault suppresses native focus; return keyboard control to the
    // crop after using a preset/input instead of leaving focus in the sidebar.
    if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus({ preventScroll: true });
    stage.current?.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, pan, snapshot: { crop, preset }, mode: space || event.button === 1 ? 'pan' : mode, scale: zoom };
    setDragging(true); setNotice('');
  }
  function move(event: CropPointer) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointer || !bounds) return;
    const dx = event.clientX - current.start.x, dy = event.clientY - current.start.y;
    if (current.mode === 'pan') { setPan({ x: current.pan.x + dx, y: current.pan.y + dy }); return; }
    try { updateCrop(current.mode === 'move' ? moveCrop(current.snapshot.crop, dx / current.scale, dy / current.scale, bounds)
      : resizeCrop(current.snapshot.crop, current.mode, dx / current.scale, dy / current.scale, bounds, current.snapshot.preset.ratio)); }
    catch { setNotice(t.invalid); }
  }
  function end(event: Pick<PointerEvent, 'pointerId'>, cancelled = false) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointer) return;
    drag.current = null; setDragging(false);
    if (cancelled) { updateCrop(current.snapshot.crop); setPan(current.pan); }
    else if (current.mode !== 'pan' && cropRef.current && !sameRect(current.snapshot.crop, cropRef.current)) record(current.snapshot);
    if (stage.current?.hasPointerCapture(event.pointerId)) stage.current.releasePointerCapture(event.pointerId);
  }
  function nudge(event: ReactKeyboardEvent, handle?: CropHandle) {
    if (!crop || !bounds || busy || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    try { const next = handle ? resizeCrop(crop, handle, dx, dy, bounds, preset.ratio) : moveCrop(crop, dx, dy, bounds);
      if (!sameRect(next, crop)) { record({ crop, preset }); updateCrop(next); }
    } catch { setNotice(t.invalid); }
  }
  async function apply() {
    if (!image || !crop || busy || job.current || drag.current || phase === 'exit') return;
    if (outputIssue) { setNotice(outputIssue); return; }
    const controller = new AbortController(); job.current = controller; setBusy(true); setNotice('');
    try {
      const result = await renderCrop(image, crop, outputPreset.outputWidth && outputPreset.outputHeight ? {
        width: outputPreset.outputWidth, height: outputPreset.outputHeight, mimeType: outputPreset.outputMimeType,
        maxBytes: outputPreset.maxOutputBytes, allowUpscale: true,
      } : undefined);
      if (controller.signal.aborted || !alive.current) return;
      await onApply({ ...result, preset: { ...outputPreset } }, controller.signal);
      if (!controller.signal.aborted && alive.current) onClose();
    } catch (error) {
      if (!controller.signal.aborted && alive.current) setNotice(error instanceof ImageCropError
        ? error.reason === 'output-too-large' ? t.tooLarge : error.reason === 'file-too-large' ? outputText.fileTooLarge : t.exportError
        : t.exportError);
    } finally { if (job.current === controller) job.current = null; if (alive.current) setBusy(false); }
  }
  const imageWidth = (bounds?.width ?? 0) * zoom, imageHeight = (bounds?.height ?? 0) * zoom;
  pointerUpHandler.current = event => { move(event); end(event); };
  wheelHandler.current = event => {
    event.preventDefault(); event.stopPropagation();
    if (busy || drag.current) return;
    if (event.ctrlKey || event.metaKey || event.altKey) {
      const r = stage.current?.getBoundingClientRect();
      if (r) changeZoom(zoom * Math.exp(-event.deltaY * .002), { x: event.clientX - r.left, y: event.clientY - r.top });
    } else setPan(previous => ({ x: previous.x - event.deltaX, y: previous.y - event.deltaY }));
  };

  return <dialog ref={dialog} className="crop-editor" data-node-id="8:621" data-phase={phase} lang={locale} aria-label={t.title} inert={phase === 'exit'}
    onCancel={event => { event.preventDefault(); cancel(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (isTextInput(event.target) || event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); restore(event.shiftKey); }
      if (event.code === 'Space' && !(event.target instanceof Element && event.target.closest('button:not(.crop-editor-handle)'))) { event.preventDefault(); setSpace(true); }
      if (event.key === '0' && !(event.ctrlKey || event.metaKey)) { event.preventDefault(); fit(); }
    }} onKeyUp={event => { if (event.code === 'Space') setSpace(false); }}>
    <div ref={stage} className="crop-editor-stage" tabIndex={-1} data-panning={space || undefined} data-dragging={dragging || undefined}
      onPointerDown={event => start(event, 'pan')} onPointerMove={move} onPointerUp={event => { move(event); end(event); }} onPointerCancel={event => end(event, true)}
      onLostPointerCapture={event => end(event)}>
      {image && crop && bounds ? <div className="crop-editor-image" style={{ left: center.x + pan.x - imageWidth / 2, top: center.y + pan.y - imageHeight / 2, width: imageWidth, height: imageHeight }}>
        <img src={source.url} alt={canvasMediaDisplayName(source.name)} draggable={false} />
        <div className="crop-editor-shade" style={{ left: 0, top: 0, width: imageWidth, height: crop.y * zoom }} />
        <div className="crop-editor-shade" style={{ left: 0, top: (crop.y + crop.height) * zoom, width: imageWidth, height: Math.max(0, bounds.height - crop.y - crop.height) * zoom }} />
        <div className="crop-editor-shade" style={{ left: 0, top: crop.y * zoom, width: crop.x * zoom, height: crop.height * zoom }} />
        <div className="crop-editor-shade" style={{ left: (crop.x + crop.width) * zoom, top: crop.y * zoom, width: Math.max(0, bounds.width - crop.x - crop.width) * zoom, height: crop.height * zoom }} />
        <div className="crop-editor-selection" role="group" tabIndex={0} aria-label={t.region}
          aria-description={pixelCrop ? `${outputText.source}: ${pixelCrop.width}×${pixelCrop.height} px` : undefined}
          style={{ left: crop.x * zoom, top: crop.y * zoom, width: crop.width * zoom, height: crop.height * zoom }}
          onPointerDown={event => start(event, 'move')} onKeyDown={event => nudge(event)}>
          {handles.map((handle, index) => <button key={handle} type="button" className={`crop-editor-handle crop-editor-handle--${handle}`} disabled={busy}
            aria-label={`${t.resize} · ${t.handles[index]}`} onPointerDown={event => start(event, handle)} onKeyDown={event => nudge(event, handle)} />)}
        </div>
        {pixelCrop && <span className="crop-editor-pixel-size" style={{ left: (crop.x + crop.width / 2) * zoom, top: (crop.y + crop.height) * zoom + 8 }}>
          {pixelCrop.width}×{pixelCrop.height} px
        </span>}
      </div> : <div className="crop-editor-loading" role="status">{loadFailed ? t.loadError : t.loading}</div>}
    </div>
    <header className="crop-editor-header">
      <h1><Icon name="cropEditorTitle" size={24} />{t.title}</h1>
      <div className="crop-editor-header-actions">
        <ImageEditorZoom locale={locale} zoom={zoom} disabled={!image} portalContainer={dialog.current} onChange={changeZoom} onFit={fit} />
        <Button className="crop-editor-close" aria-label={t.close} onClick={cancel}><Icon name="cropEditorClose" size={24} /></Button>
      </div>
    </header>
    <aside className="crop-editor-sidebar" inert={busy}>
      <CropPresetPanel locale={locale} selectedId={preset.id} onSelect={selectPreset} submitDisabled={!image || !crop || busy || Boolean(dragging) || Boolean(outputIssue)} busy={busy} onSubmit={() => void apply()} onNotice={setNotice}
        outputInfo={pixelCrop && (outputIssue || outputWarning) ? <div className="crop-output-summary">
          {outputIssue && <p className="crop-output-error" role="alert">{outputIssue}</p>}
          {!outputIssue && outputWarning && <p className="crop-output-warning" role="status">{outputWarning}</p>}
        </div> : null} />
    </aside>
    {shownNotice.value && <Toast className="crop-editor-notice" data-node-id="56:6581" data-phase={shownNotice.phase} message={shownNotice.value} tone="error" icon={<Icon name="cropToastExclamation" size={16} />} />}
  </dialog>;
}
