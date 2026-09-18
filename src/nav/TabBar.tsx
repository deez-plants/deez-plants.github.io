import { useSyncExternalStore } from 'react';
import { formatDuration, getPhase, getSnapshot, subscribe } from '../capture/recording';
import { Icon, type IconName } from '../components/Icon';
import type { RootTab } from './types';
import './TabBar.css';

export interface TabBarProps {
  active: RootTab | null;
  /** Home and Plants only. The recorder goes through `onRecord`, which has to
      decide between clearing the stack and pushing onto it. */
  onTab: (tab: 'home' | 'plants') => void;
  /** Open the recorder. See `openRecorder` in `App.tsx`. */
  onRecord: () => void;
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
 * **The centre button opens the Record screen and does nothing else.** The
 * mock's `tapRec` starts the walk, and a pass of this file followed it. The
 * owner then used it and found the cost: an accidental tap makes a recording
 * they have to notice and delete, and a stray tap while one is running is
 * worse. The asymmetry decides it — starting a walk is deliberate, so one
 * extra tap is free, while an accident costs a walk or a cleanup. Start,
 * pause and stop live on the screen, where you can see what you are doing.
 *
 * **This is the mock being overridden knowingly, by someone who has used the
 * app.** Do not restore tap-to-start from it.
 *
 * The button keeps its timer and red recording state, so a walk in progress
 * is visible from anywhere — the owner asked for that to stay. **That timer is
 * the only place a running walk needs to be shown.** A second one was tried on
 * 2026-09-16, as a pause/resume strip above this bar, and removed the next day:
 * it repeated a number already eighteen pixels above it, and the owner was
 * right that the fix underneath it — Record no longer clearing the navigation
 * stack — is the whole value and is invisible. Do not add it back.
 *
 * Where the recorder lands in the stack is `App.tsx`'s business, not this
 * file's: see `openRecorder`. This button's contract is unchanged — it opens
 * the Record screen, and start, pause and stop stay there where you can see
 * what you are doing.
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

export function TabBar({ active, onTab, onRecord, onLog, onMore }: TabBarProps) {
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
        aria-label={live ? 'Open the walk in progress' : 'Open the recorder'}
        onClick={onRecord}
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
