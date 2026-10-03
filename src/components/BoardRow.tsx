import type { BasketAction, BoardRow } from '../care/board';
import { ratingReason, rowReason } from '../care/board';
import { deferDays } from '../care/inspect';
import './BoardRow.css';

/**
 * One plant on the Home board, with the two things you can say about it.
 *
 * ## Why there are two buttons and not one
 *
 * The row's suggestion comes from a date. The owner is the one looking at the
 * soil, and they said plainly that a plant past its interval often turns out
 * not to need water at all. **So disagreeing has to cost exactly what agreeing
 * costs** — one tap, same size, same place. A primary Watered with "checked it
 * instead" tucked underneath would have made the honest answer the slower one,
 * which is how a record quietly fills up with waterings that did not happen.
 *
 * That is rule 9 as an interface rather than as a sentence: the elapsed
 * interval is a prompt to look, never proof the plant needs anything.
 *
 * ## The number on the Checked button
 *
 * It shows the recheck it will use, so the wait is never a hidden rule. One tap
 * takes it; the plant's own Log care screen is where a reason and a different
 * delay live. Tapping the name goes there — which the original design asked for
 * from the start ("each row opens either the plant or the care screen") and the
 * app never did.
 */

export interface BoardRowViewProps {
  row: BoardRow;
  /** What is already ticked for this plant, if anything. */
  action: BasketAction | null;
  /** Tapping the name: straight to this plant's Log care screen. */
  onOpen: () => void;
  onTick: (action: BasketAction) => void;
}

export function BoardRowView({ row, action, onOpen, onTick }: BoardRowViewProps) {
  const { plant } = row;
  const rating = ratingReason(plant);
  const days = deferDays(null, plant.adherence.interval_days);

  return (
    <div className={`brow${action ? ' ticked' : ''}`}>
      <button type="button" className="brow-name" onClick={onOpen}>
        {plant.name}
      </button>

      <span className={`brow-why${row.days_past >= 0 ? ' past' : ''}`}>{rowReason(row)}</span>
      {/* Both reasons, never one hiding the other. Letting water win is how the
          owner's stale ratings stayed invisible on the old screen. */}
      {rating && <span className="brow-why rating">{rating}</span>}

      <div className="brow-acts">
        <button
          type="button"
          aria-pressed={action === 'watered'}
          className={action === 'watered' ? 'brow-btn on' : 'brow-btn'}
          onClick={() => onTick('watered')}
        >
          Watered
        </button>
        <button
          type="button"
          aria-pressed={action === 'checked'}
          className={action === 'checked' ? 'brow-btn on' : 'brow-btn'}
          onClick={() => onTick('checked')}
        >
          Checked <span className="brow-days">{days}d</span>
        </button>
      </div>
    </div>
  );
}
