import { useEffect } from 'react';
import { Shell } from './components/Shell';
import { content } from './content';
import { drillById } from './content/drills';
import { projectById } from './content/projects';
import { lessonIndex, tracks } from './content/tracks';
import { structuralProblems } from './content/validate';
import { useRoute, type Route } from './lib/router';
import { AboutPage } from './pages/AboutPage';
import { DrillsPage } from './pages/DrillsPage';
import { ErrorsPage } from './pages/ErrorsPage';
import { GotchasPage } from './pages/GotchasPage';
import { HomePage } from './pages/HomePage';
import { LessonPage } from './pages/LessonPage';
import { NotFound } from './pages/NotFound';
import { PhrasebookPage } from './pages/PhrasebookPage';
import { ProjectPage, ProjectsPage } from './pages/ProjectsPage';
import { TrackPage } from './pages/TrackPage';
import { VisualizerPage } from './pages/VisualizerPage';

if (import.meta.env.DEV) {
  for (const p of structuralProblems(content)) console.warn(`[content] ${p}`);
}

function titleFor(route: Route): string | undefined {
  switch (route.page) {
    case 'lesson':
      return lessonIndex.get(route.lessonId)?.lesson.title;
    case 'track':
      return tracks.find((t) => t.id === route.trackId)?.title;
    case 'visualizer':
      return 'Borrow visualizer';
    case 'drills':
      return route.drillId ? `${drillById.get(route.drillId)?.title ?? 'Drill'} (drill)` : 'Error drills';
    case 'gotchas':
      return 'Gotchas';
    case 'phrasebook':
      return 'Phrasebook';
    case 'projects':
      return 'Mini-projects';
    case 'project':
      return projectById.get(route.projectId)?.title;
    case 'errors':
      return route.code ? `${route.code} (error index)` : 'Error index';
    case 'about':
      return 'About';
    default:
      return undefined;
  }
}

export default function App() {
  const route = useRoute();

  useEffect(() => {
    const title = titleFor(route);
    document.title = title ? `${title} | Unmanaged` : 'Unmanaged: Rust for people who write C#';
  }, [route]);

  return (
    <Shell route={route}>
      {route.page === 'home' && <HomePage />}
      {route.page === 'track' && <TrackPage trackId={route.trackId} />}
      {route.page === 'lesson' && <LessonPage key={route.lessonId} trackId={route.trackId} lessonId={route.lessonId} />}
      {route.page === 'visualizer' && <VisualizerPage snippetId={route.snippetId} />}
      {route.page === 'drills' && <DrillsPage drillId={route.drillId} />}
      {route.page === 'gotchas' && <GotchasPage gotchaId={route.gotchaId} />}
      {route.page === 'phrasebook' && <PhrasebookPage />}
      {route.page === 'projects' && <ProjectsPage />}
      {route.page === 'project' && <ProjectPage projectId={route.projectId} />}
      {route.page === 'errors' && <ErrorsPage code={route.code} />}
      {route.page === 'about' && <AboutPage />}
      {route.page === 'not-found' && <NotFound />}
    </Shell>
  );
}
