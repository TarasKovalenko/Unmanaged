import type { Lesson } from '../../types.ts';
import { oneKindOfType } from './01-one-kind-of-type.ts';
import { methodsAndSelf } from './02-methods-and-self.ts';
import { equalityAndHashing } from './03-equality-and-hashing.ts';
import { boxesAndSizes } from './04-boxes-and-sizes.ts';

export const lessons: Lesson[] = [oneKindOfType, methodsAndSelf, equalityAndHashing, boxesAndSizes];
