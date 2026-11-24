import type { CropPreset } from './crop-presets';
import type { Locale } from './i18n';

type Localized = Record<Locale, string>;
type CommerceDefinition = {
  id: string; label: Localized;
  width: number; height: number; ratio: string;
  maxBytes?: number; sourceUrl?: string;
};

// Pixel suggestions are application defaults unless the source explicitly
// specifies them. They are not a claim of category/content upload compliance.
// Sources and their scope are recorded beside the presets (reviewed 2026-11-24).
const definitions: CommerceDefinition[] = [
  {
    id: 'taobao-square', width: 1600, height: 1600, ratio: '1:1',
    label: { 'zh-CN': '淘宝/天猫', en: 'Taobao / Tmall', ja: '淘宝/天猫' },
    sourceUrl: 'https://developer.alibaba.com/support/announcementDetail.htm?id=25721&source=search',
  },
  {
    // The upload guidance recommends a 1440 px width; retain an exact 3:4 ratio.
    id: 'taobao-portrait', width: 1440, height: 1920, ratio: '3:4',
    label: { 'zh-CN': '淘宝/天猫', en: 'Taobao / Tmall', ja: '淘宝/天猫' },
    sourceUrl: 'https://developer.alibaba.com/support/announcementDetail.htm?id=25787&source=search',
  },
  {
    // JD's current public main-image visual guide recommends 800×800, up to 3 MB.
    id: 'jd-square', width: 800, height: 800, ratio: '1:1', maxBytes: 3_000_000,
    label: { 'zh-CN': '京东', en: 'JD', ja: '京東' },
    sourceUrl: 'https://pro.jd.com/mall/active/SLULn5voab5iB92t9ZLCDUCTBks/index.html',
  },
  {
    id: 'douyin-fashion-recommendations', width: 800, height: 800, ratio: '1:1', maxBytes: 3_000_000,
    label: { 'zh-CN': '抖音', en: 'Douyin', ja: '抖音' },
    sourceUrl: 'https://school.jinritemai.com/doudian/web/articlev0/aJdDJTsTH6E4',
  },
  {
    id: 'amazon-square', width: 2000, height: 2000, ratio: '1:1',
    label: { 'zh-CN': 'Amazon', en: 'Amazon', ja: 'Amazon' },
    sourceUrl: 'https://sell.amazon.com/blog/product-photos',
  },
  {
    id: 'shopify-square', width: 2048, height: 2048, ratio: '1:1', maxBytes: 20_000_000,
    label: { 'zh-CN': 'Shopify', en: 'Shopify', ja: 'Shopify' },
    sourceUrl: 'https://help.shopify.com/en/manual/products/product-media/product-media-types',
  },
  {
    // App default above Temu's apparel minimum (1340×1785), with an exact 3:4 ratio.
    // The official carousel-image limit is 3 MB.
    id: 'temu-apparel', width: 1500, height: 2000, ratio: '3:4', maxBytes: 3_000_000,
    label: { 'zh-CN': 'Temu', en: 'Temu', ja: 'Temu' },
    sourceUrl: 'https://partner.temu.com/documentation?menu_code=38e79b35d2cb463d85619c1c786dd303&sub_menu_code=d7943785ff2e4185976170f07924256e',
  },
  {
    // App default for non-apparel; the official minimum is 800×800 at 1:1, up to 3 MB.
    id: 'temu-square', width: 1600, height: 1600, ratio: '1:1', maxBytes: 3_000_000,
    label: { 'zh-CN': 'Temu', en: 'Temu', ja: 'Temu' },
    sourceUrl: 'https://partner.temu.com/documentation?menu_code=38e79b35d2cb463d85619c1c786dd303&sub_menu_code=d7943785ff2e4185976170f07924256e',
  },
  {
    // App pixel default. US listing policy requires at least 600×600:
    // https://seller-us.tiktok.com/university/course?content_id=7073362639816491&lang=en&learning_id=7350062255294222
    // 5 MB is a conservative cap compatible with US Media Center, not a universal
    // limit for every TikTok Shop market or upload route.
    id: 'tiktok-shop-square', width: 1200, height: 1200, ratio: '1:1', maxBytes: 5_000_000,
    label: { 'zh-CN': 'TikTok Shop', en: 'TikTok Shop', ja: 'TikTok Shop' },
    sourceUrl: 'https://seller-us.tiktok.com/university/essay?knowledge_id=6593220793222955',
  },
  {
    // App default within the API's allowed square range (900–2200 px), up to 3 MB.
    id: 'shein-square', width: 1500, height: 1500, ratio: '1:1', maxBytes: 3_000_000,
    label: { 'zh-CN': 'SHEIN', en: 'SHEIN', ja: 'SHEIN' },
    sourceUrl: 'https://open.sheincorp.com/documents/apidoc/detail/3001248',
  },
  {
    // App default; Rakuten recommends at least 700×700, not a fixed 1200×1200.
    id: 'rakuten-square', width: 1200, height: 1200, ratio: '1:1',
    label: { 'zh-CN': '乐天市场', en: 'Rakuten Ichiba', ja: '楽天市場' },
    sourceUrl: 'https://service.rms.rakuten.co.jp/column/detail/26',
  },
  {
    // The official product-registration guide recommends 800×800 (page 9).
    id: 'qoo10-square', width: 800, height: 800, ratio: '1:1',
    label: { 'zh-CN': 'Qoo10', en: 'Qoo10', ja: 'Qoo10' },
    sourceUrl: 'https://doc.image-qoo10.jp/sqm/JP/guide_kobesusyouhintoroku_JP.compressed.pdf',
  },
  {
    // Application suggested preset, not an official ZOZOTOWN size requirement.
    id: 'zozotown-portrait', width: 1500, height: 1800, ratio: '5:6',
    label: { 'zh-CN': 'ZOZOTOWN', en: 'ZOZOTOWN', ja: 'ZOZOTOWN' },
  },
];

export function commerceCropPresets(locale: Locale): CropPreset[] {
  return definitions.map(item => ({
    id: `commerce:${item.id}`, kind: 'commerce', label: item.label[locale], ratio: item.width / item.height,
    ratioLabel: item.ratio, outputWidth: item.width, outputHeight: item.height, outputMimeType: 'image/jpeg',
    ...(item.maxBytes ? { maxOutputBytes: item.maxBytes } : {}),
  }));
}

// Saved crop records can retain older localized labels with a usage suffix.
// Resolve known platforms for display without rewriting their historical parameters.
export function commerceCropPlatformLabel(label: string, locale: Locale): string {
  const normalize = (value: string) => value.split(' · ')[0].replaceAll('／', '/').replace(/\s*\/\s*/g, '/').trim();
  const platform = normalize(label);
  const definition = definitions.find(item => Object.values(item.label).some(value => normalize(value) === platform));
  return definition?.label[locale] ?? label;
}
