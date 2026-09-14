import type { Gotcha } from '../types.ts';
import { gotchas as core } from './core.ts';
import { gotchas as typesTraits } from './types-traits.ts';

export const allGotchas: Gotcha[] = [...core, ...typesTraits];

export const gotchaById = new Map(allGotchas.map((g) => [g.id, g]));
