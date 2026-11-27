import { useLayoutEffect, useRef, useState } from 'react';
import type { Locale } from '../i18n';
import { promptCategoryLabel } from '../prompt-categories';
import { CanvasContextSubmenu } from './CanvasContextSubmenu';
import { Icon } from './ui';
import './prompt-card-menu.css';

const copy = {
  'zh-CN': { title: '提示词操作', pin: '置顶', unpin: '取消置顶', move: '移动至', remove: '删除' },
  en: { title: 'Prompt actions', pin: 'Pin', unpin: 'Unpin', move: 'Move to', remove: 'Delete' },
  ja: { title: 'プロンプトの操作', pin: 'ピン留め', unpin: 'ピン留めを解除', move: '移動先', remove: '削除' },
};

type Props = {
  anchor: HTMLElement;
  pinned: boolean;
  locale: Locale;
  categories: string[];
  onClose: () => void;
  onPin: () => void;
  onMove: (category: string) => void;
  onDelete: () => void;
};

export function PromptCardMenu({ anchor, pinned, locale, categories, onClose, onPin, onMove, onDelete }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [moving, setMoving] = useState(false);
  const t = copy[locale];
  useLayoutEffect(() => {
    const menu = panel.current!;
    menu.showPopover();
    const place = () => {
      if (!anchor.isConnected) { menu.hidePopover(); return; }
      const rect = anchor.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(rect.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${rect.bottom + 4 + menu.offsetHeight > innerHeight - 8 ? Math.max(8, rect.top - menu.offsetHeight - 4) : rect.bottom + 4}px`;
    };
    place();
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); };
  }, [anchor]);

  function close() {
    onClose();
    anchor.focus({ preventScroll: true });
  }

  return <div ref={panel} lang={locale} popover="auto" role="menu" aria-label={t.title} className="prompt-card-menu"
    onToggle={event => { if (event.target === event.currentTarget && event.newState === 'closed') onClose(); }}
    onKeyDown={event => {
      if (event.key === 'Tab') { close(); return; }
      if (event.key === 'Escape' || (moving && event.key === 'ArrowLeft')) {
        event.stopPropagation(); event.preventDefault();
        if (moving) {
          setMoving(false);
          panel.current?.querySelector<HTMLButtonElement>('[data-submenu-trigger]')?.focus({ preventScroll: true });
        } else close();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"]'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      setMoving(false);
      items[next]?.focus({ preventScroll: true });
    }}>
    <button type="button" role="menuitem" tabIndex={-1} onPointerEnter={() => setMoving(false)} onFocus={() => setMoving(false)} onClick={() => { onPin(); anchor.focus({ preventScroll: true }); }}>
      <Icon name="promptPin" />{pinned ? t.unpin : t.pin}
    </button>
    <CanvasContextSubmenu parentRef={panel} open={moving} onOpen={() => setMoving(true)} onClose={() => setMoving(false)} onSelect={close}
      indicator={<Icon name="imageEditChevron" size={16} />}
      group={{ id: 'move', label: t.move, icon: <Icon name="historySend" />, items: ['all', ...categories].map(category => ({
        id: category, label: promptCategoryLabel(category, locale), icon: null, onSelect: () => onMove(category),
      })) }} />
    <button type="button" role="menuitem" tabIndex={-1} onPointerEnter={() => setMoving(false)} onFocus={() => setMoving(false)} onClick={onDelete}>
      <Icon name="promptTrash" />{t.remove}
    </button>
  </div>;
}
