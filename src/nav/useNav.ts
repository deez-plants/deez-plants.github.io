import { useState } from 'react';
import type { RootTab, Screen, StackEntry } from './types';

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
 */
export function useNav(initialTab: RootTab = 'plants') {
  const [stack, setStack] = useState<StackEntry[]>([{ screen: { kind: initialTab }, backLabel: '' }]);

  const current = stack[stack.length - 1].screen;
  const root = stack[0].screen;
  const activeTab: RootTab | null =
    root.kind === 'home' || root.kind === 'plants' || root.kind === 'record' ? root.kind : null;
  const backLabel = stack.length > 1 ? stack[stack.length - 1].backLabel : null;
  /** There is something behind this screen. Roots have nothing behind them,
      which is why the edge-swipe is inert on Home, Plants and Record. */
  const canGoBack = stack.length > 1;

  const goRoot = (tab: RootTab) => {
    setStack([{ screen: { kind: tab }, backLabel: '' }]);
  };

  const push = (screen: Screen, backLabel: string) => {
    setStack((s) => [...s, { screen, backLabel }]);
  };

  /** Swaps the top of the stack in place — same depth, same backLabel.
      For Prev/Next and the plant picker: browsing sideways between plants
      isn't a new destination to back out of, one at a time. */
  const replace = (screen: Screen) => {
    setStack((s) => {
      const top = s[s.length - 1];
      return [...s.slice(0, -1), { screen, backLabel: top.backLabel }];
    });
  };

  const back = () => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };

  return {
    current,
    activeTab,
    backLabel,
    canGoBack,
    goRoot,
    push,
    replace,
    back,
  };
}
