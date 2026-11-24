import { cropMaterialGrid } from '../grid-crop';
import type { Locale } from '../i18n';
import { prepareMainImage } from './asset-library';
import { deleteDemoAsset, rememberDemoAsset } from './demo-storage';
import type { CanvasImage } from './useCanvas';

// The same pixel partitioning as Video and Flow, adapted to Canvas images and
// its local asset store. Commit only once all cells can be restored after reload.
export async function prepareGridSplitResults(
  source: Pick<CanvasImage, 'id' | 'name' | 'url'>, grid: 4 | 9, locale: Locale,
  isCurrent: () => boolean,
) {
  const crops = await cropMaterialGrid({ id: crypto.randomUUID(), grid,
    references: [{ ...source, sourceImageId: source.id, kind: 'image' }] }, locale);
  const persisted = new Set<string>();
  const discard = async () => {
    crops.forEach(crop => URL.revokeObjectURL(crop.url));
    await Promise.allSettled([...persisted].map(deleteDemoAsset));
  };
  try {
    const results: Omit<CanvasImage, 'x' | 'y'>[] = [];
    for (const crop of crops) {
      if (!isCurrent()) throw new DOMException('Grid split cancelled', 'AbortError');
      const result = await prepareMainImage({ id: crop.id, url: crop.url, name: crop.name, mimeType: 'image/png' });
      const blob = await fetch(crop.url).then(response => response.blob());
      await rememberDemoAsset(crop.url, blob);
      persisted.add(crop.url);
      results.push(result);
    }
    if (!isCurrent()) throw new DOMException('Grid split cancelled', 'AbortError');
    return { results, discard };
  } catch (error) {
    await discard();
    throw error;
  }
}
