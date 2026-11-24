import { canvasNodes, fusionPosition, fusionReferences, workflowHeight, workflowWidth, type CanvasImage, type FusionReference } from './canvas';
import { FLOW_BRANCH_GAP } from './canvas-connected-layout';

type EditorBox = Pick<CanvasImage, 'id' | 'x' | 'y' | 'width' | 'height'>;
type MediaSizer = (image: CanvasImage) => CanvasImage;

// Materialize embedded references once, in the same snapshot as their editor.
// Existing canvas bindings are reused; repeated normalization adds no duplicates.
export function createFlowReferenceBinder(images: CanvasImage[], scene: EditorBox[], sizeMedia?: MediaSizer) {
  const byId = new Map(images.filter(image => !image.nodeOnly).map(image => [image.id, image]));
  const occupied = [...scene];
  const added: CanvasImage[] = [];
  const unbound = new Map<string, CanvasImage>();
  function bind<T extends FusionReference>(editor: EditorBox, reference: T): T {
    if (!reference.url) return reference;
    const candidate = byId.get(reference.sourceImageId ?? reference.id);
    let source = candidate && (reference.sourceImageId || candidate.url === reference.url) ? candidate : undefined;
    const key = `${editor.id}:${reference.id}:${reference.url}`;
    source ??= unbound.get(key);
    if (!source) {
      const metadata = images.find(image => !image.nodeOnly && image.url === reference.url);
      const naturalWidth = reference.naturalWidth ?? metadata?.naturalWidth;
      const naturalHeight = reference.naturalHeight ?? metadata?.naturalHeight;
      const pixelWidth = naturalWidth || reference.width || metadata?.width || 360;
      const pixelHeight = naturalHeight || reference.height || metadata?.height || pixelWidth;
      const width = Math.min(360, pixelWidth), height = width * pixelHeight / pixelWidth;
      const base = `${editor.id}:reference:${reference.id}`;
      let id = base, suffix = 2;
      while (occupied.some(item => item.id === id)) id = `${base}:${suffix++}`;
      source = { id, referencePendingDimensions: !(naturalWidth && naturalHeight), name: reference.name, url: reference.url, width, height, naturalWidth, naturalHeight,
        x: editor.x - 80 - width, y: editor.y + (editor.height - height) / 2 };
      if (sizeMedia) {
        source = sizeMedia(source);
        source = { ...source, x: editor.x - 80 - source.width, y: editor.y + (editor.height - source.height) / 2 };
      }
      let overlaps: EditorBox[];
      while ((overlaps = occupied.filter(item => source!.x < item.x + item.width + 40
        && source!.x + source!.width + 40 > item.x && source!.y < item.y + item.height + FLOW_BRANCH_GAP
        && source!.y + source!.height + FLOW_BRANCH_GAP > item.y)).length) {
        source.y = Math.max(...overlaps.map(item => item.y + item.height)) + FLOW_BRANCH_GAP;
      }
      added.push(source); occupied.push(source); byId.set(id, source); unbound.set(key, source);
    }
    if (reference.sourceImageId === source.id && reference.name === source.name && reference.url === source.url) return reference;
    return { ...reference, sourceImageId: source.id, name: source.name, url: source.url,
      width: source.width, height: source.height, naturalWidth: source.naturalWidth, naturalHeight: source.naturalHeight };
  }
  return { bind, added };
}

export function materializeFusionReferences(items: CanvasImage[]): CanvasImage[] {
  const { bind, added } = createFlowReferenceBinder(items, canvasNodes(items));
  let changed = false;
  const next = items.map(item => {
    if (!item.fusion) return item;
    const editor = { id: item.id, ...fusionPosition(item), width: workflowWidth(item.fusion), height: workflowHeight(item.fusion) };
    const original = fusionReferences(item.fusion);
    const references = original.map(reference => bind(editor, reference));
    const mainImages = item.fusion.mainImages?.map(reference => bind(editor, reference));
    const directedPoints = item.fusion.directedPoints?.map(point => {
      const reference = bind(editor, point.reference);
      return reference === point.reference ? point : { ...point, reference };
    });
    if (references.every((reference, index) => reference === original[index])
      && mainImages?.every((reference, index) => reference === item.fusion!.mainImages![index]) !== false
      && directedPoints?.every((point, index) => point === item.fusion!.directedPoints![index]) !== false) return item;
    changed = true;
    return { ...item, fusion: { ...item.fusion, references, reference: undefined, mainImages, directedPoints } };
  });
  return changed || added.length ? [...next, ...added] : items;
}

// Old embedded references may have no dimensions. Decode their visible image,
// then size it using the same 360px rule as uploads, preserving its right edge.
export function sizeFlowReferenceImage<T extends CanvasImage>(image: T, width: number, height: number, scene: EditorBox[], sizeMedia?: MediaSizer): T {
  if (!image.referencePendingDimensions || (image.naturalWidth && image.naturalHeight) || width <= 0 || height <= 0) return image;
  if (image.positionPinned) return { ...image, referencePendingDimensions: false, naturalWidth: width, naturalHeight: height };
  const defaultWidth = Math.min(360, width);
  const measured = { ...image, naturalWidth: width, naturalHeight: height, width: defaultWidth, height: defaultWidth * height / width };
  const size = sizeMedia?.(measured) ?? measured;
  const nextWidth = size.width, nextHeight = size.height;
  const next = { ...image, x: image.x + image.width - nextWidth, y: image.y + (image.height - nextHeight) / 2,
    width: nextWidth, height: nextHeight, referencePendingDimensions: false, naturalWidth: width, naturalHeight: height };
  let overlaps: EditorBox[];
  while ((overlaps = scene.filter(item => item.id !== image.id && next.x < item.x + item.width + 40
    && next.x + next.width + 40 > item.x && next.y < item.y + item.height + FLOW_BRANCH_GAP
    && next.y + next.height + FLOW_BRANCH_GAP > item.y)).length) {
    next.y = Math.max(...overlaps.map(item => item.y + item.height)) + FLOW_BRANCH_GAP;
  }
  return next;
}
