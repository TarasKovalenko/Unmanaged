import type { Timeline } from '../types.ts';
import { timelines as asyncTimelines } from './async.ts';

export const allTimelines: Timeline[] = [...asyncTimelines];

export const timelineById = new Map(allTimelines.map((t) => [t.id, t]));
