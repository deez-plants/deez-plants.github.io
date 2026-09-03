import type { ScoreBlockProps } from './score';
import { movement } from './score';
import { daysBetween, formatDayMonth, formatElapsed } from '../lib/dates';
import './ScoreBlock.css';

/**
 * The one health score component (FIELD_DEFINITIONS.md section 3b).
 *
 * Rule 6: wherever a health figure appears — Home, plant detail, health
 * history, the plants list, the review table — it is this block, in this order,
 * at these type sizes. If it renders differently on any screen that is a bug,
 * so there is deliberately no size prop, no compact variant and no way for a
 * caller to reorder or drop a line. The subject changes; the block does not.
 *
 * Three lines:
 *
 *     HEALTH
 *     7.4 /10        Aug 14
 *     6.9   Jun 28   +0.5 · 7wk
 *
 * Rule 1 governs what may be passed in: the app never computes health. Every
 * number reaching this component came from a `Rate` event, or is the mean of
 * numbers that did. Build the props with an adapter in `./score`, never by
 * hand.
 */

export function ScoreBlock({
  label = 'HEALTH',
  current,
  confirmed,
  previous,
  source = null,
  stale = false,
  onRate,
}: ScoreBlockProps) {
  return (
    <div className="score">
      <div className="score-label">{label}</div>

      {current === null || confirmed === null ? (
        // Line 2 for an unrated plant. Rule 1: nothing computes a stand-in, and
        // "not rated" is a permanent, legitimate answer — not a gap to fill.
        <div className="score-current">
          <span className="score-unrated">Not rated</span>
          {onRate && (
            <button type="button" className="score-rate" onClick={onRate}>Rate it</button>
          )}
        </div>
      ) : (
        <>
          <div className="score-current">
            <span className="score-value">{current}</span>
            <span className="score-of">/10</span>
            <span className="score-date">{formatDayMonth(confirmed)}</span>
            {source && <span className="score-source">{source === 'Me' ? 'ME' : 'AI'}</span>}
            {stale && <span className="score-stale">not looked at in 90+ days</span>}
            {onRate && (
              <button type="button" className="score-rate" onClick={onRate}>Rate</button>
            )}
          </div>

          {/* Line 3. The delta always carries its elapsed time: +0.3 over six
              weeks and +0.3 over six days are different news. */}
          {previous === null ? (
            <div className="score-previous"><span className="score-first">first record</span></div>
          ) : (
            <div className="score-previous">
              <span className="score-prev-value">{previous.value}</span>
              <span className="score-prev-date">{formatDayMonth(previous.date)}</span>
              {(() => {
                const move = movement(current, previous.value);
                return (
                  <>
                    <span className={`score-delta score-delta-${move.tone}`}>{move.text}</span>
                    <span className="score-elapsed">
                      · {formatElapsed(daysBetween(previous.date, confirmed))}
                    </span>
                  </>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
