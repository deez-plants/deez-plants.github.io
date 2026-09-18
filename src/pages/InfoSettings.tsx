import { useState } from 'react';
import type { ISODate, PlantId } from '../types/ids';
import type { DerivedPlant } from '../types/derived';
import type { Registry } from '../types/plant';
import { openDeezPlants } from '../db/schema';
import { editPlantFields, type FieldChange } from '../care/editField';
import { archivePlant, ARCHIVE_REASON_MAX } from '../care/archive';
import { PlantChrome } from '../components/PlantChrome';
import './InfoSettings.css';

/**
 * DESIGN_REFERENCE.md screen 10: identity, placement and care spec, editable
 * in place. Every field shown here is `editable_by: user` or `both`
 * (FIELD_DEFINITIONS.md section 4) — nothing on this screen is an AI-only
 * field, so the user can freely edit any of it directly, no review table
 * needed (that's for import). Saving batches every changed field into one
 * `editPlantFields` call — one `Edit` event per field that actually changed,
 * never a blob write (rule 5). Those events count the moment they are saved
 * (2026-09-18 — see `db/events.ts`), so this screen confirms what was written
 * rather than warning that it has not landed yet.
 */

export interface InfoSettingsProps {
  plant: DerivedPlant;
  registry: Registry;
  as_of: ISODate;
  backLabel: string;
  onBack: () => void;
  allPlants: readonly { plant_id: PlantId; name: string }[];
  onNavigate: (plant_id: PlantId) => void;
  /** Open this plant's own page from the ID in the strip. */
  onOpenPlant?: (plant_id: PlantId) => void;
  onChanged: () => Promise<void> | void;
}

interface FormState {
  name: string;
  species: string;
  acquired: string;
  room: string;
  spot: string;
  pot: string;
  planter: string;
  water_interval_days: string;
  water_interval_days_winter: string;
  feed: string;
  light: string;
  soil: string;
}

/** The subset of `DerivedPlant` this screen edits, tracked separately as the
    typed "from" baseline for the next diff — see the `baseline` state below
    for why `plant` itself can't serve that role between save and Update. */
interface PlantFields {
  name: string;
  species: string;
  acquired: string | null;
  room: string;
  spot: string;
  pot: string;
  planter: string | null;
  water_interval_days: number;
  water_interval_days_winter: number | null;
  feed: string | null;
  light: string | null;
  soil: string | null;
}

function toForm(p: PlantFields): FormState {
  return {
    name: p.name,
    species: p.species,
    acquired: p.acquired ?? '',
    room: p.room,
    spot: p.spot,
    pot: p.pot,
    planter: p.planter ?? '',
    water_interval_days: String(p.water_interval_days),
    water_interval_days_winter: p.water_interval_days_winter !== null ? String(p.water_interval_days_winter) : '',
    feed: p.feed ?? '',
    light: p.light ?? '',
    soil: p.soil ?? '',
  };
}

