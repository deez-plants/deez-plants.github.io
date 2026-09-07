import { useState } from 'react';
import type { RootTab, Screen, StackEntry } from './types';

/**
 * The whole nav model: one stack, three tab-bar roots, one sheet. Tapping a
 * root tab clears the stack (DESIGN_REFERENCE.md section 1: "Tapping Home or
 * Plants in the tab bar clears the stack. They are roots, not destinations
 * you come back from"). Everything else pushes, carrying the label its own
 * back button should show if something is pushed on top of it.
 */
export function useNav(initialTab: RootTab = 'plants') {
  const [stack, setStack] = useState<StackEntry[]>([{ screen: { kind: initialTab }, backLabel: '' }]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const current = stack[stack.length - 1].screen;
  const root = stack[0].screen;
  const activeTab: RootTab | null =
    root.kind === 'home' || root.kind === 'plants' || root.kind === 'record' ? root.kind : null;
  const backLabel = stack.length > 1 ? stack[stack.length - 1].backLabel : null;

  const goRoot = (tab: RootTab) => {
    setStack([{ screen: { kind: tab }, backLabel: '' }]);
    setSheetOpen(false);
  };

  const push = (screen: Screen, backLabel: string) => {
    setStack((s) => [...s, { screen, backLabel }]);
    setSheetOpen(false);
  };

  const back = () => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };

  return {
    current,
    activeTab,
    backLabel,
    sheetOpen,
    goRoot,
    push,
    back,
    openSheet: () => setSheetOpen(true),
    closeSheet: () => setSheetOpen(false),
  };
}
