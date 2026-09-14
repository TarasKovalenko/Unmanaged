import type { Lesson } from '../../types.ts';
import { anatomy } from './01-anatomy.ts';
import { useAfterMove } from './02-use-after-move.ts';
import { aliasingErrors } from './03-aliasing-errors.ts';
import { lifetimeErrors } from './04-lifetimes.ts';
import { typesAndTraits } from './05-types-and-traits.ts';

export const lessons: Lesson[] = [anatomy, useAfterMove, aliasingErrors, lifetimeErrors, typesAndTraits];
