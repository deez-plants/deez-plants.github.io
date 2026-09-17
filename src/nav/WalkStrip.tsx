import { useSyncExternalStore } from 'react';
import {
  formatDuration, getSnapshot, pauseSession, resumeSession, subscribe,
} from '../capture/recording';
import './WalkStrip.css';

/**
 * A live walk, sitting above the tab bar, on every screen.
 *
 * **Why it exists.** On the first real walk the owner had to open the Record
 * screen every time they wanted to pause — to fill a watering can, to take a
 * call — and then find their way back to the plant they had been standing in
 * front of. They said so during the walk itself: they kept having to
 * "reconstruct where I was". Pausing is the commonest thing anyone does during
 * a walk and it was the one thing that cost them their place.
 *
 * So pause and resume come to them. The strip shows the elapsed time and one
 * button; tapping the time itself opens the recorder for anything more —
 * stopping, saving, discarding, which are all decisions you should be looking
 * at a screen to make.
 *
 * Only while a walk is actually live. There is no strip the rest of the time,
 * and it never appears on the Record screen, which has its own controls and
 * says all of this larger.
 */
export interface WalkStripProps {
  /** True on the Record screen, where this would be saying it twice. */
  hidden: boolean;
  /** Open the recorder — the same handler the tab bar's Rec button uses. */
  onOpen: () => void;
}

export function WalkStrip({ hidden, onOpen }: WalkStripProps) {
  const rec = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const live = rec.phase === 'recording' || rec.phase === 'paused';
  if (!live || hidden) return null;

  const paused = rec.phase === 'paused';

  return (
    <div className={paused ? 'walkstrip paused' : 'walkstrip'}>
      <button type="button" className="walkstrip-open" onClick={onOpen}>
        <span className="walkstrip-dot" aria-hidden="true" />
        <span className="walkstrip-time">{formatDuration(rec.elapsed_s)}</span>
        <span className="walkstrip-word">{paused ? 'paused' : 'recording'}</span>
      </button>
      <button
        type="button"
        className="walkstrip-act"
        onClick={() => { if (paused) void resumeSession(); else pauseSession(); }}
      >
        {paused ? 'Resume' : 'Pause'}
      </button>
    </div>
  );
}
