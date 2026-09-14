import type { Lesson, Track } from '../types.ts';
import { moves } from './ownership/01-moves.ts';
import { functions } from './ownership/02-functions.ts';
import { aliasing } from './ownership/03-aliasing.ts';
import { lifetimes } from './ownership/04-lifetimes.ts';
import { drop } from './ownership/05-drop.ts';
import { cloning } from './ownership/06-cloning.ts';
import { lessons as asyncLessons } from './async/index.ts';
import { lessons as optionResultLessons } from './option-result/index.ts';
import { lessons as rcRefcellLessons } from './rc-refcell/index.ts';
import { lessons as rustcErrorLessons } from './rustc-errors/index.ts';
import { lessons as structLessons } from './structs/index.ts';

/** A track is available once it has at least one lesson. */
export const statusFor = (lessons: Lesson[]): Track['status'] => (lessons.length ? 'available' : 'planned');

export const tracks: Track[] = [
  {
    id: 'ownership',
    order: 1,
    title: 'Ownership, moves, borrows',
    pitch:
      'The GC did this for you for twenty years, so there is no existing mental model to attach it to. This is where people quit.',
    status: 'available',
    lessons: [moves, functions, aliasing, lifetimes, drop, cloning],
  },
  {
    id: 'option-result',
    order: 2,
    title: 'Option and Result',
    pitch:
      '`?` is not `try`/`catch`. There is no unwinding control flow to lean on and no `catch (Exception)` at the top of `Main`.',
    status: statusFor(optionResultLessons),
    lessons: optionResultLessons,
  },
  {
    id: 'structs',
    order: 3,
    title: 'Struct semantics',
    pitch:
      'In C#, `class` means reference and `struct` means value. In Rust it is the same type either way; what matters is whether it moved and whether it is `Copy`.',
    status: statusFor(structLessons),
    lessons: structLessons,
  },
  {
    id: 'rc-refcell',
    order: 4,
    title: 'Rc<RefCell<T>>',
    pitch:
      'The "I just want a normal object graph" escape hatch: why it works, and why reaching for it early is a smell.',
    status: statusFor(rcRefcellLessons),
    lessons: rcRefcellLessons,
  },
  {
    id: 'async',
    order: 5,
    title: 'Async',
    pitch:
      'A `Task` starts running when you create it. A future does nothing until polled, and there is no runtime in the box.',
    status: statusFor(asyncLessons),
    lessons: asyncLessons,
  },
  {
    id: 'rustc-errors',
    order: 6,
    title: 'Reading rustc errors',
    pitch:
      'Underrated, and largely what "productive" means. Fluency in E0382, E0499, E0502, E0506 and E0597.',
    status: statusFor(rustcErrorLessons),
    lessons: rustcErrorLessons,
  },
];

export const lessonIndex = new Map(
  tracks.flatMap((t) => t.lessons.map((l, i) => [l.id, { track: t, lesson: l, index: i }] as const)),
);
