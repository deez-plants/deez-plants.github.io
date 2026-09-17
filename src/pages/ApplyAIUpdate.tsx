import { useState } from 'react';
import type { DerivedState } from '../types/derived';
import type { ISODate } from '../types/ids';
import type { ReviewRow } from '../types/package';
import { openDeezPlants } from '../db/schema';
import { validateUpdateFile } from '../package/validate';
import { applyUpdateFile } from '../package/import';
import { formatDayMonthYear } from '../lib/dates';
import './ApplyAIUpdate.css';

/**
 * DESIGN_REFERENCE.md screen 20. "Import one structured update file. Nothing
 * changes until you approve it." A file failing any of section 11's checks
 * is rejected whole, with the reason named — that happens before the review
 * table ever renders, so there is no partial or "mostly valid" state to
 * design for.
 *
 * **Select all exists, and that is a knowing reversal of rule 4** ("approval
 * is per row … no apply-all button, ever"), made by the owner on 2026-09-16
 * after the first real review. Their reasoning, and it is right: the
 * substantive review now happens in conversation BEFORE the update file is
 * generated, so by the time this table renders the argument is over and the
 * rule was making them re-approve twenty-two decisions they had already
 * argued through. What rule 4 was actually protecting — that no change is
 * applied the owner has not seen, and that any single row can be rejected on
 * its own — is untouched.
 *
 * So: every row is still listed, still shows current against proposed with a
 * reason, still toggles on its own, and rows still arrive UNSELECTED. One tap
 * takes the lot; zero taps must not, because a mis-tap on Apply would then
 * accept everything unread. That asymmetry is the whole of the safety here.
 */

export interface ApplyAIUpdateProps {
  state: DerivedState;
  as_of: ISODate;
  backLabel: string;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
}

type Screen =
  | { kind: 'drop' }
  | { kind: 'rejected'; reason: string }
  | { kind: 'review'; package_id: string; rows: ReviewRow[]; unaddressed: string[]; notes: string | null; approved: Set<number> }
  | { kind: 'applying' }
  | { kind: 'done'; accepted: number; rejected: number };

