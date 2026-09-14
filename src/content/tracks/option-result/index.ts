import type { Lesson } from '../../types.ts';
import { noNull } from './01-no-null.ts';
import { resultNotExceptions } from './02-result-not-exceptions.ts';
import { questionMark } from './03-question-mark.ts';
import { errorTypes } from './04-error-types.ts';
import { combinators } from './05-combinators.ts';

export const lessons: Lesson[] = [noNull, resultNotExceptions, questionMark, errorTypes, combinators];
