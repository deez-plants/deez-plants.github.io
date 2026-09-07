import { useMemo } from 'react';
import type { ISODate, PlantId } from '../types/ids';
import type { StoredEvent } from '../types/event';
import type { DerivedPlant } from '../types/derived';
import { compareEvents } from '../db/derive';
import { formatMonthYear } from '../lib/dates';
import { PlantChrome } from '../components/PlantChrome';
import { EventList } from '../components/EventList';
import './PlantHistory.css';

/** DESIGN_REFERENCE.md screen 25: the full per-plant log, newest first. */

export interface PlantEntriesProps {
  plant: DerivedPlant;
  events: readonly StoredEvent[];
  as_of: ISODate;
  backLabel: string;
  onBack: () => void;
  allPlants: readonly { plant_id: PlantId; name: string }[];
  onNavigate: (plant_id: PlantId) => void;
}

export default function PlantEntries({
  plant, events, as_of, backLabel, onBack, allPlants, onNavigate,
}: PlantEntriesProps) {
  const plantEvents = useMemo(
    () => events.filter((e) => e.plant_id === plant.plant_id).sort((a, b) => compareEvents(b, a)),
    [events, plant.plant_id],
  );
  const since = plantEvents.length ? plantEvents[plantEvents.length - 1].date : null;

  return (
    <main className="history">
      <PlantChrome
        plant={{ plant_id: plant.plant_id, name: plant.name }}
        backLabel={backLabel}
        onBack={onBack}
        allPlants={allPlants}
        onNavigate={onNavigate}
      />

      <h1 className="history-title">All entries</h1>
      <p className="history-sub">
        {plantEvents.length
          ? `${plantEvents.length} ${plantEvents.length === 1 ? 'entry' : 'entries'} since ${formatMonthYear(since as ISODate)}`
          : 'Nothing logged for this plant yet.'}
      </p>

      {plantEvents.length > 0 && <EventList events={plantEvents} as_of={as_of} />}
    </main>
  );
}
