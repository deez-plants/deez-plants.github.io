import type { PlantId } from '../types/ids';
import type { DerivedPlant } from '../types/derived';
import { PlantChrome } from '../components/PlantChrome';
import './InfoSettings.css';

/**
 * DESIGN_REFERENCE.md screen 10: identity, placement and care spec. The mock
 * has every field editable in place; this pass is read display only — writing
 * back means an `Edit` event per field (rule 5) with the user/AI-editable
 * split FIELD_DEFINITIONS.md section 4 draws, which is its own build step,
 * not a corner cut here. Fields shown are exactly the ones `DerivedPlant`
 * already carries — nothing here is invented.
 */

export interface InfoSettingsProps {
  plant: DerivedPlant;
  backLabel: string;
  onBack: () => void;
  allPlants: readonly { plant_id: PlantId; name: string }[];
  onNavigate: (plant_id: PlantId) => void;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-field">
      <span className="info-field-label">{label}</span>
      <input type="text" className="info-field-value" value={value} readOnly />
    </div>
  );
}

export default function InfoSettings({ plant, backLabel, onBack, allPlants, onNavigate }: InfoSettingsProps) {
  return (
    <main className="info">
      <PlantChrome
        plant={{ plant_id: plant.plant_id, name: plant.name }}
        backLabel={backLabel}
        onBack={onBack}
        allPlants={allPlants}
        onNavigate={onNavigate}
      />

      <h1 className="info-title">Info</h1>
      <p className="info-sub">{plant.plant_id} · view only for now — in-place editing is a later pass</p>

      <span className="info-label">IDENTITY</span>
      <Field label="Name" value={plant.name} />
      <Field label="Species" value={plant.species} />
      <Field label="Acquired" value={plant.acquired ?? 'Unknown'} />

      <span className="info-label">PLACEMENT</span>
      <Field label="Room" value={plant.room} />
      <Field label="Pot" value={plant.pot} />
      <Field
        label="Shared planter"
        value={plant.planter ? `${plant.planter} (${plant.planter_shared_water ? 'shared soil' : 'separate pots'})` : 'None — own pot'}
      />

      <span className="info-label">CARE SPEC</span>
      <p className="info-note">
        These are the fields an AI update can propose changes to. Your edits
        would be flagged if they disagree, once editing lands.
      </p>
      <Field label="Water interval" value={`${plant.water_interval_days} days`} />
      <Field
        label="Water interval — winter"
        value={plant.water_interval_days_winter !== null ? `${plant.water_interval_days_winter} days` : 'Same as summer'}
      />
      <Field label="Feed schedule" value={plant.feed ?? 'Not set'} />
      <Field label="Light" value={plant.light ?? 'Not set'} />
      <Field label="Soil" value={plant.soil ?? 'Not set'} />
    </main>
  );
}
