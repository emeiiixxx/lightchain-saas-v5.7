import { fusionPosition, fusionReferences, workflowHeight, workflowWidth, FUSION_GAP, type CanvasImage } from './canvas';
import { FLOW_BRANCH_GAP } from './canvas-connected-layout';
import type { MaterialWorkflow } from './material-workflow';

// Adapt the fusion canvas record to the existing video-workspace component and
// pixel cropper. Keep grid configuration and image processing in one place.
export function fusionGridSplitWorkflow(editor: CanvasImage): MaterialWorkflow {
  return {
    id: editor.id, ...fusionPosition(editor), kind: 'gridSplit',
    references: fusionReferences(editor.fusion).map(reference => ({ ...reference, kind: 'image' as const })),
    grid: editor.fusion?.grid ?? 4, view: ['front'], prompt: '',
    smartExpand: false, ratio: 'auto', resolution: '2K', count: 1,
  };
}

export function fusionGridSplitInputKey(editor?: CanvasImage): string | null {
  if (editor?.fusion?.kind !== 'gridSplit') return null;
  const reference = fusionReferences(editor.fusion)[0];
  return reference ? JSON.stringify([editor.fusion.grid ?? 4, reference.id, reference.sourceImageId, reference.url]) : null;
}

export function placeFusionGridResults(editor: CanvasImage, crops: Omit<CanvasImage, 'x' | 'y'>[]): CanvasImage[] {
  const position = fusionPosition(editor);
  // Retain intrinsic pixels; only the canvas display uses the fusion image size.
  const sizes = crops.map(crop => {
    const width = Math.min(360, crop.naturalWidth ?? crop.width);
    return { width, height: width * (crop.naturalHeight ?? crop.height) / (crop.naturalWidth ?? crop.width) };
  });
  const totalHeight = sizes.reduce((sum, size) => sum + size.height, 0) + Math.max(0, crops.length - 1) * FLOW_BRANCH_GAP;
  let y = position.y + (workflowHeight(editor.fusion) - totalHeight) / 2;
  return crops.map((crop, index) => {
    const result = { ...crop, ...sizes[index], x: position.x + workflowWidth(editor.fusion) + FUSION_GAP, y, generatedByEditorId: editor.id };
    y += result.height + FLOW_BRANCH_GAP;
    return result;
  });
}
