import images from './asset-display-images.json';
import { assetDisplayUrl } from './asset-display-url';

type DisplayImage = { width: number; height: number; '320': string; '960': string };
const displayImages: Record<string, DisplayImage> = images;

// Resolve only this app's bundled assets. Uploads, data URLs and remote images
// keep their original identity and loading behavior.
export function bundledAssetPath(url: string, locationHref: string, basePath: string): string | undefined {
  try {
    const location = new URL(locationHref), resource = new URL(url, location);
    if (resource.origin !== location.origin || !/^https?:$/.test(resource.protocol)) return;
    const base = new URL(basePath, location.origin);
    if (resource.pathname.startsWith(`${base.pathname}assets/`)) return resource.pathname.slice(base.pathname.length);
    if (resource.pathname.startsWith('/assets/')) return resource.pathname.slice(1);
  } catch { /* Non-URL inputs retain their original loading behavior. */ }
}

export function bundledImage(url: string, locationHref = window.location.href, basePath = import.meta.env.BASE_URL): DisplayImage | undefined {
  const key = bundledAssetPath(url, locationHref, basePath);
  return key ? displayImages[key] : undefined;
}

export function imageDisplayPreview(url: string, size: 320 | 960 = 960, locationHref = window.location.href, basePath = import.meta.env.BASE_URL): string {
  const image = bundledImage(url, locationHref, basePath);
  return image ? new URL(image[size], new URL(basePath, new URL(locationHref).origin)).href
    : assetDisplayUrl(url, locationHref, basePath);
}
