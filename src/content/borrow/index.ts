import type { BorrowSnippet } from '../types.ts';
import { assignWhileBorrowed } from './assign-while-borrowed.ts';
import { borrowEndsAtLastUse } from './borrow-ends-at-last-use.ts';
import { borrowIntoFunction } from './borrow-into-function.ts';
import { borrowOnAssign } from './borrow-on-assign.ts';
import { cloneToEscape } from './clone-to-escape.ts';
import { collectThenExtend } from './collect-then-extend.ts';
import { copyTypes } from './copy-types.ts';
import { disjointMutableBorrows } from './disjoint-mutable-borrows.ts';
import { dropOrder } from './drop-order.ts';
import { moveIntoFunction } from './move-into-function.ts';
import { moveOnAssign } from './move-on-assign.ts';
import { mutBorrowThroughFunction } from './mut-borrow-through-function.ts';
import { mutateWhileIterating } from './mutate-while-iterating.ts';
import { referenceIntoGrowingVec } from './reference-into-growing-vec.ts';
import { referenceOutlivesOwner } from './reference-outlives-owner.ts';
import { returnOwnedValue } from './return-owned-value.ts';
import { twoMutableBorrows } from './two-mutable-borrows.ts';
import { snippets as rcRefcellSnippets } from './extra/rc-refcell.ts';
import { snippets as structSnippets } from './extra/structs.ts';

/** Library order: roughly the order the ownership track introduces them. */
export const borrowSnippets: BorrowSnippet[] = [
  moveOnAssign,
  borrowOnAssign,
  copyTypes,
  moveIntoFunction,
  borrowIntoFunction,
  mutBorrowThroughFunction,
  mutateWhileIterating,
  collectThenExtend,
  twoMutableBorrows,
  disjointMutableBorrows,
  referenceIntoGrowingVec,
  borrowEndsAtLastUse,
  assignWhileBorrowed,
  referenceOutlivesOwner,
  returnOwnedValue,
  dropOrder,
  cloneToEscape,
  ...structSnippets,
  ...rcRefcellSnippets,
];

export const snippetById = new Map(borrowSnippets.map((s) => [s.id, s]));
