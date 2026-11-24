import { prepareMainImage } from './asset-library';
import { createBatchEditor, newFusionSettings, FUSION_WIDTH, FUSION_GAP, workflowHeight, type CanvasImage, type WorkflowKind } from './canvas';
import { FLOW_BRANCH_GAP } from './canvas-connected-layout';
import type { Locale } from './i18n';

// Local onboarding fixtures: the images illustrate a workflow, not a live AI run.
const examples = {
  fusion: {
    title: '一键融合',
    main: { name: '乳白色蕾丝家居服套装 · 示例参考图', url: '/assets/workflow-examples/fusion-loungewear.png' },
    reference: null,
    result: { name: '复古卧室家居服大片 · 一键融合演示', url: '/assets/workflow-examples/fusion-loungewear-result.png' },
    prompt: '视觉主旨： 高端时尚社论，一位拥有空灵气质的模特双腿自然叠放坐在复古单人沙发上。 核心焦点： 姜黄色自然短发。模特身着图中服饰。 环境细节： 70年代复古风格卧室，乳白色淡淡的碎花壁纸，复古格纹沙发，旁边有复古木制床头柜和黄铜灯杆的布艺灯罩台灯。 摄影标准： 采用35mm高端电影镜头，光线明亮干净、阴影浅淡自然，主光从模特正面 45° 角打光，辅光弱化阴影，无强烈明暗对比，整体光线均匀通透，画面色彩饱，高宽容度，呈现出极致的细节纹理。没有任何病态感，整体氛围是空灵、温馨、自然随性的艺术瞬间。',
  },
  directed: {
    title: '定向融合',
    main: { name: '黑色无袖上衣模特 · 示例主图', url: '/assets/workflow-examples/directed-neckline-main.png' },
    reference: { name: '细吊带弧形领口 · 示例参考图', url: '/assets/workflow-examples/directed-neckline-reference.png' },
    result: { name: '细吊带领口局部融合 · 示例结果', url: '/assets/workflow-examples/directed-neckline-result.jpg' },
    prompt: '',
  },
  flat: {
    title: '转3D平铺',
    main: { name: '蓝色条纹衬衫连衣裙 · 示例主图', url: '/assets/workflow-examples/flat-blue-stripe-main.png' },
    reference: null,
    result: { name: '蓝色条纹连衣裙3D平铺 · 演示结果', url: '/assets/workflow-examples/flat-blue-stripe-result.jpg' },
    prompt: '',
  },
  lingerie: {
    title: '内衣试衣',
    main: { name: '黄紫拼色内衣套装 · 示例主图', url: '/assets/workflow-examples/lingerie-product.jpeg' },
    reference: { name: '金发模特 · 示例参考图', url: '/assets/workflow-examples/lingerie-model.png' },
    result: { name: '黄紫拼色内衣上身 · 试衣演示', url: '/assets/workflow-examples/lingerie-result.png' },
    prompt: '将主图中的黄紫拼色内衣套装穿到参考模特身上，保留淡黄色蕾丝、浅紫色罩杯、黑色肩带与包边，以及配套高腰内裤的拼色和侧边镂空细节。保留模特的金色长发、双臂抬起的姿势，搭配暖桃色背景与粉色球形布景，呈现自然贴合、柔和光影的内衣产品大片。',
  },
} satisfies Record<Exclude<WorkflowKind, 'merge' | 'batch' | 'gridSplit'>, unknown>;

const batchTryOnPath = '/assets/workflow-examples/batch-try-on';
const batchTryOnGarments = [
  { file: '01', 'zh-CN': '鼠尾草绿系带衬衫裙', en: 'Sage belted shirt dress', ja: 'セージグリーンのベルト付きシャツワンピース' },
  { file: '02', 'zh-CN': '象牙白西装马甲裙', en: 'Ivory tailored vest dress', ja: 'アイボリーのテーラードベストワンピース' },
  { file: '03', 'zh-CN': '海军蓝无袖中长裙', en: 'Navy sleeveless midi dress', ja: 'ネイビーのノースリーブミディワンピース' },
  { file: '04', 'zh-CN': '陶土色亚麻裹身裙', en: 'Terracotta linen wrap dress', ja: 'テラコッタのリネンラップワンピース' },
  { file: '05', 'zh-CN': '蓝白条纹衬衫裙', en: 'Blue striped shirt dress', ja: 'ブルーストライプのシャツワンピース' },
];
const batchTryOnCopy = {
  'zh-CN': { title: '批量编辑', model: '统一模特参考图', prompt: '将5张主图中的服装分别穿到参考图的同一位模特身上，每件服装生成1张独立结果。准确保留各款服装的颜色、面料、版型、领口、袖型、纽扣和腰带细节；保持模特的脸部、发型、身材、站姿、鞋履、构图、背景与光线一致。全身正面展示，服装自然贴合，呈现清晰、真实的时装产品摄影。' },
  en: { title: 'Batch edit', model: 'Shared model reference', prompt: 'Dress the same reference model in each of the five main garment images, producing one separate result per garment. Preserve each garment’s color, fabric, silhouette, neckline, sleeves, buttons and belt. Keep the model’s face, hair, body, standing pose, footwear, framing, background and lighting consistent. Show a full-body front view with a natural fit and clear, realistic fashion product photography.' },
  ja: { title: '一括編集', model: '共通のモデル参考画像', prompt: '5枚のメイン画像の服を、参考画像の同じモデルに1着ずつ着せ、各服につき1枚の結果を生成してください。各服の色、素材、シルエット、襟、袖、ボタン、ベルトの細部を保ってください。モデルの顔、髪型、体型、立ち姿、靴、構図、背景、照明は統一し、自然な着用感のある鮮明な全身正面の商品写真にしてください。' },
};

