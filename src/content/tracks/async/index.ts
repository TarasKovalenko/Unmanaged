import type { Lesson } from '../../types.ts';
import { futuresAreLazy } from './01-futures-are-lazy.ts';
import { runtimes } from './02-runtimes.ts';
import { sendAndStatic } from './03-send-and-static.ts';
import { cancellation } from './04-cancellation.ts';

export const lessons: Lesson[] = [futuresAreLazy, runtimes, sendAndStatic, cancellation];