function TextField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="info-field">
      <span className="info-field-label">{label}</span>
      <input
        type="text"
        className="info-field-value"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export default function InfoSettings({
  plant, registry, as_of, backLabel, onBack, allPlants, onNavigate, onOpenPlant, onChanged,
}: InfoSettingsProps) {
  const [form, setForm] = useState<FormState>(() => toForm(plant));
  // The typed "from" for the next diff — starts as `plant`'s own values and
  // becomes whatever was just saved. `onChanged` does flow a fresh `plant`
  // back down, but not synchronously, so a second save in the same breath
  // would otherwise diff against the previous render and write a duplicate
  // edit for something already saved once.
  const [baseline, setBaseline] = useState<PlantFields>(() => plant);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);

  const set = <K extends keyof FormState>(key: K, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const original = toForm(baseline);
  const dirty = (Object.keys(form) as (keyof FormState)[]).some((k) => form[k] !== original[k]);

  const missing: string[] = [];
  if (!form.name.trim()) missing.push('Name is required.');
  if (!form.species.trim()) missing.push('Species is required.');
  if (!form.room.trim()) missing.push('Room is required.');
  const water = Number(form.water_interval_days);
  if (!Number.isFinite(water) || water < 1 || water > 60) missing.push('Water interval must be 1–60 days.');
  const waterWinter = form.water_interval_days_winter.trim() === '' ? null : Number(form.water_interval_days_winter);
  if (waterWinter !== null && (!Number.isFinite(waterWinter) || waterWinter < 1 || waterWinter > 60)) {
    missing.push('Winter water interval must be 1–60 days, or blank.');
  }

  const valid = missing.length === 0;

  const save = async () => {
    if (!valid || !dirty || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next: PlantFields = {
        name: form.name.trim(),
        species: form.species.trim(),
        acquired: form.acquired.trim() || null,
        room: form.room,
        spot: form.spot.trim(),
        pot: form.pot.trim(),
        planter: form.planter || null,
        water_interval_days: water,
        water_interval_days_winter: waterWinter,
        feed: form.feed.trim() || null,
        light: form.light.trim() || null,
        soil: form.soil.trim() || null,
      };
      const changes: FieldChange[] = (Object.keys(next) as (keyof PlantFields)[])
        .map((field) => ({ field, from: baseline[field], to: next[field] }));
      const db = await openDeezPlants();
      const ids = await editPlantFields(db, plant.plant_id, changes, as_of);
      await onChanged();
      setBaseline(next);
      setSaved(ids.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Screen 04's "Archive this plant (confirm first)". It lives here rather
  // than on plant detail because this is the screen about what a plant *is*,
  // and because retiring one should take a moment's navigation rather than
  // sitting a thumb's width from Log care.
  const [archiving, setArchiving] = useState(false);
  const [reason, setReason] = useState('');

  const doArchive = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const db = await openDeezPlants();
      await archivePlant(db, plant.plant_id, reason, as_of);
      await onChanged();
      setArchiving(false);
      setReason('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };


  return (
    <main className="info">
      <PlantChrome
        plant={{ plant_id: plant.plant_id, name: plant.name }}
        backLabel={backLabel}
        onBack={onBack}
        allPlants={allPlants}
        onNavigate={onNavigate}
        onOpenPlant={onOpenPlant}
      />

      <h1 className="info-title">Info</h1>
      <p className="info-sub">{plant.plant_id} · edit anything except the ID</p>

      <span className="info-label">IDENTITY</span>
      <TextField label="Name" value={form.name} onChange={(v) => set('name', v)} />
      <TextField label="Species" value={form.species} onChange={(v) => set('species', v)} />
      <TextField label="Acquired" value={form.acquired} onChange={(v) => set('acquired', v)} />

      <span className="info-label">PLACEMENT</span>
      <div className="info-field">
        <span className="info-field-label">Room</span>
        <div className="info-chips">
          {registry.rooms.map((r) => (
            <button
              key={r}
              type="button"
              className={r === form.room ? 'info-chip on' : 'info-chip'}
              onClick={() => set('room', r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <TextField
        label="Spot in the room"
        value={form.spot}
        onChange={(v) => set('spot', v)}
        placeholder="bookshelf, by the window, hutch…"
      />
      <TextField label="Pot" value={form.pot} onChange={(v) => set('pot', v)} />
      <label className="info-field">
        <span className="info-field-label">Shared planter</span>
        <select className="info-select" value={form.planter} onChange={(e) => set('planter', e.target.value)}>
          <option value="">None — own pot</option>
          {registry.planters.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </label>

      <span className="info-label">CARE SPEC</span>
      <p className="info-note">
        These are the fields an AI update can also propose changes to. Your
        edits are flagged if they disagree.
      </p>
      <TextField
        label="Water interval — days"
        value={form.water_interval_days}
        onChange={(v) => set('water_interval_days', v)}
      />
      <TextField
        label="Water interval — winter (blank = same as summer)"
        value={form.water_interval_days_winter}
        onChange={(v) => set('water_interval_days_winter', v)}
      />
      <TextField label="Feed schedule" value={form.feed} onChange={(v) => set('feed', v)} />
      <TextField label="Light" value={form.light} onChange={(v) => set('light', v)} />
      <TextField label="Soil" value={form.soil} onChange={(v) => set('soil', v)} />

      {dirty && missing.length > 0 && (
        <div className="info-missing">
          {missing.map((m) => <p key={m}>{m}</p>)}
        </div>
      )}

      {error && <p className="info-error">{error}</p>}

      {dirty && (
        <button type="button" className="info-save" disabled={!valid || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      )}

      {!dirty && saved > 0 && (
        <div className="info-pending">
          <p>
            {saved} field{saved === 1 ? '' : 's'} saved, and counted — the record
            already reflects them.
          </p>
        </div>
      )}

      {!plant.archived && (
        <section className="info-archive">
          <h2 className="info-archive-title">Archive this plant</h2>
          <p className="info-archive-body">
            It comes out of the active list and stops counting towards anything.
            Nothing is deleted — every watering, rating and photo stays exactly
            where it is, and the plant keeps its ID for good. This is how a
            plant that died or went to someone else leaves without taking its
            history with it.
          </p>

          {!archiving ? (
            <button type="button" className="info-archive-start" onClick={() => setArchiving(true)}>
              Archive this plant
            </button>
          ) : (
            <div className="info-archive-form">
              <label className="info-archive-label" htmlFor="archive-reason">
                What happened? This is kept with the record.
              </label>
              <input
                id="archive-reason"
                className="info-archive-input"
                type="text"
                value={reason}
                maxLength={ARCHIVE_REASON_MAX}
                placeholder="Died over the winter"
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="info-archive-actions">
                <button
                  type="button"
                  className="info-archive-cancel"
                  onClick={() => { setArchiving(false); setReason(''); }}
                >
                  Keep it
                </button>
                <button
                  type="button"
                  className="info-archive-confirm"
                  disabled={busy || !reason.trim()}
                  onClick={() => void doArchive()}
                >
                  Archive {plant.name}
                </button>
              </div>
              <p className="info-archive-note">
                Archiving counts straight away, like everything else — so if this
                was the wrong plant, you have until then.
              </p>
            </div>
          )}
        </section>
      )}

      {plant.archived && (
        <section className="info-archive archived">
          <h2 className="info-archive-title">Archived</h2>
          <p className="info-archive-body">
            {plant.archived_date ? `Archived ${plant.archived_date}. ` : ''}
            {plant.archived_reason ?? 'No reason was recorded.'}
          </p>
          <p className="info-archive-note">
            Bringing a plant back is not something this app does. Entries are
            append-only, so it would need its own kind of entry and a rule for
            how the two fit together — a change to the record, not a button.
          </p>
        </section>
      )}

    </main>
  );
}
