import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { getMotionDurationMs } from '../motion';

type Candidate = { order: string[]; x: number; y: number; height: number };
type Drag = { category: string; original: string[]; order: string[]; candidates: Candidate[]; grabX: number; grabY: number; minHeight: number };
type Preview = { category: string; order: string[]; minHeight: number };
const sameOrder = (left: string[], right: string[]) => left.length === right.length && left.every((category, index) => category === right[index]);

/** Native drag keeps its source mounted; CSS order previews the gap while neighbours slide aside. */
export function usePromptCategorySort(categories: string[], onChange: (categories: string[]) => void, disabled: boolean) {
  const list = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const current = useRef({ categories, onChange, disabled });
  current.current = { categories, onChange, disabled };
  const controlPressed = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);
  const animations = useRef<Animation[]>([]);
  const focusFrame = useRef(0);
  const previewFrame = useRef(0);
  const items = () => [...(list.current?.querySelectorAll<HTMLElement>('[data-category-id]') ?? [])];
  const capture = () => { before.current = new Map(items().map(item => [item.dataset.categoryId!, item.getBoundingClientRect()])); };
  const stopAnimations = () => { for (const animation of animations.current) animation.cancel(); animations.current = []; };
  const focus = (category: string) => {
    cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => items().find(item => item.dataset.categoryId === category)?.focus({ preventScroll: true }));
  };
  const finish = (commit: boolean) => {
    cancelAnimationFrame(previewFrame.current);
    const active = drag.current;
    if (!active) return;
    // Capture the visible intermediate positions so cancellation returns smoothly
    // and a successful drop never flashes the previous order.
    capture();
    drag.current = null; setPreview(null);
    const latest = current.current;
    if (commit && !latest.disabled && sameOrder(latest.categories, active.original) && !sameOrder(active.order, active.original)) latest.onChange(active.order);
    if (!latest.disabled) focus(active.category);
  };
  const end = () => finish(false);

  useLayoutEffect(() => {
    const previous = before.current;
    before.current = null;
    if (!previous) return;
    // The starting rects include ongoing motion; measure the new layout without
    // those transforms so a new target continues from the current visual position.
    stopAnimations();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const duration = getMotionDurationMs();
    if (!duration) return;
    animations.current = items().flatMap(item => {
      const category = item.dataset.categoryId!;
      const old = previous.get(category);
      if (!old || category === drag.current?.category) return [];
      const rect = item.getBoundingClientRect();
      const x = old.left - rect.left, y = old.top - rect.top;
      return Math.abs(x) + Math.abs(y) < 1 ? [] : [item.animate([
        { transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' },
      ], { duration, easing: 'ease-out' })];
    });
  }, [categories, preview]);
  useEffect(() => {
    if (drag.current && (disabled || !sameOrder(categories, drag.current.original))) finish(false);
  }, [disabled, categories]);
  useEffect(() => () => { stopAnimations(); cancelAnimationFrame(focusFrame.current); cancelAnimationFrame(previewFrame.current); }, []);

  const prepare = (event: PointerEvent<HTMLDivElement>) => {
    controlPressed.current = event.target instanceof Element && !!event.target.closest('button');
  };
  const begin = (event: DragEvent<HTMLDivElement>, category: string) => {
    if (disabled || categories.length < 2 || controlPressed.current || !list.current || (event.target instanceof Element && event.target.closest('button'))) { event.preventDefault(); return; }
    event.stopPropagation(); stopAnimations();
    const row = list.current;
    const bounds = row.getBoundingClientRect();
    const styles = getComputedStyle(row);
    const gapX = Number.parseFloat(styles.columnGap) || 0, gapY = Number.parseFloat(styles.rowGap) || 0;
    const positions = new Map(items().map(item => [item.dataset.categoryId!, item.getBoundingClientRect()]));
    const others = categories.filter(item => item !== category);
    // Stable original slots prevent moving chips from repeatedly changing the
    // hit target. Reserve enough height for any variable-width wrapped preview.
    const candidates: Candidate[] = categories.map((target, index) => {
      const order = [...others]; order.splice(index, 0, category);
      let x = 0, y = 0, rowHeight = 0;
      for (const id of order) {
        const size = positions.get(id)!;
        if (x > 0 && x + size.width > bounds.width + .5) { x = 0; y += rowHeight + gapY; rowHeight = 0; }
        rowHeight = Math.max(rowHeight, size.height);
        x += size.width + gapX;
      }
      const slot = positions.get(target)!;
      return { order, x: slot.left - bounds.left + row.scrollLeft + slot.width / 2, y: slot.top - bounds.top + row.scrollTop + slot.height / 2, height: y + rowHeight };
    });
    const rect = event.currentTarget.getBoundingClientRect();
    const minHeight = Math.max(row.offsetHeight, ...candidates.map(candidate => candidate.height));
    const active = { category, original: [...categories], order: [...categories], candidates, grabX: event.clientX - rect.left - rect.width / 2, grabY: event.clientY - rect.top - rect.height / 2, minHeight };
    drag.current = active;
    // Let the browser capture the native drag image before hiding the in-list chip.
    cancelAnimationFrame(previewFrame.current);
    previewFrame.current = requestAnimationFrame(() => {
      if (drag.current !== active) return;
      capture(); setPreview({ category, order: active.order, minHeight });
    });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-lightchain-prompt-category', category);
  };
  const previewAt = (clientX: number, clientY: number) => {
    const active = drag.current, row = list.current;
    if (!active || !row || current.current.disabled) return;
    const rect = row.getBoundingClientRect();
    const x = clientX - rect.left + row.scrollLeft - active.grabX;
    const y = clientY - rect.top + row.scrollTop - active.grabY;
    const distance = (candidate: Candidate) => Math.hypot(x - candidate.x, y - candidate.y);
    let target = active.candidates.find(candidate => sameOrder(candidate.order, active.order))!;
    for (const candidate of active.candidates) {
      // Hysteresis prevents jitter at equal-distance slot boundaries.
      if (distance(candidate) + 4 < distance(target)) target = candidate;
    }
    if (sameOrder(target.order, active.order)) return;
    capture(); active.order = target.order;
    setPreview({ category: active.category, order: active.order, minHeight: active.minHeight });
  };
  // Moving siblings can change the native drop target under a stationary pointer.
  // Accept that new target immediately, including a release before its next dragover.
  const enter = (event: DragEvent<HTMLDivElement>) => {
    if (!drag.current || current.current.disabled) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
  };
  const over = (event: DragEvent<HTMLDivElement>) => {
    if (!drag.current || disabled) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
    previewAt(event.clientX, event.clientY);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    event.preventDefault(); event.stopPropagation();
    previewAt(event.clientX, event.clientY);
    finish(true);
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>, category: string) => {
    if (disabled || drag.current || event.target !== event.currentTarget || !event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const from = categories.indexOf(category);
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const to = event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : Math.max(0, Math.min(categories.length - 1, from + delta));
    if (from < 0 || from === to) return;
    const next = [...categories]; next.splice(from, 1); next.splice(to, 0, category);
    capture(); onChange(next); focus(category);
  };
  return { list, dragging: preview?.category, order: preview?.order ?? categories, minHeight: preview?.minHeight, prepare, begin, enter, over, drop, end, keyDown };
}
