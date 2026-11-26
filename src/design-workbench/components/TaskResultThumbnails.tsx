import type { KeyboardEventHandler } from 'react';
import { canvasMediaDisplayName } from '../../canvas-media-filename';
import { useLocale } from '../LocaleContext';
import type { GenerationRecord } from './CanvasLeftPanel';
import { ProgressiveImage } from './ProgressiveImage';
import { TaskResultPlaceholder } from './TaskResultPlaceholder';
import { GeneratingPlaceholder } from './GeneratingPlaceholder';
import { useRecordResultRatio } from '../useRecordResultRatio';
import './task-result-thumbnails.css';

const RECORD_RESULT_SLOTS = 8;
type ResultImage = GenerationRecord['images'][number];
const unavailable = (image: ResultImage) => image.status === 'failed' || image.status === 'generating';

export function TaskResultThumbnail({ image, index, name, aspectRatio, eager = false, current = false, onSelect, onKeyDown }: {
  image: ResultImage; index: number; name: string; aspectRatio: number; eager?: boolean; current?: boolean;
  onSelect: () => void; onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
}) {
  const { t } = useLocale();
  const disabled = unavailable(image);
  return <button type="button" data-result-index={index} style={{ aspectRatio }}
    aria-label={`${t('查看大图')} · ${index + 1} · ${canvasMediaDisplayName(name)}`}
    aria-current={current ? 'true' : undefined} disabled={disabled}
    data-tooltip={disabled ? undefined : canvasMediaDisplayName(name)} data-tooltip-position="pointer-stationary"
    onClick={onSelect} onKeyDown={onKeyDown}>
    {disabled ? <TaskResultPlaceholder status={image.status as 'failed' | 'generating'} />
      : <ProgressiveImage src={image.url} alt="" eager={eager} fit="cover" />}
  </button>;
}

export function TaskRecordResults({ record, eager, onOpen, getResultName }: {
  record: GenerationRecord; eager: boolean; onOpen: (index: number) => void; getResultName: (index: number) => string;
}) {
  const { t, locale } = useLocale();
  const aspectRatio = useRecordResultRatio(record);
  const count = record.images.length || record.count || 1;
  const overflow = count > RECORD_RESULT_SLOTS;
  const shown = overflow ? RECORD_RESULT_SLOTS - 1 : count;
  const firstAvailable = record.images.findIndex(image => !unavailable(image));
  const viewAll = locale === 'en' ? 'View all' : locale === 'ja' ? 'すべて表示' : '查看全部';
  const countLabel = locale === 'en' ? `${count} images` : locale === 'ja' ? `${count}枚` : `${count} 张`;
  return <div className={`generation-record-images ${count >= 4 ? 'generation-record-images--four' : ''}`}>
    {record.images.length ? record.images.slice(0, shown).map((item, index) => <div className="generation-record-result" key={item.id ?? `${item.url}-${index}`} style={{ aspectRatio }}>
      {unavailable(item)
        ? <TaskResultPlaceholder status={item.status as 'failed' | 'generating'} />
        : <button className="generation-record-result-open" type="button" aria-label={`${t('查看大图')} · ${t(record.title)} ${index + 1}`} data-tooltip={canvasMediaDisplayName(getResultName(index))} data-tooltip-position="pointer-stationary" onClick={() => onOpen(index)}><ProgressiveImage src={item.url} alt="" eager={eager} fit="cover" /></button>}
    </div>) : Array.from({ length: shown }, (_, index) => <div className="generation-record-loading" key={index} style={{ aspectRatio }}><GeneratingPlaceholder style={{ inset: 0 }} /></div>)}
    {overflow && <div className="generation-record-result" style={{ aspectRatio }}>
      <button type="button" className="generation-record-result-open task-record-view-all" disabled={firstAvailable < 0}
        aria-label={`${viewAll} ${countLabel}`} onClick={() => onOpen(firstAvailable)}>
        <span>{viewAll}</span><span>{countLabel}</span>
      </button>
    </div>}
  </div>;
}
