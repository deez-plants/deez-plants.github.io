import { useMemo } from 'react';
import type { ISODate, PlantId } from '../types/ids';
import type { StoredEvent } from '../types/event';
import type { DerivedPlant } from '../types/derived';
import { compareEvents } from '../db/derive';
import { PlantChrome } from '../components/PlantChrome';
import { EventList } from '../components/EventList';
import './PlantHistory.css';

/** DESIGN_REFERENCE.md screen 24: one plant's last 10 entries, then links to
    the full log and the care calendar (screens 25/26 — the calendar isn't
    built yet, so that link is still a placeholder for now). */

const HISTORY_CAP = 10;

export interface PlantHistoryProps {
  plant: DerivedPlant;
  /** The full raw log — filtered to this plant here. */
  events: readonly StoredEvent[];
  as_of: ISODate;
  backLabel: string;
  onBack: () => void;
  allPlants: readonly { plant_id: PlantId; name: string }[];
  onNavigate: (plant_id: PlantId) => void;
  onViewAll: () => void;
  onCareCalendar: () => void;
}

export default function PlantHistory({
  plant, events, as_of, backLabel, onBack, allPlants, onNavigate, onViewAll, onCareCalendar,
}: PlantHistoryProps) {
  const plantEvents = useMemo(
    () => events.filter((e) => e.plant_id === plant.plant_id).sort((a, b) => compareEvents(b, a)),
    [events, plant.plant_id],
  );
  const visible = plantEvents.slice(0, HISTORY_CAP);

  return (
    <main className="history">
      <PlantChrome
        plant={{ plant_id: plant.plant_id, name: plant.name }}
        backLabel={backLabel}
        onBack={onBack}
        allPlants={allPlants}
        onNavigate={onNavigate}
      />

      <h1 className="history-title">History</h1>
      <p className="history-sub">
        {plant.name} · {visible.length ? `last ${visible.length} ${visible.length === 1 ? 'entry' : 'entries'}` : 'no entries yet'}
      </p>

      {visible.length > 0
        ? <EventList events={visible} as_of={as_of} />
        : <p className="history-empty">Nothing logged for this plant yet.</p>}

      <button type="button" className="history-link" onClick={onViewAll}>View all entries ›</button>
      <button type="button" className="history-link" onClick={onCareCalendar}>Care calendar ›</button>
    </main>
  );
}
