import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '../i18n';

export function DesignWorkspace({ active, locale, theme }: { active: boolean; locale: Locale; theme: 'dark' | 'light' }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [visited, setVisited] = useState(active);
  const [cropEditorOpen, setCropEditorOpen] = useState(false);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  useEffect(() => { if (!active) setCropEditorOpen(false); }, [active]);
  const configure = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: 'lc-v57-design-workbench-config', locale, theme }, window.location.origin);
  }, [locale, theme]);
  useEffect(() => {
    const ready = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data && typeof event.data === 'object' && 'type' in event.data && event.data.type === 'lc-v57-design-workbench-ready') configure();
      if (event.data && typeof event.data === 'object' && 'type' in event.data && event.data.type === 'lc-v57-crop-editor-visibility' && 'open' in event.data) setCropEditorOpen(event.data.open === true);
    };
    window.addEventListener('message', ready);
    configure();
    return () => window.removeEventListener('message', ready);
  }, [configure, visited]);
  if (!visited) return null;
  const title = locale === 'en' ? 'Design workspace' : locale === 'ja' ? 'デザインワークスペース' : '设计生产工作台';
  return <main className={`design-workspace${active && cropEditorOpen ? ' design-workspace--crop-editor' : ''}`} hidden={!active} inert={!active} aria-label={title}>
    <iframe ref={frame} title={title} src={`${import.meta.env.BASE_URL}design-workbench/index.html`} onLoad={configure} />
  </main>;
}