// Preserve each supplied result image’s original aspect ratio.
export function workflowExampleResult(kind: Exclude<WorkflowKind, 'gridSplit'>, inputUrl?: string) {
  if (kind === 'batch') {
    const garment = batchTryOnGarments.find(item => inputUrl === `${batchTryOnPath}/garment-${item.file}.jpg`);
    if (garment) return { name: `${garment['zh-CN']} · 批量编辑演示`, url: `${batchTryOnPath}/result-${garment.file}.jpg`, width: 360, height: 540 };
  }
  if (kind === 'merge' || kind === 'batch') return { ...examples.fusion.result, name: kind === 'batch' ? '批量编辑结果 · 演示' : '合拼生图结果 · 演示', width: 360, height: 360 * 2400 / 1792 };
  return { ...examples[kind].result, width: 360, height: kind === 'lingerie' ? 360 * 1064 / 794 : kind === 'fusion' ? 360 * 2400 / 1792 : 540 };
}

export async function createWorkflowExample(kind: Exclude<WorkflowKind, 'merge' | 'gridSplit'>, locale: Locale = 'zh-CN'): Promise<CanvasImage[]> {
  if (kind === 'batch') {
    const copy = batchTryOnCopy[locale];
    const [mains, model, outputs] = await Promise.all([
      Promise.all(batchTryOnGarments.map(garment => prepareMainImage({ id: `batch-main-${garment.file}`, name: garment[locale], url: `${batchTryOnPath}/garment-${garment.file}.jpg` }))),
      prepareMainImage({ id: 'batch-model', name: copy.model, url: `${batchTryOnPath}/model.jpg` }),
      Promise.all(batchTryOnGarments.map(garment => prepareMainImage({ id: `batch-result-${garment.file}`, name: `${garment[locale]} · ${copy.title}`, url: `${batchTryOnPath}/result-${garment.file}.jpg` }))),
    ]);
    let inputY = 0;
    const inputs: CanvasImage[] = mains.map(main => {
      const input = { ...main, role: undefined, x: 0, y: inputY };
      inputY += main.height + FLOW_BRANCH_GAP;
      return input;
    });
    const editor = createBatchEditor(inputs, inputs.map(input => input.id), crypto.randomUUID())!;
    editor.name = copy.title;
    editor.fusion = { ...editor.fusion!, prompt: copy.prompt, references: [{ id: model.id, name: model.name, url: model.url }] };
    let outputY = 0;
    return [...inputs, editor, ...outputs.map((output, index) => {
      const result = { ...output, role: undefined, x: editor.x + editor.width + FUSION_GAP, y: outputY,
        generatedByEditorId: editor.id, generatedFromReferenceId: inputs[index].id };
      outputY += output.height + FLOW_BRANCH_GAP;
      return result;
    })];
  }
  const example = examples[kind];
  const [main, reference, output] = await Promise.all([
    prepareMainImage({ id: 'example-main', ...example.main }),
    example.reference ? prepareMainImage({ id: 'example-reference', ...example.reference }) : null,
    prepareMainImage({ id: 'example-result', ...example.result }),
  ]);
  const editorId = crypto.randomUUID();
  const referenceImage = reference ? { id: reference.id, name: reference.name, url: reference.url } : undefined;
  const fusion = {
    ...newFusionSettings(kind), prompt: example.prompt, position: { x: 440, y: 0 },
    ...(kind === 'flat' ? { flatRegion: 'full' as const } : {}),
    ...(kind === 'directed' && referenceImage
      ? { directedPoints: [{ id: crypto.randomUUID(), reference: referenceImage, maskPreviewUrl: '/assets/workflow-examples/directed-neckline-mask.png', maskSourceUrl: main.url }] }
      : { references: kind === 'fusion'
        ? [{ id: main.id, sourceImageId: main.id, name: main.name, url: main.url }, ...(referenceImage ? [referenceImage] : [])]
        : referenceImage ? [referenceImage] : [] }),
  };
  return [
    { ...main, x: 0, y: 0, role: kind === 'fusion' ? undefined : 'main' },
    { id: editorId, name: example.title, url: '', nodeOnly: true, editorSourceId: kind === 'fusion' ? undefined : main.id,
      x: 440, y: 0, width: FUSION_WIDTH, height: workflowHeight(fusion), fusion },
    { ...output, role: undefined, x: 800, y: 0, generatedByEditorId: editorId },
  ];
}
