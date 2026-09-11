import { useSyncExternalStore } from 'react';
import { formatDuration, getPhase, getSnapshot, subscribe } from '../capture/recording';
import { Icon, type IconName } from '../components/Icon';
import type { RootTab } from './types';
import './TabBar.css';

export interface TabBarProps {
  active: RootTab | null;
  onTab: (tab: RootTab) => void;
  /** Start a walk if none is running, and open the Record screen either way.
      The decision lives in the shell, not here — this button only reports
      that it was pressed. */
  onRec: () => void;
  /** Log care, from anywhere. */
  onLog: () => void;
  onMore: () => void;
}

/**
 * Five items, Rec centred, icons at 32px.
 *
 * **The fifth item is a deliberate override of the design brief**, which locks
 * the bar as Home / Plants / Record / More and names Log care as a contextual
 * action rather than a permanent tab (DESIGN_REFERENCE.md section 6). The
 * owner made that call on 2026-09-11 after actually using the app: logging
 * care is the thing they do most and it was two taps and a scroll away. The
 * brief's reasoning was written before anyone had used it; theirs was not.
 * It was tried the cheap way first — moving Log care to the top of Home — and
 * that was not enough. Do not re-raise the lock.
 *
 * The icons are 32px rather than the 21px an earlier pass used, and the bar's
 * own padding scales with them. The owner picked that size by looking at all
 * four options at their phone's real width, not by being asked to imagine it.
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

/** The owner's picks, 2026-09-11, from the comparison page's Round 2. */
const ICONS: Record<'home' | 'plants' | 'log' | 'more' | 'rec', IconName> = {
  home: 'home',
  plants: 'feed',
  rec: 'mic',
  log: 'checklist',
  more: 'list',
};

const ICON_PX = 32;

export function TabBar({ active, onTab, onRec, onLog, onMore }: TabBarProps) {
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
        <Icon name={ICONS.home} size={ICON_PX} />
        Home
      </button>
      <button
        type="button"
        className={active === 'plants' ? 'tabbar-item on' : 'tabbar-item'}
        aria-current={active === 'plants' ? 'page' : undefined}
        onClick={() => onTab('plants')}
      >
        <Icon name={ICONS.plants} size={ICON_PX} />
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
          {live
            ? <span className="tabbar-rec-core" />
            : <Icon name={ICONS.rec} size={ICON_PX} />}
        </span>
        <span className="tabbar-rec-label">{live ? <RecTimer /> : 'Rec'}</span>
      </button>
      <button type="button" className="tabbar-item" onClick={onLog}>
        <Icon name={ICONS.log} size={ICON_PX} />
        Log
      </button>
      <button type="button" className="tabbar-item" onClick={onMore}>
        <Icon name={ICONS.more} size={ICON_PX} />
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
