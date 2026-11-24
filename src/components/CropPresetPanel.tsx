import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Locale } from '../i18n';
import { Button } from './ui';
import { GenerateTaskButton } from './GenerateTaskButton';
import { ToolbarHoverMenu } from './ToolbarHoverMenu';
import {
  CROP_PRESETS_CHANGED_EVENT, CROP_PRESETS_STORAGE_KEY, FREE_CROP_PRESET, MAX_CUSTOM_CROP_PRESETS, DEMO_MAX_CUSTOM_CROP_PRESET_EDGE,
  customCropPreset, readCustomCropPresets, saveCustomCropPresets, type CropPreset, type CustomCropPreset,
} from '../crop-presets';
import '../crop-preset-panel.css';
import { commerceCropPresets } from '../commerce-crop-presets';

export type { CropPreset } from '../crop-presets';

const copy = {
  'zh-CN': { title: '预设', add: '添加自定义预设', custom: '自定义预设 (px)', general: '通用', commerce: '电商商品图', social: '社媒封面', video: '短视频封面', website: '官网横幅', free: '自由', width: '宽', height: '高', cancel: '取消', confirm: '确认', edit: '编辑', remove: '删除', more: '更多', lock: '锁定宽高比', unlock: '解除宽高比锁定', invalid: '请输入有效的正整数宽高', submit: '开始 AI 生成', busy: '生成中…' },
  en: { title: 'Presets', add: 'Add custom preset', custom: 'Custom presets (px)', general: 'General', commerce: 'E-commerce images', social: 'Social covers', video: 'Video covers', website: 'Website banners', free: 'Free', width: 'Width', height: 'Height', cancel: 'Cancel', confirm: 'Save', edit: 'Edit', remove: 'Delete', more: 'More actions', lock: 'Lock aspect ratio', unlock: 'Unlock aspect ratio', invalid: 'Enter positive whole numbers for width and height', submit: 'Start AI generation', busy: 'Generating…' },
  ja: { title: 'プリセット', add: 'カスタムを追加', custom: 'カスタムプリセット (px)', general: '汎用', commerce: 'EC商品画像', social: 'SNSカバー', video: '動画カバー', website: 'Webサイトバナー', free: '自由', width: '幅', height: '高さ', cancel: '取消', confirm: '確定', edit: '編集', remove: '削除', more: 'その他の操作', lock: '縦横比を固定', unlock: '縦横比の固定を解除', invalid: '幅と高さに正の整数を入力してください', submit: 'AI生成を開始', busy: '生成中…' },
};

const presetLimitCopy = {
  'zh-CN': `最多添加${MAX_CUSTOM_CROP_PRESETS}个自定义预设，请删除后再添加`,
  en: `You can save up to ${MAX_CUSTOM_CROP_PRESETS} custom presets. Delete one before adding another.`,
  ja: `カスタムプリセットは${MAX_CUSTOM_CROP_PRESETS}件まで追加できます。削除してから追加してください。`,
};

const presetDimensionLimitCopy = {
  'zh-CN': `宽或高超过 ${DEMO_MAX_CUSTOM_CROP_PRESET_EDGE}px，请重新输入`,
  en: `Width or height exceeds ${DEMO_MAX_CUSTOM_CROP_PRESET_EDGE}px. Enter a smaller value.`,
  ja: `幅または高さが${DEMO_MAX_CUSTOM_CROP_PRESET_EDGE}pxを超えています。入力し直してください。`,
};

const groups = [
  { id: 'general', ratios: ['free', '1:1', '3:4', '2:3', '9:16', '4:3', '3:2', '16:9'] },
  { id: 'commerce', ratios: ['1:1'] },
  { id: 'social', ratios: ['3:4', '4:5'] },
  { id: 'video', ratios: ['9:16', '16:9'] },
  { id: 'website', ratios: ['21:9'] },
] as const;

function PresetIcon({ name, size = 20 }: { name: string; size?: 16 | 20 }) {
  // Reuse the Beta library's portrait icon for 5:6, which has no dedicated variant.
  const iconName = name === 'ratio-5-6' ? 'ratio-4-5' : name;
  return <span aria-hidden="true" className="icon crop-preset-icon" style={{ width: size, height: size,
    '--icon-url': `url("${import.meta.env.BASE_URL}assets/crop-presets-v57/${iconName}.svg")` } as CSSProperties} />;
}

function ratioPreset(group: string, ratio: string): CropPreset {
  if (ratio === 'free') return FREE_CROP_PRESET;
  const [width, height] = ratio.split(':').map(Number);
  const id = `${group}:${ratio}`;
  return { id, label: ratio, ratio: width / height };
}

