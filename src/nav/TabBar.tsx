import { useSyncExternalStore } from 'react';
import { formatDuration, getPhase, getSnapshot, subscribe } from '../capture/recording';
import type { RootTab } from './types';
import './TabBar.css';

export interface TabBarProps {
  active: RootTab | null;
  onTab: (tab: RootTab) => void;
  /** Start a walk if none is running, and open the Record screen either way.
      The decision lives in the shell, not here — this button only reports
      that it was pressed. */
  onRec: () => void;
  onMore: () => void;
}

/**
 * Fixed, four items, Rec centred — DESIGN_REFERENCE.md section 4 rule 4.
 *
 * **The centre button starts the walk.** The mock's `tapRec` does exactly
 * that, and an earlier pass of this file made it navigate only — the comment
 * justifying that change reasoned about the button's *label* and then drew
 * the wrong conclusion about its *action*. A walk recorder is used with the
 * phone in one hand, moving between plants; starting it should cost one tap
 * from anywhere.
 *
 * **While a walk is running it opens the screen rather than pausing**, which
 * is the one place this deliberately departs from the mock. A mis-tap on a
 * tab bar is cheap; a mis-tap that silently pauses a walk mid-sentence is
 * not, and you would not find out until the transcript came back short.
 * Pause and stop live on the screen, where you can see what you are doing.
 *
 * The label is the running timer rather than the mock's "Pause", for the same
 * reason: it has to be honest about what the button does, and the elapsed
 * time is the thing worth seeing from across the room.
 */
export function TabBar({ active, onTab, onRec, onMore }: TabBarProps) {
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
        aria-label={live ? 'Open the walk in progress' : 'Start a walk'}
        onClick={onRec}
      >
        <span className="tabbar-rec-dot" aria-hidden="true">
          {/* The mock's ring: scales to 1.35 and fades, 1.6s, only while
              actually recording — not while paused, where a pulse would say
              the opposite of the truth. */}
          {phase === 'recording' && <span className="tabbar-rec-ring" />}
          <span className="tabbar-rec-core" />
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
