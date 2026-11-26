import type { Locale } from '../i18n';
import { IMAGE_EDITOR_MIN_ZOOM, imageEditorZoomOptions } from '../image-editor-viewport';
import { SettingSelect } from './SettingSelect';
import { Button, Icon } from './ui';
import '../setting-select.css';

const copy = {
  'zh-CN': { zoom: '画布缩放', out: '缩小', in: '放大', fit: '适应画布' },
  en: { zoom: 'Canvas zoom', out: 'Zoom out', in: 'Zoom in', fit: 'Fit to canvas' },
  ja: { zoom: 'キャンバス倍率', out: '縮小', in: '拡大', fit: '画面に合わせる' },
};

export function ImageEditorZoom({ locale, zoom, disabled, minimumZoom = IMAGE_EDITOR_MIN_ZOOM, portalContainer, onChange, onFit }: {
  locale: Locale; zoom: number; disabled?: boolean; minimumZoom?: number; portalContainer: Element | null;
  onChange: (zoom: number) => void; onFit: () => void;
}) {
  const t = copy[locale], { value, options } = imageEditorZoomOptions(zoom);
  return <div className="crop-editor-zoom" data-node-id="8:629" inert={disabled}>
    <Button disabled={disabled || zoom <= minimumZoom + 1e-8} aria-label={t.out} onClick={() => onChange(zoom / 1.25)}><Icon name="cropEditorZoomOut" size={20} /></Button>
    <SettingSelect label={t.zoom} value={value} options={[...options.filter(option => Number(option.value) / 100 >= minimumZoom || option.value === value), { value: 'fit', label: t.fit }]}
      chevron={<Icon name="cropEditorChevron" size={16} />} portalContainer={portalContainer}
      onChange={next => next === 'fit' ? onFit() : onChange(Number(next) / 100)} />
    <Button disabled={disabled} aria-label={t.in} onClick={() => onChange(zoom * 1.25)}><Icon name="cropEditorZoomIn" size={20} /></Button>
  </div>;
}
