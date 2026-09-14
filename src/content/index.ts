// One import for "all content", used by the checker, search and the error index.

import { borrowSnippets } from './borrow/index.ts';
import { allDrills } from './drills/index.ts';
import { allGotchas } from './gotchas/index.ts';
import { allPhrases } from './phrasebook/index.ts';
import { allProjects, ecosystem } from './projects/index.ts';
import { allTimelines } from './timelines/index.ts';
import { tracks } from './tracks/index.ts';

export const content = {
  tracks,
  snippets: borrowSnippets,
  drills: allDrills,
  gotchas: allGotchas,
  timelines: allTimelines,
  projects: allProjects,
  ecosystem,
  phrases: allPhrases,
};

export type Content = typeof content;
