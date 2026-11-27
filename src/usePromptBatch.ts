import { useEffect, useRef, useState } from 'react';
import type { Locale } from './i18n';
import { getMotionDurationMs } from './motion';
import type { PromptEntry } from './prompt-types';
import { applyPromptBatch, type PromptBatchAction, type PromptCategoryIdentities } from './prompt-storage';

export function usePromptBatch(
  visible: readonly PromptEntry[],
  locale: Locale,
  categoryIdentities: PromptCategoryIdentities | undefined,
  onError: (message: string) => void,
) {
  const [phase, setPhase] = useState<'idle' | 'closing-search' | 'selecting' | 'closing-controls'>('idle');
  const active = phase !== 'idle';
  const controlsVisible = phase === 'selecting';
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const pending = useRef(false);
  const visibleIds = new Set(visible.map(entry => entry.id));
  const checked = new Set([...selection].filter(id => visibleIds.has(id)));

  useEffect(() => {
    if (phase !== 'closing-search' && phase !== 'closing-controls') return;
    const next = phase === 'closing-search' ? 'selecting' : 'idle';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase(next);
      return;
    }
    const timer = window.setTimeout(() => setPhase(next), getMotionDurationMs());
    return () => window.clearTimeout(timer);
  }, [phase]);

  function clear() {
    setSelection(new Set());
  }

  function toggle(id: string) {
    if (!controlsVisible || pending.current || !visibleIds.has(id)) return;
    setSelection(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!controlsVisible || pending.current) return;
    setSelection(previous => [...visibleIds].every(id => previous.has(id)) ? new Set() : visibleIds);
  }

  async function commit(action: PromptBatchAction) {
    if (!controlsVisible || pending.current || !checked.size) return false;
    pending.current = true;
    setBusy(true);
    try {
      const result = await applyPromptBatch([...checked], action, locale);
      if (!result.ok) {
        onError(result.message);
        return false;
      }
      clear();
      return true;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return {
    active, controlsVisible, busy, checked, clear, toggle, toggleAll,
    start() { clear(); setPhase('closing-search'); },
    done() { if (!pending.current) { clear(); setPhase('closing-controls'); } },
    remove: () => commit({ type: 'delete' }),
    send: (category: string) => commit({ type: 'move', category, categoryIdentity: categoryIdentities?.[category] }),
  };
}
