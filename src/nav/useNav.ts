import { useState } from 'react';
import type { RootTab, Screen } from './types';
import type { TabItem } from './TabBar';
import * as nav from './stack';

/**
 * The whole nav model: one stack and three tab-bar roots. Tapping a root tab
 * clears the stack (DESIGN_REFERENCE.md section 1: "Tapping Home or Plants in
 * the tab bar clears the stack. They are roots, not destinations you come back
 * from"). Everything else pushes, carrying the label its own back button
 * should show if something is pushed on top of it.
 *
 * `More` is not a fourth root: it pushes the All-pages screen, so closing it
 * returns you to whatever you were looking at, the way the sheet it replaced
 * did. That is also why there is no sheet state here any more.
 *
 * **The rules themselves live in `stack.ts`, pure and tested.** This file is
 * the React binding and nothing else — see the note there for why.
 */
export function useNav(initialTab: RootTab = 'plants') {
  const [state, setState] = useState<nav.NavState>({
    stack: [{ screen: { kind: initialTab }, backLabel: '' }],
    ahead: [],
  });

  const { stack } = state;
  const current = stack[stack.length - 1].screen;
  const root = stack[0].screen;
  const activeTab: RootTab | null =
    root.kind === 'home' || root.kind === 'plants' || root.kind === 'record' ? root.kind : null;
  /**
   * Which tab-bar item to light up.
   *
   * **`activeTab` is not enough**, and the owner found that: Home and Plants
   * highlighted, Log and More never did. Those two are not roots — they push a
   * screen onto whatever you were looking at — so there was nothing for a
   * root-based check to compare against and the bar simply said nothing.
   *
   * So this reads the screen you are ON rather than the root you came from.
   * Standing on Log care lights Log, wherever you reached it from; standing on
   * All pages lights More. Everything else falls back to the root, which is
   * what makes Home and Plants behave as they always have.
   */
  const activeItem: TabItem | null =
    current.kind === 'care' ? 'log'
      : current.kind === 'all-pages' ? 'more'
        : activeTab;

  const backLabel = stack.length > 1 ? stack[stack.length - 1].backLabel : null;
  /** There is something behind this screen. Roots have nothing behind them,
      which is why the edge-swipe is inert on Home, Plants and Record. */
  const canGoBack = stack.length > 1;
  const canGoForward = state.ahead.length > 0;

  return {
    current,
    activeTab,
    activeItem,
    /** How deep the stack is. `App` watches this to tell a pop from a push, so
        that going back can restore where the screen was left. */
    depth: stack.length,
    backLabel,
    canGoBack,
    canGoForward,
    goRoot: (tab: RootTab) => setState((s) => nav.goRoot(s, { kind: tab })),
    push: (screen: Screen, label: string) => setState((s) => nav.push(s, screen, label)),
    replace: (screen: Screen) => setState((s) => nav.replace(s, screen)),
    swapPlant: (screen: Screen, label: string) => setState((s) => nav.swapPlant(s, screen, label)),
    back: () => setState(nav.back),
    forward: () => setState(nav.forward),
  };
}
