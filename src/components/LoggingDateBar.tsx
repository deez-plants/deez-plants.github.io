import { useSyncExternalStore } from 'react';
import type { ISODate } from '../types/ids';
import {
  getSnapshot, isBackdated, loggingDate, resetLoggingDate, setLoggingDate, subscribe,
} from '../care/loggingDate';
import { formatDayMonth } from '../lib/dates';
import './LoggingDateBar.css';

/**
 * What date care is being logged for, said where it cannot be missed.
 *
 * Two forms of the same thing:
 *
 * - **`editable`** — on the Log care round screen, above the health block. The
 *   owner's placement: always visible, always the thing you change it with, so
 *   there is one place that answers "what day am I on".
 * - **read-only** — everywhere else care can be logged. It says the same
 *   sentence in the same amber and cannot be changed from there, because a date
 *   control on six screens is six places to set it by accident.
 *
 * **While it says Today it is quiet grey; the instant it does not, it is
 * amber.** There is deliberately no state where this screen looks ordinary and
 * is not — that was the whole risk of letting the date outlive the screen, and
 * the colour is what pays for it.
 */

export interface LoggingDateBarProps {
  today: ISODate;
  /** The round screen gets the control; everywhere else gets the statement. */
  editable?: boolean;
}

export function LoggingDateBar({ today, editable = false }: LoggingDateBarProps) {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const date = loggingDate(today);
  const back = isBackdated(today);

  // Nothing to say on a screen that cannot change it while it is on today.
  if (!editable && !back) return null;

  return (
    <div className={back ? 'logdate back' : 'logdate'}>
      <span className="logdate-label">Logging for</span>
      <span className="logdate-value">{back ? formatDayMonth(date) : 'Today'}</span>

      {editable && (
        <>
          <label className="logdate-pick">
            <span className="logdate-pick-text">{back ? 'Change' : 'Pick a date'}</span>
            <input
              type="date"
              className="logdate-input"
              aria-label="The date this care actually happened"
              value={date}
              // You cannot water tomorrow. The same cap the per-plant form
              // carries, and the store refuses a future date as well.
              max={today}
              onChange={(e) => setLoggingDate(e.target.value as ISODate, today)}
            />
          </label>
          {back && (
            <button type="button" className="logdate-reset" onClick={resetLoggingDate}>
              Back to today
            </button>
          )}
        </>
      )}
    </div>
  );
}