export default function ApplyAIUpdate({ state, as_of, backLabel, onBack, onChanged }: ApplyAIUpdateProps) {
  const [screen, setScreen] = useState<Screen>({ kind: 'drop' });
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadText = async (text: string) => {
    setError(null);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      setScreen({ kind: 'rejected', reason: 'That file is not valid JSON.' });
      return;
    }
    try {
      const db = await openDeezPlants();
      const [packages, appliedUpdates, events] = await Promise.all([
        db.getAll('packages'),
        db.getAll('applied_updates'),
        db.getAll('events'),
      ]);
      const result = validateUpdateFile(raw, { state, packages, appliedUpdates, events });
      if (!result.ok) {
        setScreen({ kind: 'rejected', reason: result.reason });
        return;
      }
      setScreen({
        kind: 'review',
        package_id: (raw as { package_id: string }).package_id,
        rows: result.rows,
        unaddressed: result.unaddressed,
        notes: result.notes,
        approved: new Set(),
      });
    } catch (e: unknown) {
      setScreen({ kind: 'rejected', reason: e instanceof Error ? e.message : String(e) });
    }
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => void loadText(String(reader.result ?? ''));
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  };

  const toggleRow = (i: number) => {
    if (screen.kind !== 'review') return;
    const approved = new Set(screen.approved);
    if (approved.has(i)) approved.delete(i); else approved.add(i);
    setScreen({ ...screen, approved });
  };

  const selectAll = () => {
    if (screen.kind !== 'review') return;
    setScreen({ ...screen, approved: new Set(screen.rows.map((_, i) => i)) });
  };

  const clearAll = () => {
    if (screen.kind !== 'review') return;
    setScreen({ ...screen, approved: new Set() });
  };

  const apply = async () => {
    if (screen.kind !== 'review') return;
    const approvedRows = screen.rows.filter((_, i) => screen.approved.has(i));
    setScreen({ kind: 'applying' });
    try {
      const db = await openDeezPlants();
      const outcome = await applyUpdateFile(db, screen.package_id, screen.rows.length, approvedRows, as_of);
      await onChanged();
      setScreen({ kind: 'done', accepted: outcome.accepted_count, rejected: outcome.rejected_count });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setScreen({ kind: 'rejected', reason: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="apply">
      <button type="button" className="screen-back apply-back" onClick={onBack}>‹ {backLabel}</button>

      <h1 className="apply-title">Apply AI update</h1>

      {screen.kind === 'drop' && (
        <>
          <p className="apply-sub">Import one structured update file. Nothing changes until you approve it.</p>
          <label className="apply-drop">
            <span className="apply-drop-title">Drop the update file</span>
            <span className="apply-drop-sub">Or tap to browse</span>
            <input
              type="file"
              accept="application/json"
              className="apply-file-input"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
          </label>
          <p className="apply-paste-label">Or paste the update JSON</p>
          <textarea
            className="apply-paste"
            rows={6}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="{ &quot;package_id&quot;: ..."
          />
          <button type="button" className="apply-load" disabled={!pasted.trim()} onClick={() => void loadText(pasted)}>
            Load pasted JSON
          </button>
          {error && <p className="apply-error">{error}</p>}
        </>
      )}

      {screen.kind === 'rejected' && (
        <div className="apply-rejected">
          <span className="apply-rejected-label">REJECTED</span>
          <p>{screen.reason}</p>
        </div>
      )}
      {screen.kind === 'rejected' && (
        <button type="button" className="apply-load" onClick={() => { setPasted(''); setScreen({ kind: 'drop' }); }}>
          Try another file
        </button>
      )}

      {screen.kind === 'review' && (
        <>
          <p className="apply-sub">
            {screen.rows.length} proposed change{screen.rows.length === 1 ? '' : 's'} from {screen.package_id}.
            Approve the ones you want — nothing is applied until you tap Apply below.
          </p>
          {screen.notes && <p className="apply-notes">"{screen.notes}"</p>}
          {/* Select all, and nothing more. Rows still arrive unselected: one
              tap to take the lot, zero taps should not. */}
          <div className="apply-bulk">
            <button type="button" className="apply-bulk-btn" onClick={selectAll}>
              Select all {screen.rows.length}
            </button>
            <button
              type="button"
              className="apply-bulk-btn"
              onClick={clearAll}
              disabled={screen.approved.size === 0}
            >
              Clear
            </button>
            {screen.approved.size > 0 && (
              <span className="apply-bulk-count">{screen.approved.size} selected</span>
            )}
          </div>
          <ul className="apply-rows">
            {screen.rows.map((row, i) => (
              <li key={i} className={screen.approved.has(i) ? 'apply-row on' : 'apply-row'}>
                <button type="button" className="apply-row-toggle" onClick={() => toggleRow(i)}>
                  <span className="apply-row-check" aria-hidden="true">{screen.approved.has(i) ? '✓' : ''}</span>
                  <span className="apply-row-body">
                    <span className="apply-row-head">{row.plant_name} · {row.field}</span>
                    <span className="apply-row-values">
                      <span className="apply-row-current">{row.current_display}</span>
                      {' → '}
                      <span className="apply-row-proposed">{row.proposed_display}</span>
                    </span>
                    <span className="apply-row-reason">{row.reason}</span>
                    {row.conflict && (
                      <span className="apply-row-conflict">
                        You changed this on {formatDayMonthYear(row.conflict.your_date)} to "{row.conflict.your_value}" —
                        the AI didn't see that. Check before approving.
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {screen.unaddressed.length > 0 && (
            <p className="apply-unaddressed">
              No changes proposed for {screen.unaddressed.length} plant{screen.unaddressed.length === 1 ? '' : 's'}
              ({screen.unaddressed.join(', ')}).
            </p>
          )}
          <button type="button" className="apply-submit" onClick={() => void apply()}>
            Apply {screen.approved.size} approved change{screen.approved.size === 1 ? '' : 's'}
          </button>
        </>
      )}

      {screen.kind === 'applying' && <p className="apply-sub">Applying…</p>}

      {screen.kind === 'done' && (
        <div className="apply-done">
          <p>
            {screen.accepted} change{screen.accepted === 1 ? '' : 's'} applied, {screen.rejected} left as proposed
            and not written. Applied changes are pending, same as a logged
            care event — Update folds them in.
          </p>
        </div>
      )}
    </main>
  );
}
