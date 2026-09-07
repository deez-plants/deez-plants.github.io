import type { PlantId } from '../types/ids';
import type { DerivedPlant } from '../types/derived';
import { formatDayMonthYear } from '../lib/dates';
import { PlantChrome } from '../components/PlantChrome';
import './MoreAboutPlant.css';

/**
 * DESIGN_REFERENCE.md screen 08/09 ("More about this plant" and its topic
 * detail), collapsed into one screen. The mock's eight topics — Environment,
 * Soil & medium, Repotting/roots, Pruning & support, Pests & disease,
 * Season/growth, Notes, Propagation — are invented sample content
 * (DESIGN_REFERENCE.md section 5: "sample data is invented"); only Soil and
 * Notes correspond to a field FIELD_DEFINITIONS.md actually defines. The
 * other six have no backing field anywhere in the data model, present or
 * planned, so building six placeholder rows that always read "not tracked"
 * would be UI for data that can't exist rather than data not built yet.
 *
 * What FIELD_DEFINITIONS.md section 6c actually asks this screen to hold is
 * `care_instructions` (both lanes, added by whoever) and `notes_user` (yours
 * alone) — kept visually distinct here as that section requires. Soil is
 * shown alongside them because it's the one other "more about this plant"
 * fact the model has that isn't already on the main detail page.
 */

export interface MoreAboutPlantProps {
  plant: DerivedPlant;
  backLabel: string;
  onBack: () => void;
  allPlants: readonly { plant_id: PlantId; name: string }[];
  onNavigate: (plant_id: PlantId) => void;
}

export default function MoreAboutPlant({ plant, backLabel, onBack, allPlants, onNavigate }: MoreAboutPlantProps) {
  return (
    <main className="more">
      <PlantChrome
        plant={{ plant_id: plant.plant_id, name: plant.name }}
        backLabel={backLabel}
        onBack={onBack}
        allPlants={allPlants}
        onNavigate={onNavigate}
      />

      <h1 className="more-title">More about this plant</h1>
      <p className="more-sub">{plant.name}</p>

      <section className="more-card">
        <span className="more-label">SOIL &amp; MEDIUM</span>
        <p className="more-line">{plant.soil ?? 'Not set.'}</p>
      </section>

      <section className="more-card">
        <span className="more-label">CARE INSTRUCTIONS</span>
        {plant.care_instructions.length === 0 ? (
          <p className="more-line dim">Nothing proposed or added yet.</p>
        ) : (
          <ul className="more-instructions">
            {plant.care_instructions.map((ins) => (
              <li key={ins.instruction_id} className="more-instruction">
                <p className="more-instruction-text">{ins.text}</p>
                <span className="more-instruction-meta">
                  {formatDayMonthYear(ins.added)} · {ins.source === 'ai' ? 'AI' : 'You'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="more-card notes">
        <span className="more-label">NOTES</span>
        <span className="more-notes-badge">YOURS · never touched by import</span>
        <p className="more-line">{plant.notes_user || 'Nothing written yet.'}</p>
      </section>
    </main>
  );
}
