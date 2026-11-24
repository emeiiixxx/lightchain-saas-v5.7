import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../usePresence';
import { Icon } from './ui';
import './toast.css';

type ToastNotice = { message: string; tone?: 'default' | 'success' | 'error' };
type ToastOptions = { durationMs?: number };

export function Toast({ message, tone = 'default', icon, className = '', ...props }: ToastNotice & ComponentProps<'div'> & { icon?: ReactNode }) {
  return <div className={`lc-toast ${className}`} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'} {...props}>
    {tone === 'error' && (icon ?? <Icon name="toastExclamation" size={16} />)}
    {tone === 'success' && (icon ?? <img className="lc-toast-success-icon" src="/assets/design-workbench/toast-success.svg" alt="" width={16} height={16} />)}<span>{message}</span>
  </div>;
}

export function notify(message: string, tone: ToastNotice['tone'] = 'default', options: ToastOptions = {}) {
  window.dispatchEvent(new CustomEvent<ToastNotice & ToastOptions>('lc-toast', { detail: { message, tone, ...options } }));
}

export function ToastHost() {
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  const shown = usePresence(notice);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<(ToastNotice & ToastOptions) | string>).detail;
      clearTimeout(timer);
      setNotice(typeof detail === 'string' ? { message: detail } : { message: detail.message, tone: detail.tone });
      timer = setTimeout(() => setNotice(null), typeof detail === 'string' ? 5000 : detail.durationMs ?? 5000);
    };
    window.addEventListener('lc-toast', receive);
    return () => { clearTimeout(timer); window.removeEventListener('lc-toast', receive); };
  }, []);
  useLayoutEffect(() => {
    if (notice && ref.current) {
      // Reopen above the current modal without moving keyboard focus.
      ref.current.hidePopover();
      ref.current.showPopover();
    }
  }, [notice]);
  return shown.value ? createPortal(<Toast ref={ref} popover="manual" {...shown.value} data-phase={shown.phase} />, document.body) : null;
}
