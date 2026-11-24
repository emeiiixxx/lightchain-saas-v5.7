// Production CSS may shorten 200ms to .2s. JavaScript timers always use ms.
export function getMotionDurationMs(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--motion-duration').trim();
  const duration = Number.parseFloat(value);
  if (!Number.isFinite(duration) || duration < 0) return 200;
  if (value.endsWith('ms')) return duration;
  if (value.endsWith('s')) return duration * 1000;
  return duration === 0 ? 0 : 200;
}

// CSS ease-out cubic-bezier(0, 0, .58, 1), shared by scroll and canvas motion.
export function easeOut(progress: number) {
  const x = Math.max(0, Math.min(1, progress));
  if (x === 0 || x === 1) return x;
  let low = 0, high = 1;
  for (let i = 0; i < 16; i++) {
    const t = (low + high) / 2;
    const sample = 1.74 * (1 - t) * t * t + t * t * t;
    if (sample < x) low = t; else high = t;
  }
  const t = (low + high) / 2;
  return 3 * (1 - t) * t * t + t * t * t;
}
