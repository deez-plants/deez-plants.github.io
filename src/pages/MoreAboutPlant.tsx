import { useState } from 'react';
import type { ISODate, InstructionId, PlantId } from '../types/ids';
import type { DerivedPlant } from '../types/derived';
import { formatDayMonthYear } from '../lib/dates';
import { openDeezPlants } from '../db/schema';
import { commitUpdate } from '../db/events';
import { addCareInstruction, deleteCareInstruction } from '../notes/careInstructions';
import { setNotesUser } from '../notes/notesUser';
import { Icon } from '../components/Icon';
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
 * `care_instructions` (both lanes, added by whoever, deleted by you alone)
 * and `notes_user` (yours alone) — kept visually distinct here as that
 * section requires. Soil is shown alongside them because it's the one other
 * "more about this plant" fact the model has that isn't already on the main
 * detail page.
 *
 * Care-instruction add/delete write and take effect immediately on their own
 * (each is a one-shot action, not a form to fill in and save), same as
 * setting a photo's hero. Notes is different: it's a text field you're
 * actively typing into, so it follows Info and settings' save/pending
 * pattern — a local `baseline` that becomes the just-saved value on success,
 * used as the next diff's "from" instead of the still-uncommitted `plant`,
 * for the same reason documented there.
 */

export interface MoreAboutPlantProps {
  plant: DerivedPlant;
  as_of: ISODate;
  backLabel: string;
  onBack: () => void;
  allPlants: readonly { plant_id: PlantId; name: string }[];
  onNavigate: (plant_id: PlantId) => void;
  /** Open this plant's own page from the ID in the strip. */
  onOpenPlant?: (plant_id: PlantId) => void;
  onChanged: () => Promise<void> | void;
}

/** The six reference fields, in the order the mock's own topic list had them. */
const REFERENCE_FIELDS = [
  { field: 'environment', label: 'ENVIRONMENT', icon: 'environment' },
  { field: 'repotting', label: 'REPOTTING & ROOTS', icon: 'repot' },
  { field: 'pruning', label: 'PRUNING & SUPPORT', icon: 'support' },
  { field: 'pests', label: 'PESTS & DISEASE', icon: 'pest' },
  { field: 'season', label: 'SEASON & GROWTH', icon: 'feed' },
  { field: 'propagation', label: 'PROPAGATION', icon: 'prune' },
] as const;

export default function MoreAboutPlant({
  plant, as_of, backLabel, onBack, allPlants, onNavigate, onOpenPlant, onChanged,
}: MoreAboutPlantProps) {
  const [notes, setNotes] = useState(plant.notes_user);
  const [notesBaseline, setNotesBaseline] = useState(plant.notes_user);
  const [notesSaved, setNotesSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newInstruction, setNewInstruction] = useState('');

  const notesDirty = notes !== notesBaseline;

  const saveNotes = async () => {
    if (!notesDirty || busy) return;
    setBusy(true);
    setError(null);
    try {
      const db = await openDeezPlants();
      await setNotesUser(db, plant.plant_id, notesBaseline, notes, as_of);
      await onChanged();
      setNotesBaseline(notes);
      setNotesSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const updateNow = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const db = await openDeezPlants();
      const result = await commitUpdate(db, as_of);
      await onChanged();
      const updated = result.state.plants[plant.plant_id];
      if (updated) {
        setNotes(updated.notes_user);
        setNotesBaseline(updated.notes_user);
      }
      setNotesSaved(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addInstruction = async () => {
    if (!newInstruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const db = await openDeezPlants();
      await addCareInstruction(db, plant.plant_id, newInstruction, as_of);
      await onChanged();
      setNewInstruction('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeInstruction = async (instruction_id: InstructionId) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const db = await openDeezPlants();
      await deleteCareInstruction(db, plant.plant_id, instruction_id, as_of);
      await onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="more">
      <PlantChrome
        plant={{ plant_id: plant.plant_id, name: plant.name }}
        backLabel={backLabel}
        onBack={onBack}
        allPlants={allPlants}
        onNavigate={onNavigate}
        onOpenPlant={onOpenPlant}
      />

      <h1 className="more-title">More about this plant</h1>
      <p className="more-sub">{plant.name}</p>

      <section className="more-card">
        <span className="more-label">SOIL &amp; MEDIUM</span>
        <p className="more-line">{plant.soil ?? 'Not set.'}</p>
      </section>

      {/* Section 4, Reference — added 2026-09-08. Mostly species knowledge,
          which is why these are `editable_by: both`: ask the AI in a review
          round and they come back filled. Empty is a normal state and reads
          as empty; nothing here is ever invented to fill a gap. */}
      {REFERENCE_FIELDS.map(({ field, label, icon }) => (
        <section key={field} className="more-card">
          <div className="more-card-head">
            <span className="more-icon"><Icon name={icon} size={20} /></span>
            <span className="more-label">{label}</span>
          </div>
          <p className={plant[field] ? 'more-line' : 'more-line empty'}>
            {plant[field] ?? 'Nothing recorded. Ask the AI for this in your next review.'}
          </p>
        </section>
      ))}

      {error && <p className="more-error">{error}</p>}

      <section className="more-card">
        <span className="more-label">CARE INSTRUCTIONS</span>
        {plant.care_instructions.length === 0 ? (
          <p className="more-line dim">Nothing proposed or added yet.</p>
        ) : (
          <ul className="more-instructions">
            {plant.care_instructions.map((ins) => (
              <li key={ins.instruction_id} className="more-instruction">
                <div className="more-instruction-body">
                  <p className="more-instruction-text">{ins.text}</p>
                  <span className="more-instruction-meta">
                    {formatDayMonthYear(ins.added)} · {ins.source === 'ai' ? 'AI' : 'You'}
                  </span>
                </div>
                <button
                  type="button"
                  className="more-instruction-delete"
                  disabled={busy}
                  onClick={() => void removeInstruction(ins.instruction_id)}
                  aria-label="Delete this instruction"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="more-add-row">
          <input
            type="text"
            className="more-add-input"
            placeholder="Add your own, e.g. Rotate a quarter turn monthly"
            value={newInstruction}
            maxLength={200}
            onChange={(e) => setNewInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addInstruction(); }}
          />
          <button type="button" className="more-add-btn" disabled={!newInstruction.trim() || busy} onClick={() => void addInstruction()}>
            Add
          </button>
        </div>
      </section>

      <section className="more-card notes">
        <span className="more-label">NOTES</span>
        <span className="more-notes-badge">YOURS · never touched by import</span>
        <textarea
          className="more-notes-input"
          rows={5}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What you learn by looking — a draft, a quirk of this plant's spot, anything worth remembering."
        />
        {notesDirty && (
          <button type="button" className="more-notes-save" disabled={busy} onClick={() => void saveNotes()}>
            {busy ? 'Saving…' : 'Save note'}
          </button>
        )}
        {!notesDirty && notesSaved && (
          <div className="more-notes-pending">
            <p>Saved and waiting. Update folds it into the record, the same as a logged care event.</p>
            <button type="button" className="more-notes-update" disabled={busy} onClick={() => void updateNow()}>
              Update now
            </button>
          </div>
        )}
        {!notesDirty && !notesSaved && plant.pending_event_ids.length > 0 && (
          <div className="more-notes-pending">
            <p>{plant.pending_event_ids.length} change{plant.pending_event_ids.length === 1 ? '' : 's'} still waiting on this plant.</p>
            <button type="button" className="more-notes-update" disabled={busy} onClick={() => void updateNow()}>
              Update now
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
