import { useSyncExternalStore } from 'react';
import { formatDuration, getPhase, getSnapshot, subscribe } from '../capture/recording';
import type { RootTab } from './types';
import './TabBar.css';

export interface TabBarProps {
  active: RootTab | null;
  onTab: (tab: RootTab) => void;
  onMore: () => void;
}

/**
 * Fixed, four items, Rec centred — DESIGN_REFERENCE.md section 4 rule 4.
 *
 * The centre button turns red and shows the running timer while a walk is
 * being recorded, so the state is visible from anywhere in the app. The mock
 * labels it "Pause" in that state; it navigates to the Record screen here
 * instead, because Rec is a root tab and a button labelled Pause that does not
 * pause is worse than one that says what it does. Pause is one tap further in,
 * on the screen it belongs to.
 */
export function TabBar({ active, onTab, onMore }: TabBarProps) {
  const phase = useSyncExternalStore(subscribe, getPhase, getPhase);
  const live = phase === 'recording' || phase === 'paused';

  return (
    <nav className="tabbar">
      <button
        type="button"
        className={active === 'home' ? 'tabbar-item on' : 'tabbar-item'}
        aria-current={active === 'home' ? 'page' : undefined}
        onClick={() => onTab('home')}
      >
        Home
      </button>
      <button
        type="button"
        className={active === 'plants' ? 'tabbar-item on' : 'tabbar-item'}
        aria-current={active === 'plants' ? 'page' : undefined}
        onClick={() => onTab('plants')}
      >
        Plants
      </button>
      <button
        type="button"
        className={live ? `tabbar-rec live ${phase}` : 'tabbar-rec'}
        onClick={() => onTab('record')}
      >
        <span className="tabbar-rec-dot" aria-hidden="true">
          {live && <span className="tabbar-rec-square" aria-hidden="true" />}
        </span>
        <span className="tabbar-rec-label">{live ? <RecTimer /> : 'Rec'}</span>
      </button>
      <button type="button" className="tabbar-item" onClick={onMore}>
        More
      </button>
    </nav>
  );
}

/** Its own component so the once-a-second tick re-renders the label alone,
    not the whole shell along with it. */
function RecTimer() {
  const rec = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return <>{formatDuration(rec.elapsed_s)}</>;
}
