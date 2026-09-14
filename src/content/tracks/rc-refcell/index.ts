import type { Lesson } from '../../types.ts';
import { sharedOwnership } from './01-shared-ownership.ts';
import { interiorMutability } from './02-interior-mutability.ts';
import { cyclesAndWeak } from './03-cycles-and-weak.ts';
import { whenNotTo } from './04-when-not-to.ts';

export const lessons: Lesson[] = [sharedOwnership, interiorMutability, cyclesAndWeak, whenNotTo];
