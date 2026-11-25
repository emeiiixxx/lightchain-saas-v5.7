import icons from './inline-icons.json';
import { bundledAssetPath } from './bundled-assets';

const paths: Record<string, number> = icons.paths;
const cache = new Map<number, string>();

export function iconAssetUrl(url: string, locationHref = globalThis.location?.href ?? 'http://localhost/', basePath = import.meta.env.BASE_URL): string {
  const key = bundledAssetPath(url, locationHref, basePath);
  const index = key ? paths[key] : undefined;
  if (index === undefined) return url;
  if (!cache.has(index)) cache.set(index, `data:image/svg+xml,${encodeURIComponent(icons.artwork[index]).replace(/'/g, '%27')}`);
  return cache.get(index)!;
}

export function inlineIconAssets<T extends Record<string, string>>(assets: T): { [K in keyof T]: string } {
  return Object.fromEntries(Object.entries(assets).map(([name, url]) => [name, iconAssetUrl(url)])) as { [K in keyof T]: string };
}
