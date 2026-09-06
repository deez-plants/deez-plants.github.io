import type { Health } from '../types/plant';
import './RateSheet.css';

/**
 * The 1–10 rating sheet, reached from the score block's Rate/Rate-it link on
 * plant detail.
 *
 * Section 4: "Save must be a single tap when the value is unchanged. Confirming
 * twenty plants on a walk cannot be twenty deliberate decisions." So there is no
 * separate save step here — tapping a number, including the one already
 * current, writes the `Rate` event immediately. Whether that lands as a
 * confirmation or a genuine change is for `derive.ts` to tell apart from the
 * log, never for this sheet to decide up front.
 */

export interface RateSheetProps {
  plantName: string;
  /** Highlighted as the starting point — tapping it again is the confirm case. */
  current: Health | null;
  busy: boolean;
  error: string | null;
  onRate: (value: Health) => void;
  onClose: () => void;
}

const VALUES: Health[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function RateSheet({ plantName, current, busy, error, onRate, onClose }: RateSheetProps) {
  return (
    <div className="rate-backdrop" onClick={onClose}>
      <div
        className="rate-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Rate ${plantName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rate-head">
          <span className="rate-title">Rate {plantName}</span>
          <button type="button" className="rate-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="rate-sub">
          {current === null
            ? 'What you see when you look at it today.'
            : 'Tap the same number to confirm it, or a new one to change it.'}
        </p>

        <div className="rate-grid">
          {VALUES.map((v) => (
            <button
              key={v}
              type="button"
              className={v === current ? 'rate-num on' : 'rate-num'}
              disabled={busy}
              onClick={() => onRate(v)}
            >
              {v}
            </button>
          ))}
        </div>

        {error && <p className="rate-error">{error}</p>}
      </div>
    </div>
  );
}
