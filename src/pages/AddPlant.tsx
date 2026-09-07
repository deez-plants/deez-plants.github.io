import { useMemo, useState } from 'react';
import type { DerivedState } from '../types/derived';
import type { Registry } from '../types/plant';
import type { ISODate, PlantId } from '../types/ids';
import { PLANT_ID_RE } from '../types/ids';
import { addPlant } from '../boot';
import './AddPlant.css';

/**
 * DESIGN_REFERENCE.md screen 11: name, species, and a three-letter suffix
 * suggested from the species as you type and editable until save, at which
 * point it locks — the number is assigned automatically and shown before
 * commit. Save is disabled until name, species and a three-letter suffix all
 * exist (the mock's own validation copy; this adds nothing beyond it).
 *
 * The mock's photo slot is a disabled note here, not a working control, same
 * as the single-plant Log care screen's photo attachment — real capture
 * isn't built. `pot`, `feed`, `light`, `soil` and `acquired` aren't asked for
 * here either (the mock doesn't ask for them on this screen) and start empty,
 * filled in later from Info and settings.
 */

export interface AddPlantProps {
  state: DerivedState;
  registry: Registry;
  as_of: ISODate;
  backLabel: string;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
  onAdded: (plant_id: PlantId) => void;
}

const DEFAULT_WATER_INTERVAL = 10;

/** `NNN-XXX` numbers are assigned once and never reused, even after
    archiving (FIELD_DEFINITIONS.md section 2) — so the next number is one
    past the highest ever issued, read off every id `state.order` holds
    (active and archived both), not just the active count. */
function nextPlantNumber(order: readonly PlantId[]): number {
  let max = 0;
  for (const id of order) {
    const n = Number(id.slice(0, 3));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/** A first guess at the three-letter suffix, from the species' genus — the
    mock's own example is "Epipremnum aureum" suggesting "EPI". Editable
    until save, so a rough guess is fine (DESIGN_REFERENCE.md screen 11). */
function suggestSuffix(species: string): string {
  const genus = species.trim().split(/\s+/)[0] ?? '';
  return genus.slice(0, 3).toUpperCase();
}

export default function AddPlant({ state, registry, as_of, backLabel, onBack, onChanged, onAdded }: AddPlantProps) {
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('');
  const [suffix, setSuffix] = useState('');
  const [suffixEdited, setSuffixEdited] = useState(false);
  const [waterInterval, setWaterInterval] = useState(String(DEFAULT_WATER_INTERVAL));
  const [room, setRoom] = useState(registry.rooms[0] ?? '');
  const [planter, setPlanter] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const number = useMemo(() => nextPlantNumber(state.order), [state.order]);
  const numberStr = String(number).padStart(3, '0');

  const onSpeciesChange = (value: string) => {
    setSpecies(value);
    if (!suffixEdited) setSuffix(suggestSuffix(value));
  };

  const onSuffixChange = (value: string) => {
    setSuffixEdited(true);
    setSuffix(value.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase());
  };

  const plant_id = `${numberStr}-${suffix}` as PlantId;
  const water = Number(waterInterval);

  const missing: string[] = [];
  if (!name.trim()) missing.push('Name is required.');
  if (!species.trim()) missing.push('Species is required.');
  if (suffix.length !== 3) missing.push('ID suffix must be three letters.');
  if (!Number.isFinite(water) || water < 1 || water > 60) missing.push('Water interval must be 1–60 days.');

  const valid = missing.length === 0 && PLANT_ID_RE.test(plant_id);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addPlant(
        { plant_id, name: name.trim(), species: species.trim(), room, planter: planter || null, water_interval_days: water },
        as_of,
      );
      await onChanged();
      onAdded(plant_id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="addplant">
      <button type="button" className="addplant-back" onClick={onBack}>‹ {backLabel}</button>

      <h1 className="addplant-title">Add a plant</h1>

      <div className="addplant-id-card">
        <span className="addplant-id-label">ASSIGNED ID</span>
        <span className="addplant-id-value">{numberStr}-{suffix || '???'}</span>
        <p className="addplant-id-note">Permanent. Suffix comes from the species once you name it.</p>
      </div>

      <p className="addplant-photo-note">
        Optional photo — arrives with photo capture, later.
      </p>

      <label className="addplant-field">
        <span className="addplant-label">NAME</span>
        <input
          type="text"
          className="addplant-input"
          placeholder="e.g. Kitchen Pothos"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="addplant-field">
        <span className="addplant-label">SPECIES</span>
        <input
          type="text"
          className="addplant-input"
          placeholder="e.g. Epipremnum aureum"
          value={species}
          onChange={(e) => onSpeciesChange(e.target.value)}
        />
      </label>

      <label className="addplant-field">
        <span className="addplant-label">ID SUFFIX</span>
        <div className="addplant-suffix-row">
          <span className="addplant-suffix-prefix">{numberStr}-</span>
          <input
            type="text"
            className="addplant-input addplant-suffix-input"
            value={suffix}
            onChange={(e) => onSuffixChange(e.target.value)}
            maxLength={3}
          />
        </div>
      </label>

      <label className="addplant-field">
        <span className="addplant-label">WATER INTERVAL — DAYS</span>
        <input
          type="number"
          className="addplant-input"
          value={waterInterval}
          onChange={(e) => setWaterInterval(e.target.value)}
          min={1}
          max={60}
        />
        <p className="addplant-hint">
          A starting guess is fine. The AI refines it once it has evidence.
        </p>
      </label>

      {registry.rooms.length > 0 && (
        <div className="addplant-field">
          <span className="addplant-label">ROOM</span>
          <div className="addplant-chips">
            {registry.rooms.map((r) => (
              <button
                key={r}
                type="button"
                className={r === room ? 'addplant-chip on' : 'addplant-chip'}
                onClick={() => setRoom(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="addplant-field">
        <span className="addplant-label">SHARED PLANTER</span>
        <select className="addplant-select" value={planter} onChange={(e) => setPlanter(e.target.value)}>
          <option value="">None — own pot</option>
          {registry.planters.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </label>

      {missing.length > 0 && (
        <div className="addplant-missing">
          <span className="addplant-missing-label">STILL NEEDED</span>
          {missing.map((m) => <p key={m}>{m}</p>)}
        </div>
      )}

      {error && <p className="addplant-error">{error}</p>}

      <button type="button" className="addplant-submit" disabled={!valid || busy} onClick={() => void submit()}>
        {busy ? 'Adding…' : 'Add to registry'}
      </button>
    </main>
  );
}
