export type ImageEditorPoint = { x: number; y: number };
type Size = { width: number; height: number };
export const IMAGE_EDITOR_MIN_ZOOM = .2;
export const IMAGE_EDITOR_MAX_ZOOM = 4;

// Shared smart-crop / image-split camera. Sidebar and top/bottom clearance
// participate in fitting; changing image subdivisions never changes the camera.
export function imageEditorViewport(viewport: Size, bounds: Size | null, upscaleToFit = false) {
  const sidebarEnd = viewport.width <= 760 ? 296 : 360;
  const center = { x: viewport.width < 1100 ? (sidebarEnd + viewport.width) / 2 : viewport.width / 2, y: viewport.height / 2 };
  const fitZoom = bounds ? Math.min(upscaleToFit ? IMAGE_EDITOR_MAX_ZOOM : 1,
    Math.max(32, 2 * Math.min(center.x - sidebarEnd, viewport.width - center.x - 32)) / bounds.width,
    Math.max(32, viewport.height - 176) / bounds.height) : 1;
  return { center, fitZoom: Math.max(IMAGE_EDITOR_MIN_ZOOM, fitZoom) };
}

export function imageEditorZoomAt(zoom: number, pan: ImageEditorPoint, center: ImageEditorPoint, value: number, point?: ImageEditorPoint) {
  const next = Math.max(IMAGE_EDITOR_MIN_ZOOM, Math.min(IMAGE_EDITOR_MAX_ZOOM, value)), factor = next / zoom;
  return { zoom: next, pan: point ? {
    x: point.x - center.x - (point.x - center.x - pan.x) * factor,
    y: point.y - center.y - (point.y - center.y - pan.y) * factor,
  } : pan };
}

export function imageEditorZoomOptions(zoom: number) {
  const value = String(Math.round(zoom * 100));
  const options = [...new Set([20, 25, 50, 75, 100, 150, 200, 400, Number(value)])]
    .sort((a, b) => a - b).map(percent => ({ value: String(percent), label: `${percent}%` }));
  return { value, options };
}
