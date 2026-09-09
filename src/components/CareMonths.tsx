import { useMemo } from 'react';
import type { ISODate, PlantId } from '../types/ids';
import type { CareEventType, StoredEvent } from '../types/event';
import { daysInMonth, formatMonthFull, shiftMonths, weekdayOfMonthStart } from '../lib/dates';
import { CARE_TYPE_ORDER, CARE_TYPE_STYLE } from '../lib/careTypeStyle';
import '../pages/PlantCalendar.css';

/**
 * The month grids and their legend, on their own so that both the full Care
 * calendar screen (26/27) and the inline three-month preview on plant detail
 * (screen 04) draw the same thing. The preview was a plain link for a while
 * because embedding meant duplicating this; extracting it is the fix.
 *
 * The grid renders newest month first, and each month in normal date order —
 * a lesson `DESIGN_REFERENCE.md` section 6 records as already learned once:
 * do not reverse the days inside a month along with the month list.
 */

const CARE_TYPES = new Set<string>(CARE_TYPE_ORDER);

function isCareEventType(t: string): t is CareEventType {
  return CARE_TYPES.has(t);
}

interface Cell {
  day: number | null;
  types: CareEventType[];
}

function buildMonth(monthStartDate: ISODate, byDate: Map<string, Set<CareEventType>>): Cell[] {
  const leading = weekdayOfMonthStart(monthStartDate);
  const total = daysInMonth(monthStartDate);
  const cells: Cell[] = [];
  for (let i = 0; i < leading; i++) cells.push({ day: null, types: [] });
  for (let d = 1; d <= total; d++) {
    const date = monthStartDate.slice(0, 8) + String(d).padStart(2, '0');
    const types = byDate.get(date);
    cells.push({ day: d, types: types ? CARE_TYPE_ORDER.filter((t) => types.has(t)) : [] });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, types: [] });
  return cells;
}

export interface CareMonthsProps {
  plant_id: PlantId;
  events: readonly StoredEvent[];
  as_of: ISODate;
  monthCount: number;
}

export function CareMonths({ plant_id, events, as_of, monthCount }: CareMonthsProps) {
  const months = useMemo(
    () => Array.from({ length: monthCount }, (_, i) => shiftMonths(as_of, -i)),
    [as_of, monthCount],
  );
  const oldestMonth = months[months.length - 1];

  // Scoped to the displayed window — an event from years ago must not add a
  // legend entry for a type that appears nowhere on screen.
  const byDate = useMemo(() => {
    const map = new Map<string, Set<CareEventType>>();
    for (const e of events) {
      if (e.plant_id !== plant_id || !isCareEventType(e.type)) continue;
      if (e.date < oldestMonth) continue;
      const set = map.get(e.date) ?? new Set<CareEventType>();
      set.add(e.type);
      map.set(e.date, set);
    }
    return map;
  }, [events, plant_id, oldestMonth]);

  const legendTypes = useMemo(() => {
    const seen = new Set<CareEventType>();
    for (const set of byDate.values()) for (const t of set) seen.add(t);
    return CARE_TYPE_ORDER.filter((t) => seen.has(t));
  }, [byDate]);

  return (
    <>
      {legendTypes.length > 0 && (
        <div className="cal-legend">
          {legendTypes.map((t) => (
            <span key={t} className="cal-legend-item">
              <span className="cal-legend-dot" style={{ background: CARE_TYPE_STYLE[t].colorVar }} />
              {CARE_TYPE_STYLE[t].label}
            </span>
          ))}
        </div>
      )}

      {months.map((m) => (
        <section key={m} className="cal-month">
          <h2 className="cal-month-head">{formatMonthFull(m)}</h2>
          <div className="cal-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <span key={d} className="cal-weekday">{d}</span>
            ))}
          </div>
          <div className="cal-grid">
            {buildMonth(m, byDate).map((cell, i) => (
              <div key={i} className={cell.day === null ? 'cal-cell blank' : cell.types.length ? 'cal-cell on' : 'cal-cell'}>
                {cell.day !== null && (
                  <>
                    <span className="cal-day-num">{cell.day}</span>
                    {cell.types.length > 0 && (
                      <span className="cal-day-dots">
                        {cell.types.map((t) => (
                          <span
                            key={t}
                            className="cal-dot"
                            style={{ background: CARE_TYPE_STYLE[t].colorVar }}
                            title={CARE_TYPE_STYLE[t].label}
                          >
                            {CARE_TYPE_STYLE[t].abbr}
                          </span>
                        ))}
                      </span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