function positiveInteger(value: string) {
  const number = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(number) && number > 0 ? number : null;
}

type PresetDraft = { id: string | null; width: string; height: string; ratio: number | null };
type Props = { locale: Locale; selectedId: string; onSelect: (preset: CropPreset) => void; submitDisabled: boolean; busy: boolean; onSubmit: () => void; onNotice: (message: string) => void; outputInfo?: ReactNode };

export function CropPresetPanel({ locale, selectedId, onSelect, submitDisabled, busy, onSubmit, onNotice, outputInfo }: Props) {
  const t = copy[locale], instanceId = useId();
  const [customPresets, setCustomPresets] = useState(readCustomCropPresets);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(() => customPresets.length > 0 ? 'custom' : 'general');
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const [formError, setFormError] = useState<'invalid' | 'tooLarge' | null>(null);
  const [moreId, setMoreId] = useState<string | null>(null);
  const widthInput = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const groupBeforeAdding = useRef<string | null>(null);
  const addingPreset = draft?.id === null;
  const validWidth = draft ? positiveInteger(draft.width) : null, validHeight = draft ? positiveInteger(draft.height) : null;
  const widthError = Boolean(formError && (!validWidth || validWidth > DEMO_MAX_CUSTOM_CROP_PRESET_EDGE));
  const heightError = Boolean(formError && (!validHeight || validHeight > DEMO_MAX_CUSTOM_CROP_PRESET_EDGE));
  const formErrorId = `${instanceId}-dimension-error`;
  const customExpanded = expandedGroup === 'custom', customBodyId = `${instanceId}-custom`;

  useEffect(() => {
    const sync = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== null && event.key !== CROP_PRESETS_STORAGE_KEY) return;
      if (event instanceof CustomEvent && event.detail?.source === instanceId) return;
      const next = readCustomCropPresets();
      setCustomPresets(next);
      setDraft(previous => previous?.id && !next.some(preset => preset.id === previous.id) ? { ...previous, id: null } : previous);
      setMoreId(previous => next.some(preset => preset.id === previous) ? previous : null);
      if (selectedId.startsWith('custom:')) {
        const selected = next.find(preset => preset.id === selectedId);
        const previous = customPresets.find(preset => preset.id === selectedId);
        if (!selected) { onSelect(FREE_CROP_PRESET); setExpandedGroup('general'); }
        else if (selected.outputWidth !== previous?.outputWidth || selected.outputHeight !== previous?.outputHeight) onSelect(selected);
      }
    };
    window.addEventListener('storage', sync);
    window.addEventListener(CROP_PRESETS_CHANGED_EVENT, sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener(CROP_PRESETS_CHANGED_EVENT, sync); };
  }, [instanceId, selectedId, onSelect, customPresets]);

  useEffect(() => { if (draft && customExpanded) widthInput.current?.focus(); }, [draft?.id, Boolean(draft), customExpanded]);

  useEffect(() => {
    if (!addingPreset) return;
    const cancelOnBlank = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      const target = event.target;
      const scope = panelRef.current?.closest('.crop-editor') ?? panelRef.current;
      if (!scope?.contains(target) || formRef.current?.contains(target)) return;
      // Disabled options are still controls, not blank space. Keep the draft
      // when they are clicked, and leave crop dragging and zoom controls alone.
      if (target.closest('button, a, input, textarea, select, [role="button"], [role="menu"], [contenteditable="true"], .crop-custom-preset, .crop-editor-image')) return;
      setDraft(null); setFormError(null); setExpandedGroup(groupBeforeAdding.current); onNotice('');
    };
    document.addEventListener('pointerdown', cancelOnBlank, true);
    return () => document.removeEventListener('pointerdown', cancelOnBlank, true);
  }, [addingPreset, onNotice]);

  function cancelDraft() {
    if (addingPreset) setExpandedGroup(groupBeforeAdding.current);
    setDraft(null); setFormError(null); onNotice('');
  }
  function selectPreset(preset: CropPreset) {
    if (addingPreset) return;
    setMoreId(null);
    onSelect(preset);
  }
  function toggleGroup(group: string) {
    if (addingPreset) return;
    setMoreId(null);
    setExpandedGroup(current => current === group ? null : group);
  }
  function updatePresets(next: CustomCropPreset[]) {
    setCustomPresets(next);
    saveCustomCropPresets(next, instanceId);
  }
  function beginDraft(preset?: CustomCropPreset) {
    if (addingPreset) return;
    if (!preset && customPresets.length >= MAX_CUSTOM_CROP_PRESETS) { onNotice(presetLimitCopy[locale]); return; }
    if (!preset) groupBeforeAdding.current = expandedGroup;
    onNotice('');
    setMoreId(null); setFormError(null);
    setExpandedGroup('custom');
    setDraft({ id: preset?.id ?? null, width: preset ? String(preset.outputWidth) : '', height: preset ? String(preset.outputHeight) : '', ratio: null });
  }
  function changeDimension(field: 'width' | 'height', value: string) {
    if (!/^\d*$/.test(value)) return;
    setFormError(null);
    setDraft(previous => {
      if (!previous) return previous;
      const next = { ...previous, [field]: value };
      const number = positiveInteger(value);
      if (previous.ratio && number) {
        const other = Math.max(1, Math.round(field === 'width' ? number / previous.ratio : number * previous.ratio));
        next[field === 'width' ? 'height' : 'width'] = String(other);
      }
      return next;
    });
  }
  function confirmDraft() {
    if (!draft || !validWidth || !validHeight) { setFormError('invalid'); return; }
    if (validWidth > DEMO_MAX_CUSTOM_CROP_PRESET_EDGE || validHeight > DEMO_MAX_CUSTOM_CROP_PRESET_EDGE) {
      setFormError('tooLarge'); return;
    }
    const duplicate = customPresets.find(preset => preset.id !== draft.id && preset.outputWidth === validWidth && preset.outputHeight === validHeight);
    const editingExisting = draft.id && customPresets.some(item => item.id === draft.id);
    if (!editingExisting && !duplicate && customPresets.length >= MAX_CUSTOM_CROP_PRESETS) { onNotice(presetLimitCopy[locale]); return; }
    const preset = duplicate ?? customCropPreset(draft.id ?? `custom:${crypto.randomUUID()}`, validWidth, validHeight);
    const next = editingExisting
      ? duplicate ? customPresets.filter(item => item.id !== draft.id) : customPresets.map(item => item.id === draft.id ? preset : item)
      : duplicate ? customPresets : [preset, ...customPresets];
    updatePresets(next);
    onNotice('');
    setDraft(null); setFormError(null); setExpandedGroup('custom'); onSelect(preset);
  }
  function removePreset(preset: CustomCropPreset) {
    if (addingPreset) return;
    onNotice('');
    setMoreId(null);
    updatePresets(customPresets.filter(item => item.id !== preset.id));
    if (selectedId === preset.id) { selectPreset(FREE_CROP_PRESET); setExpandedGroup('general'); }
  }

  const form = draft && <form ref={formRef} className="crop-preset-form" onSubmit={event => { event.preventDefault(); confirmDraft(); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelDraft(); } }}>
    <div className="crop-preset-form-row">
      <div className="crop-preset-dimensions">
        <label className="crop-preset-input" data-component="Input" data-invalid={widthError || undefined}><span>W</span>
          <input ref={widthInput} aria-label={`${t.width} (px)`} aria-invalid={widthError || undefined} aria-describedby={widthError ? formErrorId : undefined} inputMode="numeric" autoComplete="off" placeholder={t.width} value={draft.width} onChange={event => changeDimension('width', event.target.value)} />
        </label>
        <Button className="crop-preset-ratio-lock" aria-label={draft.ratio ? t.unlock : t.lock} title={draft.ratio ? t.unlock : t.lock} aria-pressed={Boolean(draft.ratio)}
          disabled={!draft.ratio && (!validWidth || !validHeight)} onClick={() => setDraft(previous => previous ? { ...previous, ratio: previous.ratio ? null : validWidth! / validHeight! } : null)}>
          <PresetIcon name={draft.ratio ? 'locked' : 'unlocked'} size={16} />
        </Button>
        <label className="crop-preset-input" data-component="Input" data-invalid={heightError || undefined}><span>H</span>
          <input aria-label={`${t.height} (px)`} aria-invalid={heightError || undefined} aria-describedby={heightError ? formErrorId : undefined} inputMode="numeric" autoComplete="off" placeholder={t.height} value={draft.height} onChange={event => changeDimension('height', event.target.value)} />
        </label>
      </div>
      <div className="crop-preset-form-actions">
        <Button variant="secondary" onClick={cancelDraft}>{t.cancel}</Button>
        <Button variant="primary" type="submit" disabled={!validWidth || !validHeight}>{t.confirm}</Button>
      </div>
    </div>
    {formError && <p id={formErrorId} className="crop-preset-error" role="alert">{formError === 'tooLarge' ? presetDimensionLimitCopy[locale] : t.invalid}</p>}
  </form>;

  return <aside ref={panelRef} className="crop-preset-panel" aria-label={t.title} data-node-id="8:641" lang={locale}>
    <header className="crop-preset-header"><h2>{t.title}</h2>
      <Button className="crop-preset-add" disabled={Boolean(draft) || busy} onClick={() => beginDraft()}><PresetIcon name="add" size={16} />{t.add}</Button>
    </header>
    <div className="crop-preset-scroll" inert={busy}>
      {(draft || customPresets.length > 0) && <section className="crop-preset-group crop-custom-presets" aria-label={t.custom} data-expanded={customExpanded} data-node-id="26:2478">
        <Button className="crop-preset-accordion" disabled={addingPreset} aria-expanded={customExpanded} aria-controls={customBodyId} onClick={() => toggleGroup('custom')}>
          <span>{t.custom}</span><PresetIcon name={customExpanded ? 'chevron-down' : 'chevron-right'} size={16} />
        </Button>
        <div id={customBodyId} className="crop-preset-group-body" aria-hidden={!customExpanded} inert={!customExpanded}>
          <div className="crop-preset-group-clip"><div className="crop-preset-options crop-custom-preset-list">
          {draft && !draft.id && form}
          {customPresets.map(preset => draft?.id === preset.id ? <div key={preset.id}>{form}</div> :
            <div key={preset.id} className="crop-custom-preset" data-selected={selectedId === preset.id} data-menu-open={moreId === preset.id} data-disabled={addingPreset || undefined}>
              <Button className="crop-custom-preset-select" disabled={addingPreset} aria-pressed={selectedId === preset.id} onClick={() => selectPreset(preset)}><span>{preset.label}</span></Button>
              {!addingPreset && <ToolbarHoverMenu label={t.more} icon={<PresetIcon name="more" size={16} />} iconOnly openOnHover={false} chevron={null} group={instanceId} nodeId="32:4006"
                className="crop-preset-more-control" open={moreId === preset.id} onOpenChange={value => setMoreId(current => value ? preset.id : current === preset.id ? null : current)}
                items={[
                  { label: t.edit, icon: <span className="crop-preset-menu-icon-slot"><PresetIcon name="edit" size={16} /></span>, onSelect: () => beginDraft(preset) },
                  { label: t.remove, icon: <PresetIcon name="delete" />, onSelect: () => removePreset(preset) },
                ]} />}
            </div>)}
          </div></div>
        </div>
      </section>}
      {groups.map(group => {
        const expanded = expandedGroup === group.id;
        const bodyId = `${instanceId}-${group.id}`;
        return <section className="crop-preset-group" key={group.id} data-expanded={expanded}>
          <Button className="crop-preset-accordion" disabled={addingPreset} aria-expanded={expanded} aria-controls={bodyId} onClick={() => toggleGroup(group.id)}>
            <span>{t[group.id]}</span><PresetIcon name={expanded ? 'chevron-down' : 'chevron-right'} size={16} />
          </Button>
          <div id={bodyId} className="crop-preset-group-body" aria-hidden={!expanded} inert={!expanded}>
            <div className="crop-preset-group-clip"><div className="crop-preset-options">
              {group.id === 'commerce' ? commerceCropPresets(locale).map(preset =>
                <Button className="crop-preset-option crop-commerce-option" disabled={addingPreset} key={preset.id} aria-pressed={selectedId === preset.id} onClick={() => selectPreset(preset)}>
                  <PresetIcon name={`ratio-${preset.ratioLabel!.replace(':', '-')}`} />
                  <span className="crop-commerce-option-copy"><span>{preset.label} · {preset.ratioLabel}</span>
                    <span className="crop-commerce-dimensions">{preset.outputWidth}×{preset.outputHeight} px</span>
                  </span>
                </Button>
              ) : group.ratios.map(ratio => {
                const preset = ratioPreset(group.id, ratio);
                return <Button className="crop-preset-option" disabled={addingPreset} key={ratio} aria-pressed={selectedId === preset.id} onClick={() => selectPreset(preset)}>
                  <PresetIcon name={ratio === 'free' ? 'free' : `ratio-${ratio.replace(':', '-')}`} />
                  <span>{ratio === 'free' ? t.free : ratio}</span>
                </Button>;
              })}
            </div></div>
          </div>
        </section>;
      })}
    </div>
    <footer className="crop-preset-footer">{outputInfo}<GenerateTaskButton label={busy ? t.busy : t.submit} className="crop-preset-submit" disabled={submitDisabled || busy || Boolean(draft)} aria-busy={busy} onClick={onSubmit} /></footer>
  </aside>;
}
