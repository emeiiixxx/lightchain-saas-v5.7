import { useEffect, useId, useState } from 'react';
import { messages, type Locale } from '../i18n';
import { Icon, type IconName } from './ui';
import { ToolbarHoverMenu } from './ToolbarHoverMenu';

export type ImageEditingAction = 'repair' | 'localEdit' | 'upscale' | 'removeBackground' | 'smartCutout' | 'smartCrop' | 'imageSplit' | 'expand' | 'erase';
export type ImageUpscaleResolution = '2K' | '4K';
export type ImageEditingSource = { id: string; url: string; naturalWidth?: number; naturalHeight?: number };

const upscaleTargets: { label: ImageUpscaleResolution; pixels: number }[] = [{ label: '2K', pixels: 2048 }, { label: '4K', pixels: 4096 }];
const upscaleMessages = {
  'zh-CN': { tooLarge: '图片过大，无法放大', loading: '读取图片尺寸…', failed: '无法读取图片尺寸' },
  en: { tooLarge: 'Image too large to upscale', loading: 'Reading image dimensions…', failed: 'Unable to read image dimensions' },
  ja: { tooLarge: '画像が大きすぎるため、拡大できません', loading: '画像サイズを読み込み中…', failed: '画像サイズを読み込めません' },
};

function useSourceDimensions(image?: ImageEditingSource | null) {
  const url = image?.url;
  const width = image?.naturalWidth ?? 0, height = image?.naturalHeight ?? 0;
  const known = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  const [loaded, setLoaded] = useState<{ url: string; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!url || known) return;
    let current = true;
    const source = new Image();
    source.onload = () => { if (current) setLoaded({ url, width: source.naturalWidth, height: source.naturalHeight }); };
    source.onerror = () => { if (current) setLoaded({ url, width: 0, height: 0 }); };
    source.src = url;
    return () => { current = false; source.onload = null; source.onerror = null; };
  }, [url, known]);
  // Canvas display size must never decide whether the original can be upscaled.
  const dimensions = known ? { width, height } : loaded?.url === url ? loaded : null;
  const valid = dimensions && dimensions.width > 0 && dimensions.height > 0;
  return { longestEdge: valid ? Math.max(dimensions.width, dimensions.height) : null, failed: !url || Boolean(dimensions && !valid) };
}

const labels: Record<Locale, Record<ImageEditingAction, string>> = {
  'zh-CN': { repair: '图片修复', localEdit: '局部编辑', upscale: '高清放大', removeBackground: '一键去底', smartCutout: '智能抠图', smartCrop: '智能裁图', imageSplit: '图片切分', expand: 'AI扩图', erase: 'AI消除' },
  en: { repair: 'Image repair', localEdit: 'Edit area', upscale: 'Upscale', removeBackground: 'Remove background', smartCutout: 'Smart cutout', smartCrop: 'Smart crop', imageSplit: 'Split Image', expand: 'AI expand', erase: 'AI erase' },
  ja: { repair: '画像修復', localEdit: '部分編集', upscale: '高解像度化', removeBackground: '背景を削除', smartCutout: 'スマート切り抜き', smartCrop: 'スマートトリミング', imageSplit: '画像分割', expand: 'AI画像拡張', erase: 'AI消去' },
};

const icons: Record<Exclude<ImageEditingAction, 'smartCrop'>, IconName> = {
  repair: 'imageEditRepair', localEdit: 'imageEditLocal', upscale: 'imageEditUpscale',
  imageSplit: 'imageSplit',
  removeBackground: 'imageEditBackground', smartCutout: 'imageEditCutout', expand: 'imageEditExpand', erase: 'imageEditErase',
};
const actions: ImageEditingAction[] = ['imageSplit', 'repair', 'localEdit', 'upscale', 'removeBackground', 'smartCutout', 'smartCrop', 'expand', 'erase'];

type Props = {
  variant: 'canvas' | 'flow';
  locale: Locale;
  image?: ImageEditingSource | null;
  onAction: (action: ImageEditingAction, resolution?: ImageUpscaleResolution) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

// Canvas and Flow share image splitting; only Flow exposes local editing.
export function ImageEditingMenu({ variant, locale, image, onAction, open, onOpenChange }: Props) {
  const group = useId();
  const canvas = variant === 'canvas';
  const { longestEdge, failed } = useSourceDimensions(image);
  const resolutions = upscaleTargets.filter(target => longestEdge !== null && longestEdge < target.pixels);
  const copy = upscaleMessages[locale];
  return <ToolbarHoverMenu label={messages[locale].editImage}
    icon={<Icon name={canvas ? 'imageEditMore' : 'imageEditTrigger'} size={20} />}
    iconOnly={canvas} chevron={null} group={group} nodeId={canvas ? '251:18706' : '251:18822'}
    className={`image-edit-menu image-edit-menu--${variant}`} open={open} onOpenChange={onOpenChange}
    items={actions.filter(action => !canvas || action !== 'localEdit').map(action => ({
      label: labels[locale][action],
      icon: <Icon name={action === 'smartCrop' ? canvas ? 'imageEditCropCanvas' : 'imageEditCropFlow' : icons[action]} size={20} />,
      trailing: action === 'imageSplit' ? <span className="image-edit-menu-trailing"><span className="image-edit-menu-new" data-component="Badge/Text/Pill">NEW</span></span>
        : action === 'upscale' ? <Icon name="imageEditChevron" size={16} /> : undefined,
      submenu: action === 'upscale' ? {
        items: resolutions.map(target => ({ label: target.label, onSelect: () => onAction('upscale', target.label) })),
        emptyLabel: longestEdge !== null ? copy.tooLarge : failed ? copy.failed : copy.loading,
      } : undefined,
      onSelect: () => onAction(action),
    }))} />;
}
