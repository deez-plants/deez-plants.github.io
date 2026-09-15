import type { ISODate, PlantId } from '../types/ids';
import type { StoredEvent } from '../types/event';
import type { DerivedPlant } from '../types/derived';
import { PlantChrome } from '../components/PlantChrome';
import { CareMonths } from '../components/CareMonths';
import './PlantCalendar.css';

/**
 * DESIGN_REFERENCE.md screens 26/27: month grids with a dot per care type on
 * days something happened. `all` selects between the two — three months with
 * a "View all 12 months" link (26), or all twelve with none (27). Same
 * component either way: the mock's own lesson (section 6) is that the grid
 * itself must never reverse, only the month list's length changes.
 *
 * The grids themselves live in `components/CareMonths.tsx`, because plant
 * detail embeds the same three-month preview inline.
 */

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
  /** Open this plant's own page from the ID in the strip. */
  onOpenPlant?: (plant_id: PlantId) => void;
  /** Present only on the three-month view. */
  onViewAll?: () => void;
}

export default function PlantCalendar({
  plant, events, as_of, all, backLabel, onBack, allPlants, onNavigate, onOpenPlant, onViewAll,
}: PlantCalendarProps) {
  const monthCount = all ? 12 : 3;

  return (
    <main className="cal">
      <PlantChrome
        plant={{ plant_id: plant.plant_id, name: plant.name }}
        backLabel={backLabel}
        onBack={onBack}
        allPlants={allPlants}
        onNavigate={onNavigate}
        onOpenPlant={onOpenPlant}
      />

      <h1 className="cal-title">Care calendar</h1>
      <p className="cal-sub">{plant.name} · last {monthCount} months</p>

      <CareMonths
        plant_id={plant.plant_id}
        events={events}
        as_of={as_of}
        monthCount={monthCount}
      />

      {onViewAll && (
        <button type="button" className="cal-viewall" onClick={onViewAll}>
          All 12 months ›
        </button>
      )}
    </main>
  );
}
