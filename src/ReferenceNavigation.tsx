import { useEffect, type MouseEvent } from 'react';

import { routeUrl } from './deepLink';

export const REFERENCE_SECTIONS = [
  ['data-model', 'Data model'], ['identifiers', 'Identifiers'], ['lifecycle', 'Lifecycle'],
  ['metadata', 'Metadata'], ['bridge', 'Home bridge'], ['avatars', 'Avatars'], ['examples', 'Examples'],
] as const;

type SectionId = typeof REFERENCE_SECTIONS[number][0];

export function referenceSectionUrl(input: string, id: SectionId) {
  const url = new URL(input, 'http://localhost');
  url.hash = id;
  return routeUrl({ kind: 'reference' }, url);
}

function scrollSection() {
  const id = window.location.hash.slice(1);
  if (!REFERENCE_SECTIONS.some(([section]) => section === id)) return;
  const section = document.getElementById(id);
  const shell = section?.closest<HTMLElement>('.app-shell');
  let container = section?.parentElement;
  // Narrow layouts scroll .workspace; wide layouts scroll .main-panel.
  // Stop at Help's shell so section navigation cannot move the Home document.
  while (container && container !== shell) {
    if (/(auto|scroll)/.test(getComputedStyle(container).overflowY)
      && container.scrollHeight > container.clientHeight) break;
    container = container.parentElement;
  }
  if (container === shell) return;
  if (section && container) {
    // Never scroll Home's outer Android document via scrollIntoView.
    container.scrollTop += section.getBoundingClientRect().top - container.getBoundingClientRect().top;
    section.focus({ preventScroll: true });
  }
}

export function ReferenceNavigation() {
  useEffect(() => {
    const canonical = routeUrl({ kind: 'reference' });
    if (canonical !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', canonical);
    }
    scrollSection();
    window.addEventListener('popstate', scrollSection);
    window.addEventListener('hashchange', scrollSection);
    return () => {
      window.removeEventListener('popstate', scrollSection);
      window.removeEventListener('hashchange', scrollSection);
    };
  }, []);

  function visit(event: MouseEvent<HTMLAnchorElement>, id: SectionId) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const next = referenceSectionUrl(window.location.href, id);
    if (window.location.hash !== `#${id}`) window.history.pushState(window.history.state, '', next);
    scrollSection();
  }

  return <nav aria-label="Developer reference sections" className="reference-toc">
    {REFERENCE_SECTIONS.map(([id, label]) => <a key={id}
      href={referenceSectionUrl(typeof window === 'undefined' ? '/?view=developers' : window.location.href, id)}
      onClick={event => visit(event, id)}>{label}</a>)}
  </nav>;
}
