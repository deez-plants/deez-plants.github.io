import { useMemo } from 'react';
import type { ISODate, PlantId } from '../types/ids';
import type { CareEventType, StoredEvent } from '../types/event';
import type { DerivedPlant } from '../types/derived';
import { daysInMonth, formatMonthFull, shiftMonths, weekdayOfMonthStart } from '../lib/dates';
import { CARE_TYPE_ORDER, CARE_TYPE_STYLE } from '../lib/careTypeStyle';
import { PlantChrome } from '../components/PlantChrome';
import './PlantCalendar.css';

/**
 * DESIGN_REFERENCE.md screens 26/27: month grids with a dot per care type on
 * days something happened. `all` selects between the two — three months with
 * a "View all 12 months" link (26), or all twelve with none (27). Same
 * component either way: the mock's own lesson (section 6) is that the grid
 * itself must never reverse, only the month list's length changes.
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

export interface PlantCalendarProps {
  plant: DerivedPlant;
  /** The full raw log — filtered to this plant here. */
  events: readonly StoredEvent[];
  as_of: ISODate;
  /** Three months (screen 26) or all twelve (screen 27). */
  all: boolean;
  backLabel: string;
  onBack: () => void;
  allPlants: readonly { plant_id: PlantId; name: string }[];
  onNavigate: (plant_id: PlantId) => void;
  /** Present only on the three-month view. */
  onViewAll?: () => void;
}

export default function PlantCalendar({
  plant, events, as_of, all, backLabel, onBack, allPlants, onNavigate, onViewAll,
}: PlantCalendarProps) {
  const monthCount = all ? 12 : 3;

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
      if (e.plant_id !== plant.plant_id || !isCareEventType(e.type)) continue;
      if (e.date < oldestMonth) continue;
      const set = map.get(e.date) ?? new Set<CareEventType>();
      set.add(e.type);
      map.set(e.date, set);
    }
    return map;
  }, [events, plant.plant_id, oldestMonth]);

  const legendTypes = useMemo(() => {
    const seen = new Set<CareEventType>();
    for (const set of byDate.values()) for (const t of set) seen.add(t);
    return CARE_TYPE_ORDER.filter((t) => seen.has(t));
  }, [byDate]);

  return (
    <main className="cal">
      <PlantChrome
        plant={{ plant_id: plant.plant_id, name: plant.name }}
        backLabel={backLabel}
        onBack={onBack}
        allPlants={allPlants}
        onNavigate={onNavigate}
      />

      <h1 className="cal-title">Care calendar</h1>
      <p className="cal-sub">{plant.name} · last {monthCount} months</p>

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

      {onViewAll && (
        <button type="button" className="cal-viewall" onClick={onViewAll}>
          All 12 months ›
        </button>
      )}
    </main>
  );
}
