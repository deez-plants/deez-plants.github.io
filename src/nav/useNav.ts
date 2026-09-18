import { useState } from 'react';
import type { RootTab, Screen } from './types';
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
  const backLabel = stack.length > 1 ? stack[stack.length - 1].backLabel : null;
  /** There is something behind this screen. Roots have nothing behind them,
      which is why the edge-swipe is inert on Home, Plants and Record. */
  const canGoBack = stack.length > 1;
  const canGoForward = state.ahead.length > 0;

  return {
    current,
    activeTab,
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
