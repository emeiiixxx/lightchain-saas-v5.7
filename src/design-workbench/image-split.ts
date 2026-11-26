import { canvasMediaDisplayName } from '../canvas-media-filename';
import type { Locale } from '../i18n';
import type { SplitResult } from '../image-split';
import { prepareMainImage } from './asset-library';
import { deleteDemoAsset, rememberDemoAsset } from './demo-storage';
import type { CanvasImage } from './useCanvas';

// Prepare the complete batch before adding anything to the canvas. The editor
// already rendered each selected cell at its original pixel dimensions.
export async function prepareImageSplitResults(
  source: Pick<CanvasImage, 'name'>, pieces: SplitResult[], locale: Locale,
  isCurrent: () => boolean,
) {
  const urls: string[] = [];
  const persisted = new Set<string>();
  const assertCurrent = () => {
    if (!isCurrent()) throw new DOMException('Image split cancelled', 'AbortError');
  };
  const discard = async () => {
    urls.forEach(url => URL.revokeObjectURL(url));
    await Promise.allSettled([...persisted].map(deleteDemoAsset));
  };
  try {
    assertCurrent();
    if (!pieces.length) throw new Error('No image split results');
    const results: Omit<CanvasImage, 'x' | 'y'>[] = [];
    const label = locale === 'en' ? 'Split Image' : locale === 'ja' ? '画像分割' : '图片切分';
    for (const piece of pieces) {
      assertCurrent();
      const url = URL.createObjectURL(piece.blob);
      urls.push(url);
      const result = await prepareMainImage({ id: crypto.randomUUID(), url,
        name: `${canvasMediaDisplayName(source.name)}-${label}-${piece.index + 1}.png`, mimeType: 'image/png' });
      assertCurrent();
      await rememberDemoAsset(url, piece.blob);
      persisted.add(url);
      results.push(result);
    }
    assertCurrent();
    return { results, discard };
  } catch (error) {
    await discard();
    throw error;
  }
}
