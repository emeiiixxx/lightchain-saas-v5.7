import type { GenerationRecord } from './CanvasLeftPanel';
import { useLocale } from '../LocaleContext';
import { GenerationImageTag } from './GenerationImageTag';
import { recordDisplayTags } from '../generation-record-display';
import { TagChip } from '../../components/TagChip';

export function GenerationRecordTags({ record, active = true, disabled = false }: { record: GenerationRecord; active?: boolean; disabled?: boolean }) {
  const { t, locale } = useLocale();
  const isCrop = record.title === '智能裁图';
  // Custom crop records keep the selected W*H value in ratio, including saved history.
  const isCustomCrop = isCrop && /^\d+\*\d+$/.test(record.ratio ?? '');
  const showCount = !isCrop && !record.textEdit && record.title !== '文字编辑';
  const duplicateCropSize = isCrop && !!record.ratio && record.resolution === `${record.ratio}px`;
  const tags = recordDisplayTags(record, locale);
  const splitGridIndex = record.title === '图片切分' ? tags.findIndex(tag => !tag.image && /^\d+\s*[×xX*]\s*\d+$/.test(tag.label)) : -1;
  const grid = splitGridIndex >= 0 ? tags[splitGridIndex].label.match(/^(\d+)\s*[×xX*]\s*(\d+)$/) : null;
  const gridLabel = grid ? (locale === 'en' ? `${grid[1]} columns × ${grid[2]} rows` : locale === 'ja' ? `${grid[1]}列 × ${grid[2]}行` : `${grid[1]}列 × ${grid[2]}行`) : undefined;
  const parameters = [isCustomCrop ? t('自定义预设') : undefined,
    gridLabel ?? (record.ratio ? (record.ratio === 'auto' ? t('智能') : t(record.ratio)) : undefined),
    duplicateCropSize ? undefined : record.resolution, showCount && record.count ? t(`${record.count}张`) : undefined].filter(Boolean);
  return <div className="generation-record-tags">
    {tags.map((tag, index) => index === splitGridIndex ? null : tag.image
      ? <GenerationImageTag chip key={`${tag.label}-${index}`} src={tag.image} label={t(tag.label)} active={active} disabled={disabled} />
      : <TagChip key={`${tag.label}-${index}`} size="s" appearance="filled" leading={tag.color ? <span className="generation-record-color-swatch" style={{ backgroundColor: tag.color }} aria-hidden="true" /> : undefined}>{t(tag.label)}</TagChip>)}
    {record.title.includes('款式裂变')
      ? !!record.count && <TagChip size="s" appearance="filled">{locale === 'en' ? 'Variations: ' : locale === 'ja' ? 'バリエーション数：' : '裂变数量：'}{t(`${record.count}张`)}</TagChip>
      : !!parameters.length && <TagChip size="s" appearance="filled">{parameters.join(' ｜ ')}</TagChip>}
    {record.pending && <TagChip size="s" appearance="filled">{t('待生成')}</TagChip>}
    {record.generating && <TagChip size="s" appearance="filled">{t('生成中…')}</TagChip>}
    {record.failed && <TagChip size="s" appearance="filled">{t('图片加载失败，请重试')}</TagChip>}
  </div>;
}
