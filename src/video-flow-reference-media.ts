import { createFlowReferenceBinder } from './flow-reference-media';
import { materialWorkflowBox, materialWorkflowHasBackView, type MaterialWorkflow } from './material-workflow';
import { videoWorkflowBox, type VideoWorkflow, type VideoReference } from './video-workflow';
import { videoUpscaleWorkflowBox, type VideoUpscaleWorkflow } from './video-upscale-workflow';
import { sizeVideoCanvasMedia, type VideoCanvasMedia } from './video-canvas-media';

type Scene = { images: VideoCanvasMedia[]; workflows: VideoWorkflow[]; materialWorkflows?: MaterialWorkflow[]; upscaleWorkflows?: VideoUpscaleWorkflow[] };

// New video uploads already create connected media. This also upgrades older
// editor-only image slots, including first/end frames and multi-view back images.
export function materializeVideoReferences<T extends Scene>(scene: T): T {
  const { bind, added } = createFlowReferenceBinder(scene.images, [...scene.images,
    ...scene.workflows.map(videoWorkflowBox), ...(scene.materialWorkflows ?? []).map(materialWorkflowBox),
    ...(scene.upscaleWorkflows ?? []).map(videoUpscaleWorkflowBox)], sizeVideoCanvasMedia);
  let changed = false;
  const workflows = scene.workflows.map(node => {
    const box = videoWorkflowBox(node);
    const main = node.main ? bind(box, node.main) : undefined;
    const endFrame = node.mode === 'frames' && node.endFrame?.kind === 'image' ? bind(box, node.endFrame) : node.endFrame;
    const references = node.references.map(reference => node.mode === 'references' && reference.kind === 'image'
      ? bind(box, reference) : reference);
    if (main === node.main && endFrame === node.endFrame && references.every((reference, index) => reference === node.references[index])) return node;
    changed = true;
    return { ...node, main, endFrame, references };
  });
  const materialWorkflows = scene.materialWorkflows?.map(node => {
    const box = materialWorkflowBox(node);
    const bindImage = (reference: VideoReference) => reference.kind === 'image' ? bind(box, reference) : reference;
    const references = node.references.map(bindImage);
    const back = materialWorkflowHasBackView(node) && node.back ? bindImage(node.back) : node.back;
    if (back === node.back && references.every((reference, index) => reference === node.references[index])) return node;
    changed = true;
    return { ...node, references, back };
  });
  return changed || added.length ? { ...scene, images: [...scene.images, ...added], workflows, materialWorkflows } : scene;
}
