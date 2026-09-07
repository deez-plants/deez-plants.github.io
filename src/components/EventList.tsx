import type { ISODate } from '../types/ids';
import type { StoredEvent } from '../types/event';
import { daysBetween, formatDayMonth, formatRelativeDays } from '../lib/dates';
import { eventLabel } from '../lib/eventLabel';
import './EventList.css';

export interface EventListProps {
  /** Already filtered to one plant and sorted newest first. */
  events: readonly StoredEvent[];
  as_of: ISODate;
}

/** DESIGN_REFERENCE.md screens 24/25: an icon-chip label, the note, and both
    a relative and an absolute date, never just one. Shared between History
    (last 10) and All entries (the full log) so the row never drifts between
    the two. */
export function EventList({ events, as_of }: EventListProps) {
  return (
    <ul className="event-list">
      {events.map((e) => (
        <li key={e.event_id} className="event-row">
          <span className="event-tag">{eventLabel(e)}</span>
          <span className="event-body">
            {e.note && <span className="event-note">{e.note}</span>}
          </span>
          <span className="event-dates">
            <span className="event-relative">{formatRelativeDays(daysBetween(e.date, as_of))}</span>
            <span className="event-absolute">{formatDayMonth(e.date)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
