export type CropPreset = {
  id: string; label: string; ratio: number | null; outputWidth?: number; outputHeight?: number;
  kind?: 'commerce'; ratioLabel?: string; outputMimeType?: 'image/png' | 'image/jpeg'; maxOutputBytes?: number;
};
export type CustomCropPreset = CropPreset & { outputWidth: number; outputHeight: number };

export const FREE_CROP_PRESET: CropPreset = { id: 'free', label: '自由', ratio: null };
export const MAX_CUSTOM_CROP_PRESETS = 5;
export const MIN_CUSTOM_CROP_PRESET_EDGE = 100;
// Demo-only upper limit; the production maximum awaits development confirmation.
export const DEMO_MAX_CUSTOM_CROP_PRESET_EDGE = 9000;
export const CROP_PRESETS_STORAGE_KEY = 'lc-v57-crop-presets';
export const CROP_PRESETS_CHANGED_EVENT = 'lc-v57-crop-presets-changed';

export function customCropPreset(id: string, width: number, height: number): CustomCropPreset {
  return { id, label: `${width}*${height}`, ratio: width / height, outputWidth: width, outputHeight: height };
}

export function readCustomCropPresets(): CustomCropPreset[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CROP_PRESETS_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(saved)) return [];
    const ids = new Set<string>();
    return saved.flatMap(value => {
      if (!value || typeof value !== 'object') return [];
      const { id, outputWidth: width, outputHeight: height } = value;
      if (typeof id !== 'string' || !id.startsWith('custom:') || ids.has(id)
        || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return [];
      ids.add(id);
      return [customCropPreset(id, width, height)];
    });
  } catch { return []; }
}

export function saveCustomCropPresets(presets: CustomCropPreset[], source: string): void {
  try {
    localStorage.setItem(CROP_PRESETS_STORAGE_KEY, JSON.stringify(presets));
    window.dispatchEvent(new CustomEvent(CROP_PRESETS_CHANGED_EVENT, { detail: { source } }));
  } catch { /* Keep the current editor's presets available when local storage is full. */ }
}
