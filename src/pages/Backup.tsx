import { useEffect, useState } from 'react';
import { openDeezPlants, META_KEY, type DeezDB } from '../db/schema';
import { sessionAudioBytes } from '../capture/recording';
import {
  exportEverything,
  exportRecord,
  formatBytes,
  parseStateFile,
  restoreEverything,
  restoreState,
  saveFile,
  type RestoreResult,
} from '../sync/stateTransfer';
import { Icon } from '../components/Icon';
import type { ISODate } from '../types/ids';
import './Backup.css';

/**
 * Back up and restore — FIELD_DEFINITIONS.md section 8.
 *
 * The screen exists because browser storage is per-origin and per-device and
 * nothing moves on its own. It is both the insurance policy and the way a
 * record gets from a laptop onto a phone.
 *
 * Two exports, for one reason: the fast one is fast enough to actually run.
 * The record is tens of kilobytes and irreplaceable; photos and audio are
 * megabytes and replaceable.
 */

export interface BackupProps {
  as_of: ISODate;
  backLabel: string;
  onBack: () => void;
  /** Re-read the store and rebuild — a restore changes everything. */
  onChanged: () => Promise<void> | void;
}

type Busy = null | 'record' | 'everything' | 'restore';

export default function Backup({ as_of, backLabel, onBack, onChanged }: BackupProps) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [restored, setRestored] = useState<RestoreResult | null>(null);

  /**
   * What a backup would carry, before you commit to making one.
   *
   * The app already knew which walks have transcripts and never said. A walk
   * with words needs no audio in the backup; a walk without has nothing else,
   * and both facts are worth seeing BEFORE you tap rather than inferring from
   * a file size afterwards.
   */
  const [walks, setWalks] = useState<{ total: number; transcribed: number; bytes: number } | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const db = await openDeezPlants();
        const sessions = await db.getAll('sessions');
        let bytes = 0;
        let transcribed = 0;
        for (const s of sessions) {
          if (s.transcript) { transcribed += 1; continue; }
          bytes += await sessionAudioBytes(db, s.session_id);
        }
        if (live) setWalks({ total: sessions.length, transcribed, bytes });
      } catch { /* the cards still work without the summary */ }
    })();
    return () => { live = false; };
  }, [restored]);

  const run = async (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setSaved(null);
    setRestored(null);
    try {
      await work();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /**
   * Remember when a backup was last made, for Home's row.
   *
   * Recorded on the save rather than on a confirmation, unlike a review
   * package. The asymmetry is deliberate: a package wrongly marked sent loses
   * evidence permanently, while a backup date that is a day optimistic only
   * misleads about recency — nothing is lost and the next save corrects it.
   */
  const noteBackup = async (db: DeezDB) => {
    const meta = await db.get('meta', META_KEY);
    if (meta) await db.put('meta', { ...meta, last_state_export: as_of }, META_KEY);
  };

  const doExportRecord = () => run('record', async () => {
    const db = await openDeezPlants();
    const out = await exportRecord(db, as_of);
    saveFile(out.blob, out.filename);
    await noteBackup(db);
    setSaved(`${out.filename} · ${out.plant_count} plants · ${out.event_count} entries · ${formatBytes(out.bytes)}`);
  });

  const doExportEverything = () => run('everything', async () => {
    const db = await openDeezPlants();
    const out = await exportEverything(db, as_of);
    saveFile(out.blob, out.filename);
    await noteBackup(db);
    setSaved(`${out.filename} · ${formatBytes(out.bytes)} including photos and audio`);
  });

  const doRestore = (file: File) => run('restore', async () => {
    const db = await openDeezPlants();
    const result = file.name.endsWith('.zip')
      ? await restoreEverything(db, file)
      : await restoreState(db, parseStateFile(await file.text()));
    setRestored(result);
    await onChanged();
  });

  return (
    <main className="backup">
      <button type="button" className="screen-back backup-back" onClick={onBack}>‹ {backLabel}</button>

      <h1 className="backup-title">Back up</h1>
      <p className="backup-sub">
        Everything lives in this browser, on this device. Nothing syncs on its
        own — a file is what carries it.
      </p>

      {error && <p className="backup-error">{error}</p>}
      {saved && <p className="backup-saved">Saved {saved}</p>}

      <section className="backup-card">
        <div className="backup-card-head">
          <span className="backup-icon"><Icon name="apply" size={22} /></span>
          <span className="backup-label">SAVE MY RECORD</span>
        </div>
        <p className="backup-body">
          Every plant, every watering, every rating. Small and quick — the part
          you could never get back if this device died.
        </p>
        <button
          type="button"
          className="backup-action primary"
          disabled={busy !== null}
          onClick={() => void doExportRecord()}
        >
          {busy === 'record' ? 'Saving…' : 'Save my record'}
        </button>
      </section>

      <section className="backup-card">
        <div className="backup-card-head">
          <span className="backup-icon"><Icon name="pkg" size={22} /></span>
          <span className="backup-label">SAVE EVERYTHING</span>
        </div>
        <p className="backup-body">
          The record, every photo, and the audio of any walk that has no
          transcript yet. Much larger, so this one is worth doing now and then
          rather than often.
        </p>
        {walks && walks.total > 0 && (
          <p className={walks.bytes > 0 ? 'backup-walks warn' : 'backup-walks'}>
            {walks.transcribed === walks.total
              ? `All ${walks.total} walk${walks.total === 1 ? '' : 's'} transcribed — no audio needed.`
              : `${walks.total - walks.transcribed} of ${walks.total} walk${walks.total === 1 ? '' : 's'} `
                + `still ${walks.total - walks.transcribed === 1 ? 'has' : 'have'} no transcript, `
                + `so ${walks.total - walks.transcribed === 1 ? 'its' : 'their'} audio travels — ${formatBytes(walks.bytes)}. `
                + `Transcribe ${walks.total - walks.transcribed === 1 ? 'it' : 'them'} first and this backup gets much smaller.`}
          </p>
        )}
        <button
          type="button"
          className="backup-action"
          disabled={busy !== null}
          onClick={() => void doExportEverything()}
        >
          {busy === 'everything' ? 'Building…' : 'Save everything'}
        </button>
      </section>

      <section className="backup-card">
        <div className="backup-card-head">
          <span className="backup-icon"><Icon name="add" size={22} /></span>
          <span className="backup-label">RESTORE</span>
        </div>
        <p className="backup-body">
          Open a file saved from this app — on this device or another one.
          Nothing is deleted or overwritten: anything already here stays, and
          only what is missing is added. Opening the same file twice is safe.
        </p>
        <input
          className="backup-file"
          type="file"
          accept=".json,.zip,application/json,application/zip"
          disabled={busy !== null}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void doRestore(file);
          }}
        />
        {busy === 'restore' && <p className="backup-body">Reading…</p>}
      </section>

      {restored && (
        <section className="backup-card done">
          <span className="backup-label">RESTORED</span>
          <p className="backup-body">
            From {restored.from_device}, saved {restored.exported}.
          </p>
          <ul className="backup-tally">
            <li><strong>{restored.plants_added}</strong> plants added
              {restored.plants_already_here > 0 && <> · {restored.plants_already_here} already here</>}</li>
            <li><strong>{restored.events_added}</strong> entries added
              {restored.events_already_here > 0 && <> · {restored.events_already_here} already here</>}</li>
            {restored.media_added > 0 && <li><strong>{restored.media_added}</strong> photos added</li>}
            {restored.sessions_added > 0 && <li><strong>{restored.sessions_added}</strong> walks added</li>}
            {restored.registry_taken && <li>Rooms and planters taken from the file</li>}
          </ul>
        </section>
      )}

      <p className="backup-note">
        Where the file lives is up to you — iCloud Drive, Dropbox, or emailed
        to yourself. The app only hands it over. Audio and photos never leave
        this device unless you carry them.
      </p>
    </main>
  );
}
