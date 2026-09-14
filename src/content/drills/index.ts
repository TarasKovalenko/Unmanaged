import type { Drill } from '../types.ts';
import { drills as asyncDrills } from './async.ts';
import { drills as optionResult } from './option-result.ts';
import { drills as ownership } from './ownership.ts';
import { drills as rcRefcell } from './rc-refcell.ts';
import { drills as rustcErrors } from './rustc-errors.ts';
import { drills as structs } from './structs.ts';

export const allDrills: Drill[] = [...ownership, ...optionResult, ...structs, ...rcRefcell, ...asyncDrills, ...rustcErrors];

export const drillById = new Map(allDrills.map((d) => [d.id, d]));
