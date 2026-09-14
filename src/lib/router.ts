import { useEffect, useState } from 'react';

// Hash routing keeps the app deployable to any static host with no rewrites.
export type Route =
  | { page: 'home' }
  | { page: 'track'; trackId: string }
  | { page: 'lesson'; trackId: string; lessonId: string }
  | { page: 'visualizer'; snippetId?: string }
  | { page: 'drills'; drillId?: string }
  | { page: 'gotchas'; gotchaId?: string }
  | { page: 'phrasebook' }
  | { page: 'projects' }
  | { page: 'project'; projectId: string }
  | { page: 'errors'; code?: string }
  | { page: 'about' }
  | { page: 'not-found' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split(/[/?]/).filter(Boolean).map(decodeURIComponent);
  const [head, a, b] = parts;
  switch (head) {
    case undefined:
      return { page: 'home' };
    case 'visualizer':
      return { page: 'visualizer', snippetId: a };
    case 'drills':
      return { page: 'drills', drillId: a };
    case 'gotchas':
      return { page: 'gotchas', gotchaId: a };
    case 'phrasebook':
      return { page: 'phrasebook' };
    case 'projects':
      return a ? { page: 'project', projectId: a } : { page: 'projects' };
    case 'errors':
      return { page: 'errors', code: a };
    case 'about':
      return { page: 'about' };
    case 'tracks':
      if (a && !b) return { page: 'track', trackId: a };
      if (a && b) return { page: 'lesson', trackId: a, lessonId: b };
      return { page: 'home' };
    default:
      return { page: 'not-found' };
  }
}

export const href = {
  home: () => '#/',
  track: (trackId: string) => `#/tracks/${trackId}`,
  lesson: (trackId: string, lessonId: string) => `#/tracks/${trackId}/${lessonId}`,
  visualizer: (snippetId?: string) => (snippetId ? `#/visualizer/${snippetId}` : '#/visualizer'),
  drills: (drillId?: string) => (drillId ? `#/drills/${drillId}` : '#/drills'),
  gotchas: (gotchaId?: string) => (gotchaId ? `#/gotchas/${gotchaId}` : '#/gotchas'),
  phrasebook: () => '#/phrasebook',
  projects: () => '#/projects',
  project: (projectId: string) => `#/projects/${projectId}`,
  errors: (code?: string) => (code ? `#/errors/${code}` : '#/errors'),
  about: () => '#/about',
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(to: string) {
  window.location.hash = to.replace(/^#/, '');
}
