import type { PlantId } from '../types/ids';
import type { Screen, StackEntry } from './types';

/**
 * What every navigation does to the stack, as plain functions.
 *
 * **Pure, and separate from `useNav` on purpose.** These four rules are the
 * kind that get quietly broken by a later change and only show up as "Back
 * went somewhere odd" weeks afterwards — which is exactly how the one bug in
 * here was found, by the owner rather than by anything automatic. Out here
 * they are pinned by `check/nav.check.cjs`; inside a hook they could not be
 * tested at all.
 *
 * The same reasoning as `capture/clock.ts`, and for the same reason: four
 * lines of arithmetic tangled in module state were wrong three times.
 */

export interface NavState {
  stack: StackEntry[];
  /** What `back` discarded, newest last. Any new navigation empties it. */
  ahead: StackEntry[];
}

const plantOf = (screen: Screen): PlantId | undefined =>
  ('plant_id' in screen ? screen.plant_id : undefined);

/** A root tab. Clears everything: roots are where you start, not where you
    come back from (DESIGN_REFERENCE.md section 1). */
export function goRoot(_state: NavState, screen: Screen): NavState {
  return { stack: [{ screen, backLabel: '' }], ahead: [] };
}

export function push(state: NavState, screen: Screen, backLabel: string): NavState {
  return { stack: [...state.stack, { screen, backLabel }], ahead: [] };
}

/** Swap the top in place, keeping its back label. Prev/Next on Plant Detail,
    and the plant picker: sideways is not a new destination. */
export function replace(state: NavState, screen: Screen): NavState {
  const top = state.stack[state.stack.length - 1];
  return {
    stack: [...state.stack.slice(0, -1), { screen, backLabel: top.backLabel }],
    ahead: [],
  };
}

/**
 * Sideways from one plant's sub-page to another plant's.
 *
 * **The bug this fixes, in the owner's words:** open the Shamrock's "More
 * about" page by swiping across from the Monstera's, and Back still reads
 * "Large Monstera" and goes there — from a page about the Shamrock.
 *
 * `replace` keeps the pushing entry's label on purpose, which is right one
 * level up and wrong here: the page is now about a different plant and the
 * trail behind it has not noticed. So when the plant changes, the entry
 * underneath is rewritten to match. **Back still does what it always did** —
 * go to the page behind you. The trail just stops lying about which plant you
 * are in.
 *
 * **Deliberately narrow.** It rewrites only when the page behind is the OLD
 * plant's own detail page, the one case that can be wrong. Reaching a sub-page
 * through All pages or the plant picker backs out exactly where it did before.
 * A blanket "Back always goes up to this plant" was considered and dropped: it
 * would have changed cases nobody complained about.
 */
export function swapPlant(state: NavState, screen: Screen, label: string): NavState {
  const { stack } = state;
  const top = stack[stack.length - 1];
  const below = stack.length > 1 ? stack[stack.length - 2] : null;
  const to = plantOf(screen);
  const from = plantOf(top.screen);

  const rewritable = below !== null
    && to !== undefined
    && from !== undefined
    && to !== from
    && below.screen.kind === 'detail'
    && below.screen.plant_id === from;

  if (!rewritable) return replace(state, screen);

  return {
    stack: [
      ...stack.slice(0, -2),
      // Its own label is untouched: it still names wherever the plant page was
      // opened from, and that has not changed.
      { screen: { kind: 'detail', plant_id: to }, backLabel: below.backLabel },
      { screen, backLabel: label },
    ],
    ahead: [],
  };
}

/** Pop, keeping what was popped so `forward` can undo it. */
export function back(state: NavState): NavState {
  if (state.stack.length <= 1) return state;
  return {
    stack: state.stack.slice(0, -1),
    ahead: [...state.ahead, state.stack[state.stack.length - 1]],
  };
}

/**
 * Undo the last `back`.
 *
 * Back and forward are a pair: using either leaves the other available, the
 * way a browser's arrows do, so one swipe too many costs one swipe rather than
 * a retraced route. Only a NEW navigation clears the forward list — and that
 * is not a limitation but the only honest behaviour, since after a different
 * turn those screens are a branch that no longer exists.
 */
export function forward(state: NavState): NavState {
  if (!state.ahead.length) return state;
  return {
    stack: [...state.stack, state.ahead[state.ahead.length - 1]],
    ahead: state.ahead.slice(0, -1),
  };
}
