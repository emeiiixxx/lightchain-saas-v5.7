import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useHoverDismiss } from '../useHoverDismiss';
import { usePresence } from '../usePresence';
import { Button } from './ui';

export type ToolbarSubmenuContent = {
  items: { label: string; onSelect: () => void }[];
  emptyLabel: string;
};

type Props = {
  label: string;
  icon: ReactNode;
  indicator: ReactNode;
  content: ToolbarSubmenuContent;
  open: boolean;
  parentRef: RefObject<HTMLDivElement | null>;
  onOpen: () => void;
  onClose: () => void;
  onSelect: () => void;
};

// Uses the canvas context submenu's top-layer positioning and pointer bridge.
export function ToolbarSubmenu({ label, icon, indicator, content, open, parentRef, onOpen, onClose, onSelect }: Props) {
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef(false);
  const id = useId();
  const shown = usePresence(open ? true : null);
  const hover = useHoverDismiss(open, onClose);
  const contains = (target: EventTarget | null) => target instanceof Node && (trigger.current?.contains(target) || panel.current?.contains(target));
  const focusFirst = () => panel.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]')?.focus({ preventScroll: true });

  function expand(keyboard = false) {
    hover.cancel();
    if (keyboard && open) { focusFirst(); return; }
    focusOnOpen.current = keyboard;
    onOpen();
  }
  function close() {
    hover.cancel();
    focusOnOpen.current = false;
    onClose();
    trigger.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    const popup = panel.current;
    if (!shown.value || !popup) return;
    if (!popup.matches(':popover-open')) popup.showPopover();
    let frame = 0;
    const position = () => {
      const anchor = trigger.current, parent = parentRef.current;
      if (!anchor?.isConnected || !parent?.matches(':popover-open')) return;
      const row = anchor.getBoundingClientRect();
      const inset = 8, gap = 4;
      const rightSpace = innerWidth - inset - row.right - gap, leftSpace = row.left - gap - inset;
      const side = rightSpace >= popup.offsetWidth || rightSpace >= leftSpace ? 'right' : 'left';
      const desiredLeft = side === 'right' ? row.right + gap : row.left - popup.offsetWidth - gap;
      const left = Math.max(inset, Math.min(desiredLeft, innerWidth - popup.offsetWidth - inset));
      const top = Math.max(inset, Math.min(row.top - 4, innerHeight - popup.offsetHeight - inset));
      popup.dataset.side = side;
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.setProperty('--submenu-bridge-width', `${side === 'right' ? Math.max(0, left - row.right) : Math.max(0, row.left - left - popup.offsetWidth)}px`);
      popup.style.setProperty('--submenu-bridge-top', `${row.top - top}px`);
      popup.style.setProperty('--submenu-bridge-height', `${row.height}px`);
      if (open) frame = requestAnimationFrame(position);
    };
    position();
    if (open && focusOnOpen.current) { focusFirst(); focusOnOpen.current = false; }
    return () => { cancelAnimationFrame(frame); if (popup.matches(':popover-open')) popup.hidePopover(); };
  }, [shown.value, open, parentRef]);

  return <>
    <button ref={trigger} type="button" role="menuitem" tabIndex={-1} className="lc-button lc-button--ghost lc-button--s toolbar-submenu-trigger" data-submenu-trigger
      aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-describedby={!content.items.length && open ? `${id}-notice` : undefined}
      onPointerEnter={event => { if (event.pointerType !== 'touch') expand(); }}
      onPointerLeave={event => { if (!contains(event.relatedTarget)) hover.schedule(); }}
      onClick={event => expand(event.detail === 0)}
      onKeyDown={event => {
        if (!['ArrowRight', 'Enter', ' '].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); expand(true);
      }}>
      {icon}<span className="toolbar-hover-item-label">{label}</span>{indicator}
    </button>
    {shown.value && <div ref={panel} id={id} popover="manual" role="menu" aria-label={label}
      className="toolbar-hover-menu toolbar-submenu" data-overlay data-phase={shown.phase} inert={shown.phase === 'exit'}
      onPointerEnter={hover.cancel}
      onPointerLeave={event => { if (!contains(event.relatedTarget)) hover.schedule(); }}
      onKeyDown={event => {
        if (event.key === 'Tab') return;
        event.stopPropagation();
        if (event.key === 'ArrowLeft' || event.key === 'Escape') { event.preventDefault(); close(); return; }
        const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
        if (!options.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = options.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[next]?.focus({ preventScroll: true });
      }}>
      {content.items.length ? content.items.map(item => <Button key={item.label} role="menuitem" tabIndex={-1}
        onClick={() => { hover.cancel(); onSelect(); item.onSelect(); }}>{item.label}</Button>)
        : <div id={`${id}-notice`} role="menuitem" aria-disabled="true" className="toolbar-submenu-empty">{content.emptyLabel}</div>}
    </div>}
  </>;
}
